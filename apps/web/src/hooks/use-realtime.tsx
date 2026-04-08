import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeClient, type ConnectionState, type RealtimeEvent } from '../lib/websocket-client';
import { getToken } from '../lib/api-client';

// --- Context ---

interface RealtimeContextValue {
  client: RealtimeClient;
  state: ConnectionState;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** Provider that creates and manages the WebSocket connection. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef<RealtimeClient | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');

  if (!clientRef.current) {
    clientRef.current = new RealtimeClient();
  }

  useEffect(() => {
    const client = clientRef.current!;
    const unsubState = client.onStateChange(setState);

    // Connect with current token
    const token = getToken();
    if (token) {
      client.connect(token);
    }

    return () => {
      unsubState();
      client.disconnect();
    };
  }, []);

  // Reconnect when token changes (e.g., after login)
  useEffect(() => {
    const token = getToken();
    if (token && clientRef.current) {
      clientRef.current.connect(token);
    }
  }, []);

  return (
    <RealtimeContext.Provider value={{ client: clientRef.current, state }}>
      {children}
    </RealtimeContext.Provider>
  );
}

// --- Hooks ---

/** Access the realtime client and connection state. */
export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    // Return a dummy when no provider (e.g., during SSR or tests)
    return { client: new RealtimeClient(), state: 'disconnected' };
  }
  return ctx;
}

/** Whether the WebSocket is currently connected. */
export function useRealtimeConnected(): boolean {
  const { state } = useRealtime();
  return state === 'connected';
}

/**
 * Subscribe to a channel and listen for specific event types.
 * Automatically subscribes on mount and unsubscribes on unmount.
 * Re-subscribes when channel or event types change.
 */
export function useRealtimeSubscription(
  channel: string | null,
  eventTypes: string[],
  callback: (event: RealtimeEvent) => void,
): void {
  const { client } = useRealtime();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stableCallback = useCallback((event: RealtimeEvent) => {
    callbackRef.current(event);
  }, []);

  useEffect(() => {
    if (!channel) return;

    client.subscribe(channel);

    const unsubscribers = eventTypes.map((type) => client.on(type, (event) => {
      // Only fire if the event is for our channel
      if (event.channel === channel) {
        stableCallback(event);
      }
    }));

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      client.unsubscribe(channel);
    };
  }, [client, channel, eventTypes.join(','), stableCallback]);
}
