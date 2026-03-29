package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

// NewPair generates a cryptographically random PKCE state and code_verifier.
// Both are base64url-encoded 32-byte values per RFC 7636.
func NewPair() (state, verifier string, err error) {
	state, err = randomBase64URL(32)
	if err != nil {
		return
	}
	verifier, err = randomBase64URL(32)
	return
}

// Challenge derives the S256 code_challenge from a code_verifier.
func Challenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

func randomBase64URL(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
