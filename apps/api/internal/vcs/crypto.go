package vcs

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// TokenEncryptor handles AES-256-GCM encryption/decryption of access tokens.
// If key is nil (dev mode), tokens are stored and returned as plaintext bytes.
type TokenEncryptor struct {
	key []byte // 32 bytes; nil = plaintext mode
}

// NewTokenEncryptor creates an encryptor from a hex-encoded key string.
// An empty keyHex enables plaintext mode (suitable for development only).
func NewTokenEncryptor(keyHex string) (*TokenEncryptor, error) {
	if keyHex == "" {
		return &TokenEncryptor{key: nil}, nil
	}

	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("VCS_ENCRYPTION_KEY is not valid hex: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("VCS_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got %d bytes", len(key))
	}
	return &TokenEncryptor{key: key}, nil
}

// Encrypt encrypts a plaintext token. Returns ciphertext with prepended nonce.
func (e *TokenEncryptor) Encrypt(plaintext string) ([]byte, error) {
	if e.key == nil {
		return []byte(plaintext), nil
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, fmt.Errorf("aes.NewCipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("cipher.NewGCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generating nonce: %w", err)
	}

	return gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// Decrypt decrypts a ciphertext produced by Encrypt.
func (e *TokenEncryptor) Decrypt(ciphertext []byte) (string, error) {
	if e.key == nil {
		return string(ciphertext), nil
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("gcm.Open: %w", err)
	}

	return string(plaintext), nil
}

// GenerateWebhookSecret returns a cryptographically random 32-byte hex string.
func GenerateWebhookSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
