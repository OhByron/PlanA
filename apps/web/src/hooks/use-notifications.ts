import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useRealtimeConnected } from './use-realtime';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  workItemId: string | null;
  actorId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

function toNotification(w: Record<string, unknown>): Notification {
  return {
    id: w.id as string,
    userId: w.user_id as string,
    type: w.type as string,
    workItemId: (w.work_item_id as string) ?? null,
    actorId: (w.actor_id as string) ?? null,
    data: (w.data as Record<string, unknown>) ?? {},
    readAt: (w.read_at as string) ?? null,
    createdAt: w.created_at as string,
  };
}

export function useNotifications() {
  const wsConnected = useRealtimeConnected();
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<Notification[]> => {
      const raw = await api.get<Record<string, unknown>[]>('/notifications');
      return raw.map(toNotification);
    },
    // Poll only when WebSocket is disconnected
    refetchInterval: wsConnected ? false : 30_000,
  });
}

export function useUnreadCount() {
  const wsConnected = useRealtimeConnected();
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const raw = await api.get<{ count: number }>('/notifications/unread-count');
      return raw.count;
    },
    refetchInterval: wsConnected ? false : 30_000,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read', {}),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}
