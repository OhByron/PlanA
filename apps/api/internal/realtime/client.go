package realtime

import (
	"encoding/json"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 90 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = 30 * time.Second

	// Maximum message size allowed from peer.
	maxMessageSize = 4096

	// Send buffer size per client.
	sendBufferSize = 256
)

// Client represents a single WebSocket connection.
type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	UserID    string
	Name      string
	AvatarURL string

	// authorize is called when the client subscribes to a channel.
	// Returns true if the client is allowed to subscribe.
	authorize func(userID, channel string) bool
}

// NewClient creates a new Client.
func NewClient(hub *Hub, conn *websocket.Conn, userID, name, avatarURL string, authorize func(string, string) bool) *Client {
	return &Client{
		hub:       hub,
		conn:      conn,
		send:      make(chan []byte, sendBufferSize),
		UserID:    userID,
		Name:      name,
		AvatarURL: avatarURL,
		authorize: authorize,
	}
}

// ReadPump reads messages from the WebSocket connection.
// Runs in its own goroutine per client.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("realtime: unexpected close", "userID", c.UserID, "error", err)
			}
			break
		}

		var msg ClientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			slog.Debug("realtime: invalid message", "userID", c.UserID, "error", err)
			continue
		}

		switch msg.Action {
		case "subscribe":
			if msg.Channel == "" {
				continue
			}
			if c.authorize != nil && !c.authorize(c.UserID, msg.Channel) {
				slog.Warn("realtime: unauthorized subscribe", "userID", c.UserID, "channel", msg.Channel)
				// Send error back
				errEvent := NewEvent("error", "", map[string]string{
					"message": "Not authorized to subscribe to " + msg.Channel,
				})
				select {
				case c.send <- errEvent.Marshal():
				default:
				}
				continue
			}
			c.hub.Subscribe(c, msg.Channel)

		case "unsubscribe":
			if msg.Channel == "" {
				continue
			}
			c.hub.Unsubscribe(c, msg.Channel)

		case "ping":
			// Client-level ping (in addition to WebSocket-level ping/pong).
			// Reset read deadline.
			c.conn.SetReadDeadline(time.Now().Add(pongWait))

		case "presence":
			// Return current presence for a channel
			if msg.Channel == "" {
				continue
			}
			entries := c.hub.GetPresence(msg.Channel)
			presenceEvent := NewEvent("presence.list", msg.Channel, nil)
			// Encode entries into payload
			payload := make(map[string]string)
			for i, e := range entries {
				key := "user_" + string(rune('0'+i))
				if b, err := json.Marshal(e); err == nil {
					payload[key] = string(b)
				}
			}
			presenceEvent.Payload = payload
			select {
			case c.send <- presenceEvent.Marshal():
			default:
			}
		}
	}
}

// WritePump writes messages from the send channel to the WebSocket connection.
// Runs in its own goroutine per client.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Drain any queued messages into the same write
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
