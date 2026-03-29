package handlers

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
)

// TeamHandlers handles CRUD for teams within an organisation.
type TeamHandlers struct {
	db *pgxpool.Pool
}

func NewTeamHandlers(db *pgxpool.Pool) *TeamHandlers { return &TeamHandlers{db: db} }

type teamResponse struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// List returns all teams in the organisation.
func (h *TeamHandlers) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid session")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var isMember bool
	err := h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2)`,
		orgID, claims.UserID).Scan(&isMember)
	if err != nil {
		slog.Error("teams.List: membership check failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to verify membership")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "forbidden", "You are not a member of this organisation")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, organization_id, name, slug, created_at, updated_at
		   FROM teams
		  WHERE organization_id = $1
		  ORDER BY name`, orgID)
	if err != nil {
		slog.Error("teams.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list teams")
		return
	}
	defer rows.Close()

	teams := []teamResponse{}
	for rows.Next() {
		var t teamResponse
		if err := rows.Scan(&t.ID, &t.OrganizationID, &t.Name, &t.Slug, &t.CreatedAt, &t.UpdatedAt); err != nil {
			slog.Error("teams.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read teams")
			return
		}
		teams = append(teams, t)
	}
	if err := rows.Err(); err != nil {
		slog.Error("teams.List: rows iteration failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list teams")
		return
	}

	writeJSON(w, http.StatusOK, teams)
}

// Create creates a new team and adds the creator as an admin member.
func (h *TeamHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid session")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var body struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "Name is required")
		return
	}

	slug := slugify(body.Name)

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		slog.Error("teams.Create: begin transaction failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create team")
		return
	}
	defer tx.Rollback(r.Context())

	var t teamResponse
	err = tx.QueryRow(r.Context(),
		`INSERT INTO teams (organization_id, name, slug)
		 VALUES ($1, $2, $3)
		 RETURNING id, organization_id, name, slug, created_at, updated_at`,
		orgID, body.Name, slug,
	).Scan(&t.ID, &t.OrganizationID, &t.Name, &t.Slug, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		slog.Error("teams.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create team")
		return
	}

	_, err = tx.Exec(r.Context(),
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')`,
		t.ID, claims.UserID,
	)
	if err != nil {
		slog.Error("teams.Create: insert member failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to add creator as team member")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("teams.Create: commit failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create team")
		return
	}

	writeJSON(w, http.StatusCreated, t)
}

// Get returns a single team by ID, verifying it belongs to the org.
func (h *TeamHandlers) Get(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid session")
		return
	}

	orgID := chi.URLParam(r, "orgID")
	teamID := chi.URLParam(r, "teamID")

	var t teamResponse
	err := h.db.QueryRow(r.Context(),
		`SELECT id, organization_id, name, slug, created_at, updated_at
		   FROM teams
		  WHERE id = $1 AND organization_id = $2`,
		teamID, orgID,
	).Scan(&t.ID, &t.OrganizationID, &t.Name, &t.Slug, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Team not found")
			return
		}
		slog.Error("fetching team", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to fetch team")
		return
	}

	writeJSON(w, http.StatusOK, t)
}

// Update patches a team's name and/or slug.
func (h *TeamHandlers) Update(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid session")
		return
	}

	orgID := chi.URLParam(r, "orgID")
	teamID := chi.URLParam(r, "teamID")

	var body struct {
		Name *string `json:"name"`
		Slug *string `json:"slug"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if body.Name != nil {
		fields = append(fields, fmt.Sprintf("name = $%d", argN))
		args = append(args, *body.Name)
		argN++
	}
	if body.Slug != nil {
		fields = append(fields, fmt.Sprintf("slug = $%d", argN))
		args = append(args, *body.Slug)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	fields = append(fields, "updated_at = NOW()")
	args = append(args, teamID, orgID)

	query := fmt.Sprintf(
		`UPDATE teams SET %s WHERE id = $%d AND organization_id = $%d
		 RETURNING id, organization_id, name, slug, created_at, updated_at`,
		strings.Join(fields, ", "), argN, argN+1)

	var t teamResponse
	err := h.db.QueryRow(r.Context(), query, args...).
		Scan(&t.ID, &t.OrganizationID, &t.Name, &t.Slug, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Team not found")
			return
		}
		slog.Error("teams.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update team")
		return
	}

	writeJSON(w, http.StatusOK, t)
}

// teamMemberResponse represents a team member with user details.
type teamMemberResponse struct {
	UserID    string    `json:"user_id"`
	Role      string    `json:"role"`
	JobRole   *string   `json:"job_role"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
}

// ListMembers returns all members of a team.
func (h *TeamHandlers) ListMembers(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid session")
		return
	}

	teamID := chi.URLParam(r, "teamID")

	rows, err := h.db.Query(r.Context(), `
		SELECT tm.user_id, tm.role, tm.job_role, tm.created_at,
		       u.email, u.name, u.avatar_url
		  FROM team_members tm
		  JOIN users u ON u.id = tm.user_id
		 WHERE tm.team_id = $1
		 ORDER BY u.name`, teamID)
	if err != nil {
		slog.Error("teams.ListMembers: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list team members")
		return
	}
	defer rows.Close()

	members := []teamMemberResponse{}
	for rows.Next() {
		var m teamMemberResponse
		if err := rows.Scan(&m.UserID, &m.Role, &m.JobRole, &m.CreatedAt, &m.Email, &m.Name, &m.AvatarURL); err != nil {
			slog.Error("teams.ListMembers: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read team members")
			return
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		slog.Error("teams.ListMembers: rows iteration failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list team members")
		return
	}

	writeJSON(w, http.StatusOK, members)
}

// Delete removes a team by ID.
func (h *TeamHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid session")
		return
	}

	orgID := chi.URLParam(r, "orgID")
	teamID := chi.URLParam(r, "teamID")

	result, err := h.db.Exec(r.Context(),
		`DELETE FROM teams WHERE id = $1 AND organization_id = $2`,
		teamID, orgID,
	)
	if err != nil {
		slog.Error("teams.Delete: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete team")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Team not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
