package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

// Sender sends emails via the Resend API.
type Sender struct {
	apiKey string
	from   string
}

// NewSender creates a Sender. If apiKey is empty, emails are logged but not sent.
func NewSender(apiKey, fromAddress string) *Sender {
	return &Sender{apiKey: apiKey, from: fromAddress}
}

type sendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// Send delivers an email. If no API key is configured, logs the email instead.
func (s *Sender) Send(to, subject, html string) error {
	if s.apiKey == "" {
		slog.Info("email (dry run — no RESEND_API_KEY)", "subject", subject)
		return nil
	}

	body, err := json.Marshal(sendRequest{
		From:    s.from,
		To:      []string{to},
		Subject: subject,
		HTML:    html,
	})
	if err != nil {
		return fmt.Errorf("marshalling email: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("building email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("sending email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend API returned %d: %s", resp.StatusCode, respBody)
	}

	slog.Info("email sent", "subject", subject)
	return nil
}

// SendInvitation sends a project invitation email.
func (s *Sender) SendInvitation(to, inviteURL, projectName, orgName, roleName string) error {
	subject := fmt.Sprintf("You've been invited to %s on PlanA", projectName)
	html := fmt.Sprintf(`
		<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
			<h2 style="color: #1d4ed8; margin-bottom: 4px;">Plan<span style="color: #111827;">A</span></h2>
			<p style="color: #6b7280; font-size: 14px;">You've been invited to join a project</p>
			<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
				<p style="color: #6b7280; font-size: 13px; margin: 0;">%s</p>
				<p style="color: #111827; font-size: 18px; font-weight: 600; margin: 4px 0;">%s</p>
				<p style="color: #2563eb; font-size: 14px; margin: 4px 0;">%s</p>
			</div>
			<a href="%s" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 500;">
				Accept Invitation
			</a>
			<p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
				This invitation expires in 7 days. If you didn't expect this, you can ignore it.
			</p>
		</div>
	`, orgName, projectName, roleName, inviteURL)

	return s.Send(to, subject, html)
}
