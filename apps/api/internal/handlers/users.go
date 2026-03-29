package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
)

// UserHandlers handles requests for the authenticated user's own profile.
type UserHandlers struct {
	db   *pgxpool.Pool
	auth *auth.Service
}

func NewUserHandlers(db *pgxpool.Pool, authSvc *auth.Service) *UserHandlers {
	return &UserHandlers{db: db, auth: authSvc}
}

type meResponse struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
}

// Me returns the profile of the currently authenticated user.
func (h *UserHandlers) Me(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	var resp meResponse
	err := h.db.QueryRow(r.Context(), `
		SELECT id, email, name, avatar_url, created_at
		FROM users
		WHERE id = $1
	`, claims.UserID).Scan(&resp.ID, &resp.Email, &resp.Name, &resp.AvatarURL, &resp.CreatedAt)
	if err != nil {
		slog.Error("me: db query failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to fetch user profile")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}
