package realtime

import (
	"encoding/json"
	"time"
)

// Event types
const (
	EventWorkItemCreated = "work_item.created"
	EventWorkItemUpdated = "work_item.updated"
	EventWorkItemDeleted = "work_item.deleted"

	EventVoteCast   = "vote.cast"
	EventVoteLocked = "vote.locked"
	EventVoteReset  = "vote.reset"

	EventNotificationCreated = "notification.created"

	EventCommentCreated = "comment.created"

	EventSprintUpdated     = "sprint.updated"
	EventSprintItemAdded   = "sprint_item.added"
	EventSprintItemRemoved = "sprint_item.removed"

	EventPresenceJoined = "presence.joined"
	EventPresenceLeft   = "presence.left"
)

// Event is a server-to-client message.
type Event struct {
	Type    string            `json:"type"`
	Channel string            `json:"channel"`
	Payload map[string]string `json:"payload"`
	TS      int64             `json:"ts"`
}

// NewEvent creates an event with the current timestamp.
func NewEvent(eventType, channel string, payload map[string]string) Event {
	return Event{
		Type:    eventType,
		Channel: channel,
		Payload: payload,
		TS:      time.Now().Unix(),
	}
}

// Marshal serializes the event to JSON bytes.
func (e Event) Marshal() []byte {
	b, _ := json.Marshal(e)
	return b
}

// ClientMessage is a client-to-server message.
type ClientMessage struct {
	Action  string `json:"action"`  // subscribe, unsubscribe, ping, presence
	Channel string `json:"channel"` // target channel
}
