package webhookdelivery

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/PlanA/internal/safehttp"
)

// Payload is the structure sent to webhook URLs.
type Payload struct {
	Event     string         `json:"event"`
	Timestamp string         `json:"timestamp"`
	ProjectID string         `json:"project_id"`
	Data      map[string]any `json:"data"`
}

// Webhook represents a registered outbound webhook.
type Webhook struct {
	ID         string
	URL        string
	Secret     string
	EventTypes []string
}

// Deliverer sends webhook payloads to registered URLs.
type Deliverer struct {
	db      *pgxpool.Pool
	client  *http.Client
	baseCtx context.Context
	cancel  context.CancelFunc
}

// NewDeliverer creates a new webhook deliverer. Call Shutdown during graceful
// shutdown to cancel in-flight retries.
func NewDeliverer(db *pgxpool.Pool) *Deliverer {
	ctx, cancel := context.WithCancel(context.Background())
	return &Deliverer{
		db:      db,
		client:  safehttp.NewClient(10 * time.Second),
		baseCtx: ctx,
		cancel:  cancel,
	}
}

// Shutdown cancels the base context, interrupting any in-progress delivery
// retries. Safe to call multiple times.
func (d *Deliverer) Shutdown() { d.cancel() }

// DeliverEvent finds all webhooks registered for the given event type in the
// project and delivers the payload asynchronously.
func (d *Deliverer) DeliverEvent(projectID, eventType string, data map[string]any) {
	go func() {
		// Lookup runs against the base context so a server shutdown cancels
		// the query but the parent goroutine doesn't cancel children on return.
		queryCtx, cancel := context.WithTimeout(d.baseCtx, 30*time.Second)
		defer cancel()

		rows, err := d.db.Query(queryCtx,
			`SELECT id, url, secret FROM outbound_webhooks
			 WHERE project_id = $1 AND enabled = true AND $2 = ANY(event_types)`,
			projectID, eventType)
		if err != nil {
			slog.Error("webhook: query failed", "error", err)
			return
		}
		defer rows.Close()

		payload := Payload{
			Event:     eventType,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			ProjectID: projectID,
			Data:      data,
		}

		for rows.Next() {
			var wh Webhook
			if err := rows.Scan(&wh.ID, &wh.URL, &wh.Secret); err != nil {
				continue
			}
			go d.deliver(wh, payload)
		}
	}()
}

// deliver sends the payload to a single webhook with retry.
func (d *Deliverer) deliver(wh Webhook, payload Payload) {
	if err := safehttp.CheckExternal(wh.URL); err != nil {
		slog.Warn("webhook: blocked unsafe URL", "webhookID", wh.ID, "url", wh.URL, "error", err)
		return
	}

	body, _ := json.Marshal(payload)

	// Compute HMAC signature
	mac := hmac.New(sha256.New, []byte(wh.Secret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	// Record the delivery row up front so we can update it on each attempt.
	// If the audit insert fails we abort the delivery entirely — sending without
	// a row would silently no-op every recordSuccess/recordFailure UPDATE.
	var deliveryID string
	if err := d.db.QueryRow(d.baseCtx,
		`INSERT INTO outbound_webhook_deliveries (webhook_id, event_type, payload)
		 VALUES ($1, $2, $3) RETURNING id`,
		wh.ID, payload.Event, body).Scan(&deliveryID); err != nil {
		slog.Error("webhook: failed to record delivery, skipping send",
			"webhookID", wh.ID, "url", wh.URL, "error", err)
		return
	}

	delays := []time.Duration{0, 1 * time.Second, 5 * time.Second, 30 * time.Second}

	for attempt, delay := range delays {
		if delay > 0 {
			select {
			case <-time.After(delay):
			case <-d.baseCtx.Done():
				d.recordFailure(deliveryID, attempt+1, 0, "", "delivery cancelled: "+d.baseCtx.Err().Error())
				return
			}
		}

		req, err := http.NewRequestWithContext(d.baseCtx, http.MethodPost, wh.URL, bytes.NewReader(body))
		if err != nil {
			d.recordFailure(deliveryID, attempt+1, 0, "", err.Error())
			continue
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-PlanA-Event", payload.Event)
		req.Header.Set("X-PlanA-Signature", signature)
		req.Header.Set("X-PlanA-Delivery", deliveryID)
		req.Header.Set("User-Agent", "PlanA-Webhook/1.0")

		resp, err := d.client.Do(req)
		if err != nil {
			d.recordFailure(deliveryID, attempt+1, 0, "", err.Error())
			if d.baseCtx.Err() != nil {
				return
			}
			continue
		}

		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			d.recordSuccess(deliveryID, attempt+1, resp.StatusCode, string(respBody))
			return
		}

		d.recordFailure(deliveryID, attempt+1, resp.StatusCode, string(respBody), "")
		slog.Warn("webhook: delivery failed",
			"webhookID", wh.ID, "url", wh.URL, "status", resp.StatusCode, "attempt", attempt+1)
	}

	slog.Error("webhook: all retries exhausted", "webhookID", wh.ID, "url", wh.URL)
}

func (d *Deliverer) recordSuccess(deliveryID string, attempts, statusCode int, responseBody string) {
	_, _ = d.db.Exec(context.Background(),
		`UPDATE outbound_webhook_deliveries
		 SET status_code = $1, response_body = $2, attempts = $3, delivered_at = NOW()
		 WHERE id = $4`,
		statusCode, truncate(responseBody, 1024), attempts, deliveryID)
}

func (d *Deliverer) recordFailure(deliveryID string, attempts, statusCode int, responseBody, errMsg string) {
	msg := errMsg
	if msg == "" {
		msg = fmt.Sprintf("HTTP %d", statusCode)
	}
	_, _ = d.db.Exec(context.Background(),
		`UPDATE outbound_webhook_deliveries
		 SET status_code = $1, response_body = $2, error = $3, attempts = $4
		 WHERE id = $5`,
		statusCode, truncate(responseBody, 1024), msg, attempts, deliveryID)
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen]
	}
	return s
}
