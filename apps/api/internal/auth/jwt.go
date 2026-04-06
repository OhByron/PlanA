package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/OhByron/PlanA/internal/config"
)

const (
	sessionTokenDuration = 7 * 24 * time.Hour
	issuer               = "plana-api"
)

// SessionClaims are the claims embedded in a user session JWT.
type SessionClaims struct {
	jwt.RegisteredClaims
	UserID string `json:"user_id"`
	Email  string `json:"email"`
}

// Service handles JWT issuance and validation for session tokens.
type Service struct {
	sessionSecret []byte
}

// NewService constructs a Service from application config.
func NewService(cfg *config.Config) *Service {
	return &Service{
		sessionSecret: []byte(cfg.JWTSecret),
	}
}

// IssueSessionToken creates a signed JWT for the given user.
func (s *Service) IssueSessionToken(userID, email string) (string, error) {
	now := time.Now()
	claims := &SessionClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(sessionTokenDuration)),
		},
		UserID: userID,
		Email:  email,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.sessionSecret)
	if err != nil {
		return "", fmt.Errorf("signing session token: %w", err)
	}
	return signed, nil
}

// ValidateSessionToken parses and validates a session JWT string.
func (s *Service) ValidateSessionToken(tokenStr string) (*SessionClaims, error) {
	claims := &SessionClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.sessionSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid session token: %w", err)
	}
	return claims, nil
}
