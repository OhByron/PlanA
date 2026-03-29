package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	electricTokenDuration = 1 * time.Hour
	electricAudience      = "electric-sql"
)

// ElectricClaims are the claims embedded in an Electric SQL sync token.
// The Electric proxy validates this token and uses org_id to scope which
// shape data a client may subscribe to.
type ElectricClaims struct {
	jwt.RegisteredClaims
	// OrgID scopes this token to a single organisation's data.
	// Electric SQL shape definitions must check this claim to enforce tenant isolation.
	OrgID string `json:"org_id"`
	// Role is the user's membership role in the organisation ('admin', 'member', 'viewer').
	Role string `json:"role"`
}

// IssueElectricToken creates a short-lived JWT for Electric SQL sync auth.
func (s *Service) IssueElectricToken(userID, orgID, role string) (string, error) {
	now := time.Now()
	claims := &ElectricClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{electricAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(electricTokenDuration)),
		},
		OrgID: orgID,
		Role:  role,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.electricSecret)
	if err != nil {
		return "", fmt.Errorf("signing electric token: %w", err)
	}
	return signed, nil
}
