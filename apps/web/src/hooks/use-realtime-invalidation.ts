import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useRealtimeSubscription } from './use-realtime';
import type { RealtimeEvent } from '../lib/websocket-client';

// Event types that should trigger query invalidation
const PROJECT_EVENTS = [
  'work_item.created',
  'work_item.updated',
  'work_item.deleted',
  'comment.created',
  'sprint.updated',
  'sprint_item.added',
  'sprint_item.removed',
];

/**
 * Subscribes to a project channel and invalidates relevant TanStack Query
 * caches when events arrive. Skips invalidation if the event was triggered
 * by the current user (they already have fresh data from their own mutation).
 */
export function useProjectRealtimeInvalidation(
  projectId: string | null,
  currentUserId?: string | undefined,
): void {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      // Skip if we triggered this event (optimistic update already applied)
      if (currentUserId && event.payload?.actor_id === currentUserId) {
        return;
      }

      switch (event.type) {
        case 'work_item.created':
        case 'work_item.updated':
        case 'work_item.deleted':
          queryClient.invalidateQueries({ queryKey: ['work-items', projectId] });
          if (event.payload?.id) {
            queryClient.invalidateQueries({ queryKey: ['work-item', event.payload.id] });
          }
          break;

        case 'comment.created':
          if (event.payload?.work_item_id) {
            queryClient.invalidateQueries({ queryKey: ['comments', event.payload.work_item_id] });
          }
          break;

        case 'sprint.updated':
          queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
          break;

        case 'sprint_item.added':
        case 'sprint_item.removed':
          queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
          queryClient.invalidateQueries({ queryKey: ['sprint-assigned', projectId] });
          break;
      }
    },
    [queryClient, projectId, currentUserId],
  );

  useRealtimeSubscription(
    projectId ? `project:${projectId}` : null,
    PROJECT_EVENTS,
    handleEvent,
  );
}

/**
 * Subscribes to estimation poker events for a specific work item.
 * Invalidates the estimation votes query when votes are cast, locked, or reset.
 */
export function useEstimationRealtimeInvalidation(
  projectId: string | null,
  workItemId: string | null,
): void {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    () => {
      if (workItemId) {
        queryClient.invalidateQueries({ queryKey: ['estimation-votes', workItemId] });
      }
    },
    [queryClient, workItemId],
  );

  useRealtimeSubscription(
    projectId && workItemId ? `project:${projectId}:estimation:${workItemId}` : null,
    ['vote.cast', 'vote.locked', 'vote.reset'],
    handleEvent,
  );
}

/**
 * Subscribes to the user's notification channel.
 * Invalidates notification queries when new notifications arrive.
 */
export function useNotificationRealtimeInvalidation(
  userId: string | null,
): void {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    [queryClient],
  );

  useRealtimeSubscription(
    userId ? `user:${userId}` : null,
    ['notification.created'],
    handleEvent,
  );
}
