package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/OhByron/ProjectA/internal/auth"
	"github.com/OhByron/ProjectA/internal/config"
	"github.com/OhByron/ProjectA/internal/email"
)

type InvitationHandlers struct {
	db    DBPOOL
	auth  *auth.Service
	cfg   *config.Config
	email *email.Sender
}

func NewInvitationHandlers(db DBPOOL, authSvc *auth.Service, cfg *config.Config, emailSender *email.Sender) *InvitationHandlers {
	return &InvitationHandlers{db: db, auth: authSvc, cfg: cfg, email: emailSender}
}

type invitationResponse struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	MemberID  string    `json:"member_id"`
	Email     string    `json:"email"`
	Token     string    `json:"token"`
	InviteURL string    `json:"invite_url"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// Create generates an invitation for a project member. The member must have an email.
// POST /api/projects/{projectID}/members/{memberID}/invite
func (h *InvitationHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := chi.URLParam(r, "projectID")
	memberID := chi.URLParam(r, "memberID")

	// Get the member's email and job role
	var memberEmail, jobRole string
	err := h.db.QueryRow(r.Context(),
		`SELECT email, job_role FROM project_members WHERE id = $1 AND project_id = $2`,
		memberID, projectID).Scan(&memberEmail, &jobRole)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Member not found")
			return
		}
		slog.Error("invitations.Create: member lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create invitation")
		return
	}
	if memberEmail == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "Member must have an email address to be invited")
		return
	}

	// Generate a secure random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		slog.Error("invitations.Create: token generation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to generate invitation token")
		return
	}
	token := hex.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // 7 days

	var inv invitationResponse
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO invitations (project_id, member_id, email, token, invited_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, project_id, member_id, email, token, expires_at, created_at`,
		projectID, memberID, memberEmail, token, claims.UserID, expiresAt,
	).Scan(&inv.ID, &inv.ProjectID, &inv.MemberID, &inv.Email, &inv.Token, &inv.ExpiresAt, &inv.CreatedAt)
	if err != nil {
		slog.Error("invitations.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create invitation")
		return
	}

	inv.InviteURL = h.cfg.FrontendURL + "/invite/" + token

	// Send invitation email
	var projectName, orgName string
	if err := h.db.QueryRow(r.Context(),
		`SELECT p.name, o.name
		 FROM projects p
		 JOIN teams t ON t.id = p.team_id
		 JOIN organizations o ON o.id = t.organization_id
		 WHERE p.id = $1`, projectID).Scan(&projectName, &orgName); err != nil {
		slog.Warn("invitations.Create: project/org name lookup failed", "error", err)
	}

	roleNames := map[string]string{
		"pm": "Project Manager", "po": "Product Owner", "bsa": "Business Systems Analyst",
		"ba": "Business Analyst", "qe": "Quality Engineer", "ux": "UX Designer", "dev": "Developer",
	}
	roleName := roleNames[jobRole]
	if roleName == "" {
		roleName = jobRole
	}

	if err := h.email.SendInvitation(memberEmail, inv.InviteURL, projectName, orgName, roleName); err != nil {
		slog.Error("invitation email failed", "error", err, "to", memberEmail)
		// Don't fail the request — the invite link is still valid
	}

	writeJSON(w, http.StatusCreated, inv)
}

// Get returns invitation details by token. PUBLIC endpoint (no auth required).
// GET /api/invitations/{token}
func (h *InvitationHandlers) Get(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var inv struct {
		ID          string     `json:"id"`
		Email       string     `json:"email"`
		ProjectName string     `json:"project_name"`
		OrgName     string     `json:"org_name"`
		JobRole     string     `json:"job_role"`
		ExpiresAt   time.Time  `json:"expires_at"`
		AcceptedAt  *time.Time `json:"accepted_at"`
	}

	err := h.db.QueryRow(r.Context(), `
		SELECT i.id, i.email, p.name, o.name, pm.job_role, i.expires_at, i.accepted_at
		FROM invitations i
		JOIN projects p ON p.id = i.project_id
		JOIN teams t ON t.id = p.team_id
		JOIN organizations o ON o.id = t.organization_id
		JOIN project_members pm ON pm.id = i.member_id
		WHERE i.token = $1`,
		token,
	).Scan(&inv.ID, &inv.Email, &inv.ProjectName, &inv.OrgName, &inv.JobRole, &inv.ExpiresAt, &inv.AcceptedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Invitation not found")
			return
		}
		slog.Error("invitations.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get invitation")
		return
	}

	writeJSON(w, http.StatusOK, inv)
}

