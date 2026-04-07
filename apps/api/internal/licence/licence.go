package licence

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"strings"
	"time"
)

// PlanA licence public key — used to verify licence key signatures.
// The corresponding private key is held offline in the keygen tool.
const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1ACGWs4lsqDNg4RkdOLl
oV4h32WYb7Z9xFSJP9DKyR1e4VVYtfnMR42MTaeEfRHqp8O8AWMW0WzG59z6Rdnp
0iUSUHFeH4qo3phO+F0i1s85hLgBbH6sT7peR4Q+enDjaMAGp+STIVCCwyWKDM7P
bjKSpqcOhkJqAoOYUlp+OC4nHmifc1fQ/00h7h177OJ4KcvvlrpprFyfkW2RatkW
dFsTmi7rYK5vC1klMd3FPOq7KbKaP0im11i6mOID9Rc4xU9QkjqEr8b7Np8UE/f8
fyHDPz9E7a7Z/ScxBd2gWy1r8Wi1lUJCQeNMjwInD7JjRk/GEuG5myP+5r2zSCiD
PQIDAQAB
-----END PUBLIC KEY-----`

// Tier represents the licence tier.
type Tier string

const (
	TierCommunity    Tier = "community"
	TierProfessional Tier = "professional"
	TierEnterprise   Tier = "enterprise"
)

// Licence is the decoded and validated licence payload.
type Licence struct {
	LicenceID    string            `json:"licenceId"`
	Organisation string            `json:"organisation"`
	Tier         Tier              `json:"tier"`
	IssuedAt     string            `json:"issuedAt"`
	ExpiresAt    string            `json:"expiresAt,omitempty"`
	MaxUsers     int               `json:"maxUsers,omitempty"`
	Features     map[string]any    `json:"features,omitempty"`
}

// Info returns a summary suitable for API responses.
type Info struct {
	Valid        bool   `json:"valid"`
	HasKey       bool   `json:"has_key"`
	Tier         Tier   `json:"tier"`
	Organisation string `json:"organisation"`
	ExpiresAt    string `json:"expires_at,omitempty"`
	Expired      bool   `json:"expired"`
	MaxUsers     int    `json:"max_users,omitempty"`
}

var publicKey *rsa.PublicKey

func init() {
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		panic("licence: failed to decode public key PEM")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic("licence: failed to parse public key: " + err.Error())
	}
	var ok bool
	publicKey, ok = pub.(*rsa.PublicKey)
	if !ok {
		panic("licence: public key is not RSA")
	}
}

// Validate parses and verifies a licence key string.
// Returns a community licence if the key is empty, invalid, or expired.
func Validate(key string) (*Licence, error) {
	if key == "" {
		return communityDefault(), nil
	}

	parts := strings.SplitN(key, ".", 2)
	if len(parts) != 2 {
		return nil, errors.New("invalid key format")
	}

	payloadB64 := parts[0]
	signatureB64 := parts[1]

	// Verify signature
	hash := sha256.Sum256([]byte(payloadB64))
	sig, err := base64.RawURLEncoding.DecodeString(signatureB64)
	if err != nil {
		return nil, errors.New("invalid signature encoding")
	}
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hash[:], sig); err != nil {
		return nil, errors.New("signature verification failed")
	}

	// Decode payload
	payloadJSON, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, errors.New("invalid payload encoding")
	}

	var lic Licence
	if err := json.Unmarshal(payloadJSON, &lic); err != nil {
		return nil, errors.New("invalid payload JSON")
	}

	// Check expiry — expired keys downgrade to community, never block the app
	if lic.ExpiresAt != "" {
		exp, err := time.Parse("2006-01-02", lic.ExpiresAt)
		if err == nil && time.Now().After(exp.Add(24*time.Hour)) {
			lic.Tier = TierCommunity
		}
	}

	return &lic, nil
}

// GetInfo returns a summary of the licence status.
func GetInfo(lic *Licence, hasKey bool) Info {
	if lic == nil {
		lic = communityDefault()
	}
	expired := false
	if lic.ExpiresAt != "" {
		exp, err := time.Parse("2006-01-02", lic.ExpiresAt)
		if err == nil && time.Now().After(exp.Add(24*time.Hour)) {
			expired = true
		}
	}
	return Info{
		Valid:        true,
		HasKey:       hasKey,
		Tier:         lic.Tier,
		Organisation: lic.Organisation,
		ExpiresAt:    lic.ExpiresAt,
		Expired:      expired,
		MaxUsers:     lic.MaxUsers,
	}
}

func communityDefault() *Licence {
	return &Licence{
		Tier:         TierCommunity,
		Organisation: "Community",
		IssuedAt:     time.Now().Format("2006-01-02"),
	}
}
