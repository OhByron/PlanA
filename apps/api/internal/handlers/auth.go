package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/OhByron/ProjectA/internal/auth"
	"github.com/OhByron/ProjectA/internal/config"
	"github.com/OhByron/ProjectA/internal/oauth"
)

const sessionDuration = 7 * 24 * time.Hour

// AuthHandlers handles OAuth login flows and session management.
type AuthHandlers struct {
	db     *pgxpool.Pool
	auth   *auth.Service
	github *oauth.GitHubProvider
	google *oauth.GoogleProvider
	cfg    *config.Config
}

func NewAuthHandlers(db *pgxpool.Pool, authSvc *auth.Service, gh *oauth.GitHubProvider, goog *oauth.GoogleProvider, cfg *config.Config) *AuthHandlers {
	return &AuthHandlers{db: db, auth: authSvc, github: gh, google: goog, cfg: cfg}
}

// GitHubInitiate generates PKCE params, sets a short-lived cookie, and returns
// the GitHub authorisation URL for the frontend to redirect the browser to.
func (h *AuthHandlers) GitHubInitiate(w http.ResponseWriter, r *http.Request) {
	state, verifier, err := oauth.NewPair()
	if err != nil {
		slog.Error("pkce generation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to initiate OAuth flow")
		return
	}

	h.setPKCECookie(w, state+":"+verifier)
	writeJSON(w, http.StatusOK, map[string]string{
		"url": h.github.AuthURL(state, oauth.Challenge(verifier)),
	})
}

// GitHubCallback handles the redirect from GitHub, upserts the user, issues a
// session token, and redirects to the frontend.
func (h *AuthHandlers) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	state, verifier, ok := h.consumePKCECookie(w, r)
	if !ok {
		h.redirectError(w, r, "bad_state")
		return
	}

	if r.URL.Query().Get("state") != state {
		h.redirectError(w, r, "csrf")
		return
	}
	if e := r.URL.Query().Get("error"); e != "" {
		h.redirectError(w, r, e)
		return
	}

	ghUser, err := h.github.Exchange(r.Context(), r.URL.Query().Get("code"), verifier)
	if err != nil {
		slog.Error("github exchange failed", "error", err)
		h.redirectError(w, r, "exchange_failed")
		return
	}

	userID, email, err := upsertGitHubUser(r.Context(), h.db, ghUser)
	if err != nil {
		slog.Error("upsert github user failed", "error", err)
		h.redirectError(w, r, "db_error")
		return
	}

	h.completeLogin(w, r, userID, email)
}

// GoogleInitiate generates PKCE params and returns the Google authorisation URL.
func (h *AuthHandlers) GoogleInitiate(w http.ResponseWriter, r *http.Request) {
	state, verifier, err := oauth.NewPair()
	if err != nil {
		slog.Error("pkce generation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to initiate OAuth flow")
		return
	}

	h.setPKCECookie(w, state+":"+verifier)
	writeJSON(w, http.StatusOK, map[string]string{
		"url": h.google.AuthURL(state, oauth.Challenge(verifier)),
	})
}

// GoogleCallback handles the redirect from Google, upserts the user, and issues a session token.
func (h *AuthHandlers) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	state, verifier, ok := h.consumePKCECookie(w, r)
	if !ok {
		h.redirectError(w, r, "bad_state")
		return
	}

	if r.URL.Query().Get("state") != state {
		h.redirectError(w, r, "csrf")
		return
	}
	if e := r.URL.Query().Get("error"); e != "" {
		h.redirectError(w, r, e)
		return
	}

	gUser, err := h.google.Exchange(r.Context(), r.URL.Query().Get("code"), verifier)
	if err != nil {
		slog.Error("google exchange failed", "error", err)
		h.redirectError(w, r, "exchange_failed")
		return
	}

	userID, email, err := upsertGoogleUser(r.Context(), h.db, gUser)
	if err != nil {
		slog.Error("upsert google user failed", "error", err)
		h.redirectError(w, r, "db_error")
		return
	}

	h.completeLogin(w, r, userID, email)
}

// Logout deletes the current session from the database, invalidating the token
// server-side even though it hasn't expired yet.
func (h *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	if token, ok := auth.RawTokenFromContext(r.Context()); ok {
		_, _ = h.db.Exec(r.Context(),
			`DELETE FROM auth_sessions WHERE token_hash = $1`, hashToken(token))
	}
	w.WriteHeader(http.StatusNoContent)
}

