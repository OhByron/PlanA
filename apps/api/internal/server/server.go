package server

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"

	"github.com/OhByron/ProjectA/internal/config"
	"github.com/OhByron/ProjectA/internal/handlers"
	"github.com/OhByron/ProjectA/internal/server/middleware"
)

func New(cfg *config.Config, logger *slog.Logger) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger(logger))
	r.Use(chimiddleware.Recoverer)

	allowedOrigins := []string{"http://localhost:5173"}
	if cfg.Environment == "production" {
		// TODO Phase 1: read from ALLOWED_ORIGINS env var
		allowedOrigins = []string{}
	}

	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	r.Use(c.Handler)

	// Public routes
	r.Get("/health", handlers.Health)

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		// Auth (OAuth callbacks — Phase 1)
		r.Route("/auth", func(r chi.Router) {
			r.Get("/github", handlers.NotImplemented)
			r.Get("/github/callback", handlers.NotImplemented)
			r.Get("/google", handlers.NotImplemented)
			r.Get("/google/callback", handlers.NotImplemented)
			r.Post("/logout", handlers.NotImplemented)
		})

		// Protected routes (auth middleware added in Phase 1)
		r.Group(func(r chi.Router) {
			r.Get("/me", handlers.NotImplemented)

			r.Get("/organizations", handlers.NotImplemented)
			r.Post("/organizations", handlers.NotImplemented)
			r.Get("/organizations/{orgId}/teams", handlers.NotImplemented)

			r.Get("/projects/{projectId}/work-items", handlers.NotImplemented)
			r.Post("/projects/{projectId}/work-items", handlers.NotImplemented)
			r.Get("/projects/{projectId}/work-items/{id}", handlers.NotImplemented)
			r.Patch("/projects/{projectId}/work-items/{id}", handlers.NotImplemented)
			r.Delete("/projects/{projectId}/work-items/{id}", handlers.NotImplemented)

			r.Get("/projects/{projectId}/sprints", handlers.NotImplemented)
			r.Post("/projects/{projectId}/sprints", handlers.NotImplemented)
			r.Patch("/projects/{projectId}/sprints/{id}", handlers.NotImplemented)

			r.Get("/projects/{projectId}/epics", handlers.NotImplemented)
			r.Post("/projects/{projectId}/epics", handlers.NotImplemented)

			r.Get("/notifications", handlers.NotImplemented)
			r.Patch("/notifications/{id}/read", handlers.NotImplemented)
			r.Post("/notifications/read-all", handlers.NotImplemented)
		})
	})

	return r
}
