package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

// TransitionHookHandlers manages workflow transition hooks.
type TransitionHookHandlers struct {
	db DBPOOL
}

func NewTransitionHookHandlers(db DBPOOL) *TransitionHookHandlers {
	return &TransitionHookHandlers{db: db}
}

type TransitionHook struct {
	ID             string          `json:"id"`
	OrgID          string          `json:"org_id"`
	TriggerStateID string          `json:"trigger_state_id"`
	TriggerState   *WorkflowState  `json:"trigger_state,omitempty"`
	ActionType     string          `json:"action_type"`
	Config         json.RawMessage `json:"config"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func (h *TransitionHookHandlers) List(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var exists bool
	_ = h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2)`,
		orgID, claims.UserID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusForbidden, "forbidden", "Not a member of this organization")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT th.id, th.org_id, th.trigger_state_id, th.action_type, th.config,
		        th.created_at, th.updated_at,
		        ws.name, ws.slug, ws.color
		   FROM workflow_transition_hooks th
		   JOIN workflow_states ws ON ws.id = th.trigger_state_id
		  WHERE th.org_id = $1
		  ORDER BY ws.position`, orgID)
	if err != nil {
		slog.Error("transition_hooks.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list hooks")
		return
	}
	defer rows.Close()

	type hookResponse struct {
		ID             string          `json:"id"`
		OrgID          string          `json:"org_id"`
		TriggerStateID string          `json:"trigger_state_id"`
		StateName      string          `json:"state_name"`
		StateSlug      string          `json:"state_slug"`
		StateColor     string          `json:"state_color"`
		ActionType     string          `json:"action_type"`
		Config         json.RawMessage `json:"config"`
		CreatedAt      time.Time       `json:"created_at"`
		UpdatedAt      time.Time       `json:"updated_at"`
	}

	hooks := []hookResponse{}
	for rows.Next() {
		var h hookResponse
		if err := rows.Scan(&h.ID, &h.OrgID, &h.TriggerStateID, &h.ActionType, &h.Config,
			&h.CreatedAt, &h.UpdatedAt,
			&h.StateName, &h.StateSlug, &h.StateColor); err != nil {
			slog.Error("transition_hooks.List: scan failed", "error", err)
			continue
		}
		hooks = append(hooks, h)
	}
	writeJSON(w, http.StatusOK, hooks)
}

type createHookRequest struct {
	TriggerStateID string          `json:"trigger_state_id"`
	ActionType     string          `json:"action_type"`
	Config         json.RawMessage `json:"config"`
}

func (h *TransitionHookHandlers) Create(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	// Admin check
	var role string
	err := h.db.QueryRow(r.Context(),
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, claims.UserID).Scan(&role)
	if err != nil || role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only org admins can manage hooks")
		return
	}

	var body createHookRequest
	if !readJSON(w, r, &body) {
		return
	}

	if body.TriggerStateID == "" || body.ActionType == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "trigger_state_id and action_type are required")
		return
	}

	var id string
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO workflow_transition_hooks (org_id, trigger_state_id, action_type, config)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		orgID, body.TriggerStateID, body.ActionType, body.Config,
	).Scan(&id)
	if err != nil {
		slog.Error("transition_hooks.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create hook")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (h *TransitionHookHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	hookID := chi.URLParam(r, "hookID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var role string
	err := h.db.QueryRow(r.Context(),
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, claims.UserID).Scan(&role)
	if err != nil || role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only org admins can manage hooks")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`DELETE FROM workflow_transition_hooks WHERE id = $1 AND org_id = $2`, hookID, orgID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Hook not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
