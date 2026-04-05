package server

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"

	"github.com/OhByron/ProjectA/internal/email"
	"github.com/OhByron/ProjectA/internal/handlers"
	"github.com/OhByron/ProjectA/internal/server/middleware"
)

// New builds and returns the complete HTTP handler tree.
func New(deps *Dependencies) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger(deps.Logger))
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.SanitizeBody)

	allowedOrigins := []string{"http://localhost:5173"}
	if deps.Config.Environment == "production" && deps.Config.AllowedOrigins != "" {
		allowedOrigins = strings.Split(deps.Config.AllowedOrigins, ",")
	}
	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID", "X-Language"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	r.Use(c.Handler)

	// Construct handler groups
	authH    := handlers.NewAuthHandlers(deps.DB, deps.Auth, deps.GitHub, deps.Google, deps.Config, deps.Redis)
	userH    := handlers.NewUserHandlers(deps.DB, deps.Auth)
	orgH     := handlers.NewOrgHandlers(deps.DB)
	initH    := handlers.NewInitiativeHandlers(deps.DB)
	teamH    := handlers.NewTeamHandlers(deps.DB)
	projH    := handlers.NewProjectHandlers(deps.DB)
	wiH      := handlers.NewWorkItemHandlers(deps.DB)
	acH      := handlers.NewACHandlers(deps.DB)
	commH    := handlers.NewCommentHandlers(deps.DB)
	epicH    := handlers.NewEpicHandlers(deps.DB)
	sprintH  := handlers.NewSprintHandlers(deps.DB)
	siH      := handlers.NewSprintItemHandlers(deps.DB)
	depH     := handlers.NewDependencyHandlers(deps.DB)
	estH     := handlers.NewEstimationHandlers(deps.DB)
	linkH    := handlers.NewLinkHandlers(deps.DB)
	pmH      := handlers.NewProjectMemberHandlers(deps.DB)
	notifH   := handlers.NewNotificationHandlers(deps.DB)
	aiH      := handlers.NewAIHandlers(deps.DB)
	testH    := handlers.NewTestResultHandlers(deps.DB)
	shareH   := handlers.NewShareHandlers(deps.DB)
	reportH  := handlers.NewReportHandlers(deps.DB)
	epicDepH := handlers.NewEpicDepHandlers(deps.DB)
	sprintDepH := handlers.NewSprintDepHandlers(deps.DB)
	emailSender := email.NewSender(deps.Config.ResendAPIKey, "PlanA <onboarding@resend.dev>")
	invH     := handlers.NewInvitationHandlers(deps.DB, deps.Auth, deps.Config, emailSender)

	// Public routes
	r.Get("/health", handlers.Health)

	r.Route("/api", func(r chi.Router) {
		// ----------------------------------------------------------------
		// Public — OAuth flows (no auth required)
		// ----------------------------------------------------------------
		r.Route("/auth", func(r chi.Router) {
			authLimiter := middleware.NewRateLimiter(1, 5)
			r.Use(authLimiter.Middleware)

			r.Post("/github", authH.GitHubInitiate)
			r.Get("/github/callback", authH.GitHubCallback)
			r.Post("/google", authH.GoogleInitiate)
			r.Get("/google/callback", authH.GoogleCallback)
			r.Delete("/logout", authH.Logout)
			r.Post("/login", authH.PasswordLogin)

			// Dev-only: bypass OAuth for local testing.
			if deps.Config.Environment == "development" {
				r.Post("/dev-login", authH.DevLogin)
			}
		})

		// ----------------------------------------------------------------
		// Public — invitation acceptance (no auth required)
		// ----------------------------------------------------------------
		r.Route("/invitations/{token}", func(r chi.Router) {
			r.Get("/", invH.Get)
			r.Post("/accept", invH.Accept)
		})

		// ----------------------------------------------------------------
		// Public — stakeholder dashboard (token-authenticated, no login)
		// ----------------------------------------------------------------
		r.Get("/share/{token}/dashboard", shareH.Dashboard)

		// ----------------------------------------------------------------
		// Protected — all routes below require a valid session JWT
		// ----------------------------------------------------------------
		r.Group(func(r chi.Router) {
			r.Use(deps.Auth.RequireAuth)

			r.Get("/me", userH.Me)
			r.Get("/me/work-items", userH.MyWorkItems)
			r.Patch("/me/preferences", userH.UpdatePreferences)
			// Notifications
			r.Route("/notifications", func(r chi.Router) {
				r.Get("/", notifH.List)
				r.Get("/unread-count", notifH.UnreadCount)
				r.Post("/mark-all-read", notifH.MarkAllRead)
			})

			// Organisations
			r.Route("/orgs", func(r chi.Router) {
				r.Get("/", orgH.List)
				r.Post("/", orgH.Create)
				r.Route("/{orgID}", func(r chi.Router) {
					r.Get("/", orgH.Get)
					r.Patch("/", orgH.Update)
					r.Delete("/", orgH.Delete)
					r.Post("/archive", orgH.Archive)
					r.Post("/unarchive", orgH.Unarchive)

					// Initiatives (cross-team, org-scoped)
					r.Route("/initiatives", func(r chi.Router) {
						r.Get("/", initH.List)
						r.Post("/", initH.Create)
						r.Route("/{initiativeID}", func(r chi.Router) {
							r.Get("/", initH.Get)
							r.Patch("/", initH.Update)
							r.Delete("/", initH.Delete)
						})
					})

					// Teams
					r.Route("/teams", func(r chi.Router) {
						r.Get("/", teamH.List)
						r.Post("/", teamH.Create)
						r.Route("/{teamID}", func(r chi.Router) {
							r.Get("/", teamH.Get)
							r.Patch("/", teamH.Update)
							r.Delete("/", teamH.Delete)
							r.Get("/members", teamH.ListMembers)

							// Projects
							r.Route("/projects", func(r chi.Router) {
								r.Get("/", projH.List)
								r.Post("/", projH.Create)
								r.Post("/import", projH.Import)
								r.Route("/{projectID}", func(r chi.Router) {
									r.Get("/", projH.Get)
									r.Patch("/", projH.Update)
									r.Delete("/", projH.Delete)
								})
							})
						})
					})
				})
			})

			// Project-scoped resources (shortcut routes — no need to traverse org/team)
			r.Route("/projects/{projectID}", func(r chi.Router) {
				r.Get("/", projH.Get)
				r.Patch("/", projH.Update)
				r.Post("/archive", projH.Archive)
				r.Post("/unarchive", projH.Unarchive)
				r.Get("/export", projH.Export)
				r.Get("/dependencies", depH.ListByProject)
				r.Post("/dependencies/bulk", depH.BulkCommit)
				r.Get("/sprint-assigned", siH.AssignedItemIDs)
				r.Route("/work-items", func(r chi.Router) {
					r.Get("/", wiH.List)
					r.Post("/", wiH.Create)
					r.Route("/{workItemID}", func(r chi.Router) {
						r.Get("/", wiH.Get)
						r.Patch("/", wiH.Update)
						r.Delete("/", wiH.Delete)
						r.Post("/suggest-ac", aiH.SuggestAC)
						r.Post("/suggest-desc", aiH.SuggestDescription)
						r.Post("/suggest-from-test", aiH.SuggestFromTestFailure)
						r.Post("/suggest-decompose", aiH.SuggestDecomposition)
					})
				})
				r.Route("/members", func(r chi.Router) {
					r.Get("/", pmH.List)
					r.Post("/", pmH.Create)
					r.Route("/{memberID}", func(r chi.Router) {
						r.Patch("/", pmH.Update)
						r.Delete("/", pmH.Delete)
						r.Post("/invite", invH.Create)
					})
				})
				r.Get("/ai-settings", aiH.GetSettings)
				r.Patch("/ai-settings", aiH.UpdateSettings)
				r.Post("/ai/suggest-inline", aiH.SuggestInline)
				r.Get("/epic-dependencies", epicDepH.ListByProject)
				r.Get("/sprint-dependencies", sprintDepH.ListByProject)
				r.Route("/epics", func(r chi.Router) {
					r.Get("/", epicH.List)
					r.Post("/", epicH.Create)
					r.Route("/{epicID}", func(r chi.Router) {
						r.Get("/", epicH.Get)
						r.Patch("/", epicH.Update)
						r.Delete("/", epicH.Delete)
						r.Route("/dependencies", func(r chi.Router) {
							r.Post("/", epicDepH.Create)
							r.Delete("/{depID}", epicDepH.Delete)
						})
					})
				})
				r.Route("/sprints", func(r chi.Router) {
					r.Get("/", sprintH.List)
					r.Post("/", sprintH.Create)
					r.Route("/{sprintID}", func(r chi.Router) {
						r.Patch("/", sprintH.Update)
						r.Delete("/", sprintH.Delete)
						r.Get("/burndown", sprintH.Burndown)
						r.Route("/dependencies", func(r chi.Router) {
							r.Post("/", sprintDepH.Create)
							r.Delete("/{depID}", sprintDepH.Delete)
						})
					})
				})
				r.Route("/test-results", func(r chi.Router) {
					r.Get("/", testH.List)
					r.Get("/{resultID}", testH.Get)
					r.Post("/junit", testH.ImportJUnit)
					r.Post("/webhook", testH.Webhook)
				})

				// Share tokens (stakeholder dashboard links)
				r.Route("/share-tokens", func(r chi.Router) {
					r.Get("/", shareH.List)
					r.Post("/", shareH.Create)
					r.Post("/{tokenID}/revoke", shareH.Revoke)
				})

				// Report generation
				r.Post("/reports/generate", reportH.Generate)
			})

			// Sprint item management (add/remove work items from a sprint)
			r.Get("/sprints/{sprintID}/items", siH.ListItems)
			r.Route("/sprints/{sprintID}/items/{workItemID}", func(r chi.Router) {
				r.Post("/", siH.Add)
				r.Delete("/", siH.Remove)
			})

			// Work-item sub-resources
			r.Route("/work-items/{workItemID}", func(r chi.Router) {
				r.Get("/test-summary", testH.Summary)
				r.Route("/acceptance-criteria", func(r chi.Router) {
					r.Get("/", acH.List)
					r.Post("/", acH.Create)
					r.Route("/{acID}", func(r chi.Router) {
						r.Patch("/", acH.Update)
						r.Delete("/", acH.Delete)
					})
				})
				r.Route("/comments", func(r chi.Router) {
					r.Get("/", commH.List)
					r.Post("/", commH.Create)
					r.Route("/{commentID}", func(r chi.Router) {
						r.Patch("/", commH.Update)
						r.Delete("/", commH.Delete)
					})
				})
				r.Route("/dependencies", func(r chi.Router) {
					r.Get("/", depH.List)
					r.Post("/", depH.Create)
					r.Delete("/{depID}", depH.Delete)
				})
				r.Route("/links", func(r chi.Router) {
					r.Get("/", linkH.List)
					r.Post("/", linkH.Create)
					r.Delete("/{linkID}", linkH.Delete)
				})
				r.Route("/votes", func(r chi.Router) {
					r.Get("/", estH.List)
					r.Post("/", estH.Vote)
					r.Post("/lock", estH.Lock)
					r.Delete("/", estH.Reset)
				})
			})
		})
	})

	return r
}
