package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/PlanA/internal/auth"
	"github.com/OhByron/PlanA/internal/vcs"
)

// OutboundWebhookHandlers manages outbound webhook registrations.
type OutboundWebhookHandlers struct {
	db DBPOOL
}

func NewOutboundWebhookHandlers(db DBPOOL) *OutboundWebhookHandlers {
	return &OutboundWebhookHandlers{db: db}
}

type outboundWebhook struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"project_id"`
	URL         string    `json:"url"`
	EventTypes  []string  `json:"event_types"`
	Enabled     bool      `json:"enabled"`
	Description *string   `json:"description"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// List returns all webhooks for a project.
func (h *OutboundWebhookHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, project_id, url, event_types, enabled, description, created_by, created_at, updated_at
		   FROM outbound_webhooks WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		slog.Error("outbound_webhooks.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list webhooks")
		return
	}
	defer rows.Close()

	webhooks := []outboundWebhook{}
	for rows.Next() {
		var wh outboundWebhook
		if err := rows.Scan(&wh.ID, &wh.ProjectID, &wh.URL, &wh.EventTypes, &wh.Enabled,
			&wh.Description, &wh.CreatedBy, &wh.CreatedAt, &wh.UpdatedAt); err != nil {
			slog.Error("outbound_webhooks.List: scan failed", "error", err)
			continue
		}
		webhooks = append(webhooks, wh)
	}
	writeJSON(w, http.StatusOK, webhooks)
}

// Create registers a new outbound webhook.
func (h *OutboundWebhookHandlers) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins can manage webhooks")
		return
	}

	var body struct {
		URL         string   `json:"url"`
		EventTypes  []string `json:"event_types"`
		Description *string  `json:"description"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	if body.URL == "" || len(body.EventTypes) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "url and event_types are required")
		return
	}

	secret, err := vcs.GenerateWebhookSecret()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to generate secret")
		return
	}

	var wh outboundWebhook
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO outbound_webhooks (project_id, url, secret, event_types, description, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, project_id, url, event_types, enabled, description, created_by, created_at, updated_at`,
		projectID, body.URL, secret, body.EventTypes, body.Description, claims.UserID,
	).Scan(&wh.ID, &wh.ProjectID, &wh.URL, &wh.EventTypes, &wh.Enabled,
		&wh.Description, &wh.CreatedBy, &wh.CreatedAt, &wh.UpdatedAt)
	if err != nil {
		slog.Error("outbound_webhooks.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create webhook")
		return
	}

	// Return with secret (only shown once)
	type createResponse struct {
		outboundWebhook
		Secret string `json:"secret"`
	}
	writeJSON(w, http.StatusCreated, createResponse{outboundWebhook: wh, Secret: secret})
}

// Update modifies an outbound webhook.
func (h *OutboundWebhookHandlers) Update(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	webhookID := chi.URLParam(r, "webhookID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins can manage webhooks")
		return
	}

	var body struct {
		URL         *string   `json:"url"`
		EventTypes  *[]string `json:"event_types"`
		Enabled     *bool     `json:"enabled"`
		Description *string   `json:"description"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if body.URL != nil {
		fields = append(fields, fmt.Sprintf("url = $%d", argN))
		args = append(args, *body.URL)
		argN++
	}
	if body.EventTypes != nil {
		fields = append(fields, fmt.Sprintf("event_types = $%d", argN))
		args = append(args, *body.EventTypes)
		argN++
	}
	if body.Enabled != nil {
		fields = append(fields, fmt.Sprintf("enabled = $%d", argN))
		args = append(args, *body.Enabled)
		argN++
	}
	if body.Description != nil {
		fields = append(fields, fmt.Sprintf("description = $%d", argN))
		args = append(args, *body.Description)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	args = append(args, webhookID, projectID)
	query := fmt.Sprintf(
		`UPDATE outbound_webhooks SET %s WHERE id = $%d AND project_id = $%d
		 RETURNING id, project_id, url, event_types, enabled, description, created_by, created_at, updated_at`,
		joinFields(fields), argN, argN+1)

	var wh outboundWebhook
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&wh.ID, &wh.ProjectID, &wh.URL, &wh.EventTypes, &wh.Enabled,
		&wh.Description, &wh.CreatedBy, &wh.CreatedAt, &wh.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		return
	}
	writeJSON(w, http.StatusOK, wh)
}

// Delete removes an outbound webhook.
func (h *OutboundWebhookHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	webhookID := chi.URLParam(r, "webhookID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins can manage webhooks")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`DELETE FROM outbound_webhooks WHERE id = $1 AND project_id = $2`, webhookID, projectID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Deliveries lists recent deliveries for a webhook.
func (h *OutboundWebhookHandlers) Deliveries(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	webhookID := chi.URLParam(r, "webhookID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	// Verify webhook belongs to project
	var exists bool
	_ = h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM outbound_webhooks WHERE id = $1 AND project_id = $2)`,
		webhookID, projectID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		return
	}

	type delivery struct {
		ID           string          `json:"id"`
		EventType    string          `json:"event_type"`
		StatusCode   *int            `json:"status_code"`
		ResponseBody *string         `json:"response_body"`
		Error        *string         `json:"error"`
		Attempts     int             `json:"attempts"`
		DeliveredAt  *time.Time      `json:"delivered_at"`
		CreatedAt    time.Time       `json:"created_at"`
		Payload      json.RawMessage `json:"payload"`
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, event_type, status_code, response_body, error, attempts, delivered_at, created_at, payload
		   FROM outbound_webhook_deliveries WHERE webhook_id = $1
		   ORDER BY created_at DESC LIMIT 20`, webhookID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list deliveries")
		return
	}
	defer rows.Close()

	deliveries := []delivery{}
	for rows.Next() {
		var d delivery
		if err := rows.Scan(&d.ID, &d.EventType, &d.StatusCode, &d.ResponseBody, &d.Error,
			&d.Attempts, &d.DeliveredAt, &d.CreatedAt, &d.Payload); err != nil {
			continue
		}
		deliveries = append(deliveries, d)
	}
	writeJSON(w, http.StatusOK, deliveries)
}

// Test sends a test ping event to the webhook.
func (h *OutboundWebhookHandlers) Test(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	webhookID := chi.URLParam(r, "webhookID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var url, secret string
	err := h.db.QueryRow(r.Context(),
		`SELECT url, secret FROM outbound_webhooks WHERE id = $1 AND project_id = $2`,
		webhookID, projectID).Scan(&url, &secret)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "Webhook not found")
		} else {
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to fetch webhook")
		}
		return
	}

	// Send a test ping
	payload := map[string]any{
		"event":      "ping",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"project_id": projectID,
		"data":       map[string]string{"message": "Test delivery from PlanA"},
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-PlanA-Event", "ping")
	req.Header.Set("User-Agent", "PlanA-Webhook/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	writeJSON(w, http.StatusOK, map[string]any{
		"success":     resp.StatusCode >= 200 && resp.StatusCode < 300,
		"status_code": resp.StatusCode,
	})
}
