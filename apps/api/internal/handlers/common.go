package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DBPOOL abstracts the pgxpool.Pool methods used by handlers.
// *pgxpool.Pool satisfies this interface implicitly.
type DBPOOL interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Begin(ctx context.Context) (pgx.Tx, error)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeNotImplemented(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"code":    "not_implemented",
		"message": "This endpoint is not yet implemented",
	})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}

// readJSON decodes a JSON request body into v. Returns false and writes an
// error response if decoding fails.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Invalid or malformed JSON body")
		return false
	}
	return true
}

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9]+`)

// slugify converts a name into a URL-safe slug.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonAlphaNum.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