type acceptInvitationRequest struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

// Accept creates a user account from an invitation. PUBLIC endpoint.
// POST /api/invitations/{token}/accept
func (h *InvitationHandlers) Accept(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var req acceptInvitationRequest
	if !readJSON(w, r, &req) {
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "Name is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "validation_error", "Password must be at least 8 characters")
		return
	}

	// Look up the invitation
	var invID, email, projectID, memberID string
	var expiresAt time.Time
	var acceptedAt *time.Time
	err := h.db.QueryRow(r.Context(),
		`SELECT id, email, project_id, member_id, expires_at, accepted_at
		 FROM invitations WHERE token = $1`, token,
	).Scan(&invID, &email, &projectID, &memberID, &expiresAt, &acceptedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Invitation not found")
			return
		}
		slog.Error("invitations.Accept: lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to process invitation")
		return
	}

	if acceptedAt != nil {
		writeError(w, http.StatusBadRequest, "already_accepted", "This invitation has already been accepted")
		return
	}
	if time.Now().After(expiresAt) {
		writeError(w, http.StatusBadRequest, "expired", "This invitation has expired")
		return
	}

	// Hash the password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("invitations.Accept: bcrypt failed", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to process registration")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		slog.Error("invitations.Accept: begin tx failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to process registration")
		return
	}
	defer tx.Rollback(r.Context())

	// Create user (or get existing by email)
	var userID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO users (email, name, password_hash)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (email) DO UPDATE SET
			password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
			updated_at = NOW()
		 RETURNING id`,
		email, req.Name, string(hash),
	).Scan(&userID)
	if err != nil {
		slog.Error("invitations.Accept: user upsert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create account")
		return
	}

	// Link user to the project member
	_, err = tx.Exec(r.Context(),
		`UPDATE project_members SET user_id = $1 WHERE id = $2`,
		userID, memberID)
	if err != nil {
		slog.Error("invitations.Accept: link member failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to link account")
		return
	}

	// Mark invitation as accepted
	_, err = tx.Exec(r.Context(),
		`UPDATE invitations SET accepted_at = NOW() WHERE id = $1`, invID)
	if err != nil {
		slog.Error("invitations.Accept: mark accepted failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to process invitation")
		return
	}

	// Also add user to the team and org so they can access the project
	// Get team_id and org_id from the project
	var teamID, orgID string
	err = tx.QueryRow(r.Context(),
		`SELECT p.team_id, t.organization_id
		 FROM projects p
		 JOIN teams t ON t.id = p.team_id
		 WHERE p.id = $1`, projectID,
	).Scan(&teamID, &orgID)
	if err != nil {
		slog.Error("invitations.Accept: project lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to process invitation")
		return
	}

	// Add to org members (viewer role) — ignore conflict if already a member
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO organization_members (organization_id, user_id, role)
		 VALUES ($1, $2, 'viewer')
		 ON CONFLICT DO NOTHING`, orgID, userID); err != nil {
		slog.Warn("invitations.Accept: auto-add org member failed", "error", err)
	}

	// Add to team members (member role)
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO team_members (team_id, user_id, role)
		 VALUES ($1, $2, 'member')
		 ON CONFLICT DO NOTHING`, teamID, userID); err != nil {
		slog.Warn("invitations.Accept: auto-add team member failed", "error", err)
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("invitations.Accept: commit failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to complete registration")
		return
	}

	// Issue a session token so they're logged in immediately
	sessionToken, err := h.auth.IssueSessionToken(userID, email)
	if err != nil {
		slog.Error("invitations.Accept: token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "token_error", "Account created but login failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token":   sessionToken,
		"user_id": userID,
		"email":   email,
	})
}
