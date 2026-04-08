package realtime

import (
	"log/slog"
	"sync"
)

// Hub manages WebSocket clients and channel subscriptions.
// Thread-safe via RWMutex. Designed for single-instance use;
// wrap with a Redis broadcaster for multi-instance.
type Hub struct {
	mu sync.RWMutex

	// clients is the set of all registered clients.
	clients map[*Client]bool

	// channels maps channel name to the set of subscribed clients.
	channels map[string]map[*Client]bool

	// clientChannels tracks which channels each client is subscribed to.
	clientChannels map[*Client]map[string]bool

	// presence tracks who is viewing each project channel.
	presence map[string]map[string]PresenceEntry
}

// PresenceEntry records a user's presence in a channel.
type PresenceEntry struct {
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:        make(map[*Client]bool),
		channels:       make(map[string]map[*Client]bool),
		clientChannels: make(map[*Client]map[string]bool),
		presence:       make(map[string]map[string]PresenceEntry),
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	h.clientChannels[c] = make(map[string]bool)
	slog.Info("realtime: client registered", "userID", c.UserID)
}

// Unregister removes a client and all its subscriptions.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[c]; !ok {
		return
	}

	// Remove from all channels and clean up presence
	for ch := range h.clientChannels[c] {
		if subs, ok := h.channels[ch]; ok {
			delete(subs, c)
			if len(subs) == 0 {
				delete(h.channels, ch)
			}
		}
		// Remove presence
		if entries, ok := h.presence[ch]; ok {
			delete(entries, c.UserID)
			if len(entries) == 0 {
				delete(h.presence, ch)
			}
		}
	}

	delete(h.clientChannels, c)
	delete(h.clients, c)

	// Broadcast presence.left for project channels
	for ch := range h.clientChannels[c] {
		if isProjectChannel(ch) {
			h.publishLocked(ch, NewEvent(EventPresenceLeft, ch, map[string]string{
				"user_id": c.UserID,
			}))
		}
	}

	slog.Info("realtime: client unregistered", "userID", c.UserID)
}

// Subscribe adds a client to a channel.
func (h *Hub) Subscribe(c *Client, channel string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.channels[channel]; !ok {
		h.channels[channel] = make(map[*Client]bool)
	}
	h.channels[channel][c] = true
	h.clientChannels[c][channel] = true

	// Track presence for project channels
	if isProjectChannel(channel) {
		if _, ok := h.presence[channel]; !ok {
			h.presence[channel] = make(map[string]PresenceEntry)
		}
		h.presence[channel][c.UserID] = PresenceEntry{
			UserID:    c.UserID,
			Name:      c.Name,
			AvatarURL: c.AvatarURL,
		}

		// Broadcast presence.joined to other subscribers
		h.publishLocked(channel, NewEvent(EventPresenceJoined, channel, map[string]string{
			"user_id": c.UserID,
			"name":    c.Name,
		}))
	}

	slog.Debug("realtime: subscribed", "userID", c.UserID, "channel", channel)
}

// Unsubscribe removes a client from a channel.
func (h *Hub) Unsubscribe(c *Client, channel string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if subs, ok := h.channels[channel]; ok {
		delete(subs, c)
		if len(subs) == 0 {
			delete(h.channels, channel)
		}
	}
	delete(h.clientChannels[c], channel)

	// Remove presence
	if isProjectChannel(channel) {
		if entries, ok := h.presence[channel]; ok {
			delete(entries, c.UserID)
			if len(entries) == 0 {
				delete(h.presence, channel)
			}
		}

		h.publishLocked(channel, NewEvent(EventPresenceLeft, channel, map[string]string{
			"user_id": c.UserID,
		}))
	}
}

// Publish sends an event to all clients subscribed to the given channel.
func (h *Hub) Publish(channel string, event Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	h.publishLocked(channel, event)
}

// publishLocked sends an event without acquiring the lock (caller must hold it).
func (h *Hub) publishLocked(channel string, event Event) {
	subs, ok := h.channels[channel]
	if !ok {
		return
	}

	data := event.Marshal()
	for client := range subs {
		select {
		case client.send <- data:
		default:
			// Client buffer full, skip (they'll catch up via refetch)
			slog.Warn("realtime: client send buffer full, dropping event",
				"userID", client.UserID, "channel", channel, "event", event.Type)
		}
	}
}

// GetPresence returns the current presence entries for a channel.
func (h *Hub) GetPresence(channel string) []PresenceEntry {
	h.mu.RLock()
	defer h.mu.RUnlock()

	entries, ok := h.presence[channel]
	if !ok {
		return nil
	}

	result := make([]PresenceEntry, 0, len(entries))
	for _, e := range entries {
		result = append(result, e)
	}
	return result
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// isProjectChannel checks if a channel is a project-level channel (for presence tracking).
func isProjectChannel(ch string) bool {
	// project:{uuid} but not project:{uuid}:estimation:{uuid}
	return len(ch) > 8 && ch[:8] == "project:" && len(ch) < 60
}
