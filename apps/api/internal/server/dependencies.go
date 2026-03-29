package server

import (
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
	"github.com/OhByron/ProjectA/internal/config"
	"github.com/OhByron/ProjectA/internal/oauth"
)

// Dependencies holds all services required to build the HTTP handler tree.
// Constructed once in main and passed to server.New.
type Dependencies struct {
	Config *config.Config
	Logger *slog.Logger
	DB     *pgxpool.Pool
	Auth   *auth.Service
	GitHub *oauth.GitHubProvider
	Google *oauth.GoogleProvider
}
