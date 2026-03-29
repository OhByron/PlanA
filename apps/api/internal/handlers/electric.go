package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
)

// ElectricHandlers issues Electric SQL sync tokens for the authenticated user.
type ElectricHandlers struct {
	db   *pgxpool.Pool
	auth *auth.Service
}

func NewElectricHandlers(db *pgxpool.Pool, authSvc *auth.Service) *ElectricHandlers {
	return &ElectricHandlers{db: db, auth: authSvc}
}

// Token issues a short-lived JWT for Electric SQL sync scoped to the requested org.
//
// Query params:
//
//	org_id — the organisation UUID the client wants to sync data for.
//
// The handler verifies the authenticated user is a member of the requested org,
// then issues an Electric JWT with the org_id and role claims.
func (h *ElectricHandlers) Token(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	orgID := r.URL.Query().Get("org_id")
	if orgID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "org_id query parameter is required")
		return
	}

	var role string
	err := h.db.QueryRow(r.Context(), `
		SELECT role FROM organization_members
		WHERE organization_id = $1 AND user_id = $2
	`, orgID, claims.UserID).Scan(&role)

	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusForbidden, "not_a_member", "You are not a member of this organisation")
		return
	}
	if err != nil {
		slog.Error("electric token: membership check failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to verify organisation membership")
		return
	}

	token, err := h.auth.IssueElectricToken(claims.UserID, orgID, role)
	if err != nil {
		slog.Error("electric token: issue failed", "error", err)
		writeError(w, http.StatusInternalServerError, "token_error", "Failed to issue sync token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}
