import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Sprint } from '@projecta/types';
import { api } from '../lib/api-client';
import { toSprint, toWorkItem } from '../lib/api-transforms';
import type { PaginatedResponse } from '../lib/api-pagination';
import type { WorkItem } from '@projecta/types';

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: ['sprints', projectId],
    queryFn: async (): Promise<Sprint[]> => {
      const raw = await api.get<PaginatedResponse>(`/projects/${projectId}/sprints?page_size=200`);
      return raw.items.map(toSprint);
    },
    enabled: !!projectId,
  });
}

export function useCreateSprint(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const raw = await api.post(`/projects/${projectId}/sprints`, data);
      return toSprint(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sprints', projectId] }),
  });
}

export function useUpdateSprint(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, data }: { sprintId: string; data: Record<string, unknown> }) => {
      const raw = await api.patch(`/projects/${projectId}/sprints/${sprintId}`, data);
      return toSprint(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sprints', projectId] }),
  });
}

export function useDeleteSprint(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sprintId: string) => {
      await api.delete(`/projects/${projectId}/sprints/${sprintId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sprints', projectId] }),
  });
}

export function useSprintItems(sprintId: string) {
  return useQuery({
    queryKey: ['sprint-items', sprintId],
    queryFn: async (): Promise<WorkItem[]> => {
      const raw = await api.get<unknown[]>(`/sprints/${sprintId}/items`);
      return raw.map(toWorkItem);
    },
    enabled: !!sprintId,
  });
}

export function useAddSprintItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, workItemId }: { sprintId: string; workItemId: string }) => {
      await api.post(`/sprints/${sprintId}/items/${workItemId}`, {});
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['sprint-items', vars.sprintId] });
      qc.invalidateQueries({ queryKey: ['sprint-assigned'] });
    },
  });
}

export function useRemoveSprintItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, workItemId }: { sprintId: string; workItemId: string }) => {
      await api.delete(`/sprints/${sprintId}/items/${workItemId}`);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['sprint-items', vars.sprintId] });
      qc.invalidateQueries({ queryKey: ['sprint-assigned'] });
    },
  });
}
