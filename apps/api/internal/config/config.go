package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	Environment string

	// Auth — session tokens
	JWTSecret string

	// OAuth — GitHub
	GitHubClientID     string
	GitHubClientSecret string

	// OAuth — Google
	GoogleClientID     string
	GoogleClientSecret string

	// Server — base URL used to build OAuth redirect URIs
	AppBaseURL string

	// CORS — comma-separated list of allowed origins in production
	AllowedOrigins string

	// FrontendURL is the base URL of the web app; used for OAuth post-login redirects.
	FrontendURL string

	// Resend API key for email delivery (optional -- invites work without it, just no email sent)
	ResendAPIKey string

	// VCS integration -- AES-256 key for encrypting repository access tokens at rest.
	// Required in production, optional in development (tokens stored as plaintext if empty).
	// Must be exactly 32 bytes, hex-encoded (64 hex chars).
	VCSEncryptionKey string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		Environment: getEnv("ENV", "development"),

		JWTSecret: os.Getenv("JWT_SECRET"),

		GitHubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),

		AppBaseURL:     getEnv("APP_BASE_URL", "http://localhost:8080"),
		AllowedOrigins: os.Getenv("ALLOWED_ORIGINS"),
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:5173"),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),

		VCSEncryptionKey: os.Getenv("VCS_ENCRYPTION_KEY"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	if cfg.Environment == "production" {
		if cfg.AllowedOrigins == "" {
			return nil, fmt.Errorf("ALLOWED_ORIGINS is required in production")
		}
		if cfg.VCSEncryptionKey == "" {
			return nil, fmt.Errorf("VCS_ENCRYPTION_KEY is required in production for token encryption")
		}
		if len(cfg.VCSEncryptionKey) != 64 {
			return nil, fmt.Errorf("VCS_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)")
		}
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
