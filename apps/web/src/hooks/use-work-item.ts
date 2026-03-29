import { useQuery } from '@tanstack/react-query';
import type { WorkItem } from '@projecta/types';
import { api } from '../lib/api-client';
import { toWorkItem } from '../lib/api-transforms';

export function useWorkItem(projectId: string, workItemId: string) {
  return useQuery({
    queryKey: ['work-item', workItemId],
    queryFn: async (): Promise<WorkItem> => {
      const raw = await api.get(`/projects/${projectId}/work-items/${workItemId}`);
      return toWorkItem(raw);
    },
    enabled: !!projectId && !!workItemId,
  });
}
