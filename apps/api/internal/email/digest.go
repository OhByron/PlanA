package email

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DigestRunner sends daily digest emails to users who have opted in.
type DigestRunner struct {
	db     *pgxpool.Pool
	sender *Sender
}

func NewDigestRunner(db *pgxpool.Pool, sender *Sender) *DigestRunner {
	return &DigestRunner{db: db, sender: sender}
}

// Start launches the digest scheduler. It runs once daily at 7 AM UTC.
func (d *DigestRunner) Start(ctx context.Context) {
	go func() {
		for {
			now := time.Now().UTC()
			// Next run at 7 AM UTC
			next := time.Date(now.Year(), now.Month(), now.Day(), 7, 0, 0, 0, time.UTC)
			if now.After(next) {
				next = next.Add(24 * time.Hour)
			}
			wait := time.Until(next)
			slog.Info("digest: next run scheduled", "at", next, "in", wait.Round(time.Minute))

			select {
			case <-ctx.Done():
				slog.Info("digest: scheduler stopped")
				return
			case <-time.After(wait):
				d.Run(ctx)
			}
		}
	}()
}

// Run executes one digest cycle — gathers data and sends emails.
func (d *DigestRunner) Run(ctx context.Context) {
	slog.Info("digest: starting daily digest run")

	// Get all users who have opted in to daily digest
	rows, err := d.db.Query(ctx, `
		SELECT u.id, u.email, u.name
		FROM users u
		WHERE u.daily_digest = true AND u.email != ''
	`)
	if err != nil {
		slog.Error("digest: failed to query users", "error", err)
		return
	}
	defer rows.Close()

	type user struct {
		id, email, name string
	}
	var users []user
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.id, &u.email, &u.name); err == nil {
			users = append(users, u)
		}
	}

	sent := 0
	for _, u := range users {
		html, hasContent := d.buildDigest(ctx, u.id, u.name)
		if !hasContent {
			continue
		}
		if err := d.sender.Send(u.email, "Your PlanA Daily Digest", html); err != nil {
			slog.Error("digest: failed to send", "user_id", u.id, "error", err)
			continue
		}
		sent++
	}

	slog.Info("digest: run complete", "users_checked", len(users), "emails_sent", sent)
}

// buildDigest creates the HTML email for a single user. Returns (html, hasContent).
func (d *DigestRunner) buildDigest(ctx context.Context, userID, userName string) (string, bool) {
	var sections []string

	// 1. Items assigned to this user that were updated in the last 24h
	since := time.Now().Add(-24 * time.Hour)
	rows, err := d.db.Query(ctx, `
		SELECT wi.title, ws.name AS state_name, wi.priority, p.name AS project_name
		FROM work_items wi
		JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		JOIN project_members pm ON pm.id = wi.assignee_id
		JOIN projects p ON p.id = wi.project_id
		WHERE pm.user_id = $1
		  AND wi.updated_at > $2
		  AND ws.is_terminal = FALSE AND wi.is_cancelled = FALSE
		ORDER BY p.name, wi.priority
	`, userID, since)
	if err != nil && err != pgx.ErrNoRows {
		slog.Warn("digest: failed to query updated items", "user", userID, "error", err)
	}

	type updatedItem struct {
		title, status, priority, project string
	}
	var updated []updatedItem
	if rows != nil {
		for rows.Next() {
			var item updatedItem
			if rows.Scan(&item.title, &item.status, &item.priority, &item.project) == nil {
				updated = append(updated, item)
			}
		}
		rows.Close()
	}

	if len(updated) > 0 {
		var items strings.Builder
		for _, item := range updated {
			items.WriteString(fmt.Sprintf(
				`<tr><td style="padding:4px 8px;font-size:13px;">%s</td><td style="padding:4px 8px;font-size:13px;">%s</td><td style="padding:4px 8px;font-size:13px;">%s</td><td style="padding:4px 8px;font-size:13px;">%s</td></tr>`,
				item.project, item.title, item.status, item.priority,
			))
		}
		sections = append(sections, fmt.Sprintf(`
			<h3 style="color:#111827;font-size:15px;margin:16px 0 8px;">Your Active Items (%d updated)</h3>
			<table style="width:100%%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;">
				<tr style="background:#f9fafb;">
					<th style="padding:6px 8px;font-size:12px;text-align:left;color:#6b7280;">Project</th>
					<th style="padding:6px 8px;font-size:12px;text-align:left;color:#6b7280;">Item</th>
					<th style="padding:6px 8px;font-size:12px;text-align:left;color:#6b7280;">Status</th>
					<th style="padding:6px 8px;font-size:12px;text-align:left;color:#6b7280;">Priority</th>
				</tr>
				%s
			</table>
		`, len(updated), items.String()))
	}

	// 2. Notifications from the last 24h
	var notifCount int
	_ = d.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND created_at > $2 AND read_at IS NULL`,
		userID, since,
	).Scan(&notifCount)

	if notifCount > 0 {
		sections = append(sections, fmt.Sprintf(`
			<p style="color:#6b7280;font-size:13px;margin:12px 0;">
				You have <strong>%d unread notification%s</strong> from the last 24 hours.
			</p>
		`, notifCount, func() string {
			if notifCount == 1 {
				return ""
			}
			return "s"
		}()))
	}

	if len(sections) == 0 {
		return "", false
	}

	html := fmt.Sprintf(`
		<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;">
			<h2 style="color:#1d4ed8;margin-bottom:4px;">Plan<span style="color:#111827;">A</span></h2>
			<p style="color:#6b7280;font-size:14px;">Good morning, %s. Here's your daily digest.</p>
			%s
			<p style="color:#9ca3af;font-size:11px;margin-top:24px;">
				You're receiving this because daily digest is enabled on your account.
			</p>
		</div>
	`, userName, strings.Join(sections, ""))

	return html, true
}
