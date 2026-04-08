import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface ActivityEntry {
  id: string;
  projectId: string;
  workItemId: string | null;
  sprintId: string | null;
  epicId: string | null;
  actorId: string;
  actorName: string;
  actorAvatar: string | null;
  eventType: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

function toActivity(w: Record<string, unknown>): ActivityEntry {
  return {
    id: w.id as string,
    projectId: w.project_id as string,
    workItemId: (w.work_item_id as string) ?? null,
    sprintId: (w.sprint_id as string) ?? null,
    epicId: (w.epic_id as string) ?? null,
    actorId: w.actor_id as string,
    actorName: w.actor_name as string,
    actorAvatar: (w.actor_avatar as string) ?? null,
    eventType: w.event_type as string,
    changes: (w.changes as Record<string, unknown>) ?? {},
    createdAt: w.created_at as string,
  };
}

export function useProjectActivity(projectId: string) {
  return useQuery({
    queryKey: ['activity', projectId],
    queryFn: async () => {
      const raw = await api.get<{ items: Record<string, unknown>[] }>(`/projects/${projectId}/activity`);
      return raw.items.map(toActivity);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useWorkItemActivity(workItemId: string) {
  return useQuery({
    queryKey: ['activity', 'work-item', workItemId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>[]>(`/work-items/${workItemId}/activity`);
      return raw.map(toActivity);
    },
    enabled: !!workItemId,
    staleTime: 15_000,
  });
}
