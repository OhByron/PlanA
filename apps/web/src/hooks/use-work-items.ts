import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkItem } from '@projecta/types';
import { api } from '../lib/api-client';
import { toWorkItem } from '../lib/api-transforms';

interface WorkItemFilters {
  type?: string;
  status?: string;
  epicId?: string;
  assigneeId?: string;
}

export function useWorkItems(projectId: string, filters?: WorkItemFilters) {
  return useQuery({
    queryKey: ['work-items', projectId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.epicId) params.set('epic_id', filters.epicId);
      if (filters?.assigneeId) params.set('assignee_id', filters.assigneeId);
      const qs = params.toString();
      const raw = await api.get<unknown[]>(
        `/projects/${projectId}/work-items${qs ? `?${qs}` : ''}`,
      );
      return raw.map(toWorkItem);
    },
  });
}

export function useUpdateWorkItem(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workItemId, data }: { workItemId: string; data: Record<string, unknown> }) => {
      // Transform camelCase keys to snake_case for the API
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        body[snakeKey] = value;
      }
      const raw = await api.patch(`/projects/${projectId}/work-items/${workItemId}`, body);
      return toWorkItem(raw);
    },
    // Optimistic update for instant feedback
    onMutate: async ({ workItemId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['work-items', projectId] });
      const previousItems = queryClient.getQueryData<WorkItem[]>(['work-items', projectId, undefined]);

      if (previousItems) {
        queryClient.setQueryData<WorkItem[]>(
          ['work-items', projectId, undefined],
          previousItems.map((item) =>
            item.id === workItemId ? { ...item, ...data } : item,
          ),
        );
      }

      return { previousItems };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(['work-items', projectId, undefined], context.previousItems);
      }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['work-item', vars.workItemId] });
      queryClient.invalidateQueries({ queryKey: ['work-items', projectId] });
    },
  });
}

export function useCreateWorkItem(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const raw = await api.post(`/projects/${projectId}/work-items`, data);
      return toWorkItem(raw);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items', projectId] });
    },
  });
}
