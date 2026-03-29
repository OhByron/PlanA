package auth

import (
	"net/http"
	"strings"
)

// RequireAuth is a chi-compatible middleware that validates the session JWT
// from the Authorization header and stores the claims in the request context.
// Returns 401 if the token is missing or invalid.
func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := BearerToken(r)
		if token == "" {
			http.Error(w, `{"code":"unauthorized","message":"Authorization header required"}`, http.StatusUnauthorized)
			return
		}

		claims, err := s.ValidateSessionToken(token)
		if err != nil {
			http.Error(w, `{"code":"unauthorized","message":"Invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		ctx := WithClaims(r.Context(), claims)
		ctx = withRawToken(ctx, token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// BearerToken extracts the token from "Authorization: Bearer <token>".
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