// DevLogin is a development-only endpoint that creates a test user and returns
// a session token without requiring OAuth. Gated on ENV=development in the router.
func (h *AuthHandlers) DevLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Email == "" {
		body.Email = "dev@plana.local"
	}
	if body.Name == "" {
		body.Name = "Dev User"
	}

	var userID, email string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO users (email, name)
		VALUES ($1, $2)
		ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
		RETURNING id, email
	`, body.Email, body.Name).Scan(&userID, &email)
	if err != nil {
		slog.Error("dev-login: upsert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create dev user")
		return
	}

	token, err := h.auth.IssueSessionToken(userID, email)
	if err != nil {
		slog.Error("dev-login: token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "token_error", "Failed to issue token")
		return
	}

	_ = storeSession(r.Context(), h.db, userID, token)

	writeJSON(w, http.StatusOK, map[string]string{
		"token":   token,
		"user_id": userID,
		"email":   email,
	})
}

// PasswordLogin authenticates with email + password.
// POST /api/auth/login
func (h *AuthHandlers) PasswordLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Email == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "Email and password are required")
		return
	}

	var userID, email, hash string
	err := h.db.QueryRow(r.Context(),
		`SELECT id, email, password_hash FROM users WHERE email = $1`,
		body.Email).Scan(&userID, &email, &hash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Invalid email or password")
		return
	}
	if hash == "" {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "This account uses OAuth login (GitHub/Google)")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Invalid email or password")
		return
	}

	token, err := h.auth.IssueSessionToken(userID, email)
	if err != nil {
		slog.Error("password login: token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "token_error", "Failed to issue token")
		return
	}

	if err := storeSession(r.Context(), h.db, userID, token); err != nil {
		slog.Error("password login: store session failed", "error", err)
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token":   token,
		"user_id": userID,
		"email":   email,
	})
}

// --- shared login completion ---

func (h *AuthHandlers) completeLogin(w http.ResponseWriter, r *http.Request, userID, email string) {
	token, err := h.auth.IssueSessionToken(userID, email)
	if err != nil {
		slog.Error("issue session token failed", "error", err)
		h.redirectError(w, r, "token_error")
		return
	}

	if err := storeSession(r.Context(), h.db, userID, token); err != nil {
		// Non-fatal: token is still cryptographically valid; logout won't work
		// but login should succeed. Log and continue.
		slog.Error("store session failed", "error", err)
	}

	http.Redirect(w, r, h.cfg.FrontendURL+"/auth/callback#token="+token, http.StatusFound)
}

// --- PKCE cookie helpers ---

func (h *AuthHandlers) setPKCECookie(w http.ResponseWriter, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_pkce",
		Value:    value,
		Path:     "/api/auth",
		MaxAge:   600, // 10 minutes — enough time to complete the OAuth round-trip
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.cfg.Environment == "production",
	})
}

// consumePKCECookie reads the oauth_pkce cookie, clears it, and returns the
// state and verifier. Returns ok=false if the cookie is absent or malformed.
func (h *AuthHandlers) consumePKCECookie(w http.ResponseWriter, r *http.Request) (state, verifier string, ok bool) {
	cookie, err := r.Cookie("oauth_pkce")
	// Always clear regardless of validity
	http.SetCookie(w, &http.Cookie{Name: "oauth_pkce", Path: "/api/auth", MaxAge: -1})
	if err != nil {
		return "", "", false
	}
	parts := strings.SplitN(cookie.Value, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func (h *AuthHandlers) redirectError(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, h.cfg.FrontendURL+"/auth/error?reason="+reason, http.StatusFound)
}

// --- DB helpers ---

func upsertGitHubUser(ctx context.Context, db *pgxpool.Pool, u *oauth.GitHubUser) (id, email string, err error) {
	ghID := fmt.Sprintf("%d", u.ID)
	name := u.Name
	if name == "" {
		name = u.Login
	}

	err = db.QueryRow(ctx, `
		INSERT INTO users (email, name, avatar_url, github_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (github_id) DO UPDATE SET
			email      = EXCLUDED.email,
			name       = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url,
			updated_at = NOW()
		RETURNING id, email
	`, u.Email, name, u.AvatarURL, ghID).Scan(&id, &email)

	if err == nil {
		return id, email, nil
	}

	// Unique violation on email means user exists via a different provider — link accounts.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		err = db.QueryRow(ctx, `
			UPDATE users SET github_id = $1, updated_at = NOW()
			WHERE email = $2
			RETURNING id, email
		`, ghID, u.Email).Scan(&id, &email)
	}
	return id, email, err
}

func upsertGoogleUser(ctx context.Context, db *pgxpool.Pool, u *oauth.GoogleUser) (id, email string, err error) {
	err = db.QueryRow(ctx, `
		INSERT INTO users (email, name, avatar_url, google_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (google_id) DO UPDATE SET
			email      = EXCLUDED.email,
			name       = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url,
			updated_at = NOW()
		RETURNING id, email
	`, u.Email, u.Name, u.AvatarURL, u.ID).Scan(&id, &email)

	if err == nil {
		return id, email, nil
	}

	// Link google_id to existing account (signed up via GitHub previously).
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		err = db.QueryRow(ctx, `
			UPDATE users SET google_id = $1, updated_at = NOW()
			WHERE email = $2
			RETURNING id, email
		`, u.ID, u.Email).Scan(&id, &email)
	}
	return id, email, err
}

func storeSession(ctx context.Context, db *pgxpool.Pool, userID, token string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO auth_sessions (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (token_hash) DO NOTHING
	`, userID, hashToken(token), time.Now().Add(sessionDuration))
	return err
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
