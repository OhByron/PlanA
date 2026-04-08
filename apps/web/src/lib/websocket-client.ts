/**
 * RealtimeClient manages a single WebSocket connection to the PlanA API.
 * Supports channel subscriptions, automatic reconnection with exponential
 * backoff, and event listeners.
 */

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeEvent {
  type: string;
  channel: string;
  payload: Record<string, string>;
  ts: number;
}

type EventCallback = (event: RealtimeEvent) => void;
type StateCallback = (state: ConnectionState) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string = '';
  private subscriptions = new Set<string>();
  private listeners = new Map<string, Set<EventCallback>>();
  private stateListeners = new Set<StateCallback>();
  private state: ConnectionState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  private static MAX_RECONNECT_DELAY = 30_000;
  private static PING_INTERVAL = 30_000;

  /** Connect to the WebSocket endpoint with the given JWT token. */
  connect(token: string): void {
    this.token = token;
    this.destroyed = false;
    this.doConnect();
  }

  /** Disconnect and stop reconnecting. */
  disconnect(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /** Subscribe to a channel. Re-subscribes automatically on reconnect. */
  subscribe(channel: string): void {
    this.subscriptions.add(channel);
    this.sendAction('subscribe', channel);
  }

  /** Unsubscribe from a channel. */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this.sendAction('unsubscribe', channel);
  }

  /** Listen for events of a specific type. Returns an unsubscribe function. */
  on(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
    return () => this.off(eventType, callback);
  }

  /** Remove a specific event listener. */
  off(eventType: string, callback: EventCallback): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  /** Listen for connection state changes. */
  onStateChange(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    // Immediately fire with current state
    callback(this.state);
    return () => this.stateListeners.delete(callback);
  }

  /** Current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /** Whether the client is connected and ready. */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  // --- Private ---

  private doConnect(): void {
    if (this.destroyed || !this.token) return;

    this.setState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/ws?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');

      // Re-subscribe to all channels
      for (const channel of this.subscriptions) {
        this.sendAction('subscribe', channel);
      }

      // Start ping interval
      this.pingTimer = setInterval(() => {
        this.sendAction('ping', '');
      }, RealtimeClient.PING_INTERVAL);
    };

    this.ws.onmessage = (event) => {
      // Server may batch multiple messages separated by newlines
      const messages = (event.data as string).split('\n');
      for (const msg of messages) {
        if (!msg.trim()) continue;
        try {
          const parsed = JSON.parse(msg) as RealtimeEvent;
          this.dispatch(parsed);
        } catch {
          // Ignore malformed messages
        }
      }
    };

    this.ws.onclose = () => {
      this.clearTimers();
      this.ws = null;
      this.setState('disconnected');
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
    };
  }

  private dispatch(event: RealtimeEvent): void {
    // Fire type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const cb of typeListeners) {
        try {
          cb(event);
        } catch {
          // Don't let listener errors break the event loop
        }
      }
    }

    // Fire wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const cb of wildcardListeners) {
        try {
          cb(event);
        } catch {
          // Ignore
        }
      }
    }
  }

  private sendAction(action: string, channel: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, channel }));
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt) + Math.random() * 1000,
      RealtimeClient.MAX_RECONNECT_DELAY,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const cb of this.stateListeners) {
      try {
        cb(state);
      } catch {
        // Ignore
      }
    }
  }
}
