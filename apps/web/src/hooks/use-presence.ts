import { useState, useCallback } from 'react';
import { useRealtimeSubscription } from './use-realtime';
import type { RealtimeEvent } from '../lib/websocket-client';

export interface PresenceEntry {
  userId: string;
  name: string;
}

/**
 * Track who's viewing a project in real time.
 * Subscribes to the project channel and listens for presence.joined/left events.
 */
export function usePresence(projectId: string | null): {
  viewers: PresenceEntry[];
  count: number;
} {
  const [viewers, setViewers] = useState<Map<string, PresenceEntry>>(new Map());

  const handleEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === 'presence.joined') {
      setViewers((prev) => {
        const next = new Map(prev);
        next.set(event.payload.user_id ?? '', {
          userId: event.payload.user_id ?? '',
          name: event.payload.name ?? '',
        });
        return next;
      });
    } else if (event.type === 'presence.left') {
      setViewers((prev) => {
        const next = new Map(prev);
        next.delete(event.payload.user_id ?? '');
        return next;
      });
    }
  }, []);

  useRealtimeSubscription(
    projectId ? `project:${projectId}` : null,
    ['presence.joined', 'presence.left'],
    handleEvent,
  );

  const viewerList = Array.from(viewers.values());
  return { viewers: viewerList, count: viewerList.length };
}
