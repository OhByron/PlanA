package auth

import "context"

type contextKey string

const (
	claimsKey   contextKey = "session_claims"
	rawTokenKey contextKey = "raw_token"
)

// WithClaims stores validated session claims in the request context.
func WithClaims(ctx context.Context, c *SessionClaims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

// ClaimsFromContext retrieves session claims stored by the auth middleware.
// Returns false if the context carries no claims (unauthenticated path).
func ClaimsFromContext(ctx context.Context) (*SessionClaims, bool) {
	c, ok := ctx.Value(claimsKey).(*SessionClaims)
	return c, ok
}

// withRawToken stores the raw bearer token string in the request context.
func withRawToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, rawTokenKey, token)
}

// RawTokenFromContext retrieves the raw bearer token stored by the auth middleware.
func RawTokenFromContext(ctx context.Context) (string, bool) {
	t, ok := ctx.Value(rawTokenKey).(string)
	return t, ok && t != ""
}
