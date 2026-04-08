package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"

	"github.com/OhByron/PlanA/internal/auth"
	"github.com/OhByron/PlanA/internal/realtime"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, validate against allowed origins.
		// For now, allow all origins (CORS is handled at the HTTP level).
		return true
	},
}

// WSHandler handles WebSocket upgrade requests.
type WSHandler struct {
	hub  *realtime.Hub
	auth *auth.Service
	db   DBPOOL
}

func NewWSHandler(hub *realtime.Hub, auth *auth.Service, db DBPOOL) *WSHandler {
	return &WSHandler{hub: hub, auth: auth, db: db}
}

// Upgrade handles the WebSocket upgrade request.
// JWT is passed via query param: /api/ws?token=<jwt>
func (h *WSHandler) Upgrade(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	claims, err := h.auth.ValidateSessionToken(tokenStr)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// Fetch user name and avatar for presence
	var name string
	var avatarURL *string
	_ = h.db.QueryRow(r.Context(),
		`SELECT name, avatar_url FROM users WHERE id = $1`, claims.UserID,
	).Scan(&name, &avatarURL)

	avatar := ""
	if avatarURL != nil {
		avatar = *avatarURL
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("ws: upgrade failed", "error", err)
		return
	}

	client := realtime.NewClient(h.hub, conn, claims.UserID, name, avatar, h.authorizeChannel)
	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}

// authorizeChannel checks if a user is allowed to subscribe to a channel.
func (h *WSHandler) authorizeChannel(userID, channel string) bool {
	// user:{id} channels - only the user themselves
	if strings.HasPrefix(channel, "user:") {
		return channel == "user:"+userID
	}

	// project:{id} and project:{id}:* channels - must be a project member or org admin
	if strings.HasPrefix(channel, "project:") {
		// Extract project ID (first segment after "project:")
		parts := strings.SplitN(channel[8:], ":", 2)
		projectID := parts[0]
		if projectID == "" {
			return false
		}

		var allowed bool
		err := h.db.QueryRow(context.Background(),
			`SELECT EXISTS(
				SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = $2
				UNION ALL
				SELECT 1 FROM organization_members om
				  JOIN teams t ON t.organization_id = om.organization_id
				  JOIN projects p ON p.team_id = t.id
				  WHERE p.id = $1 AND om.user_id = $2 AND om.role = 'admin'
			)`, projectID, userID,
		).Scan(&allowed)
		return err == nil && allowed
	}

	return false
}
