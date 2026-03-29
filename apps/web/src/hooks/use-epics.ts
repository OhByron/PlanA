import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Epic } from '@projecta/types';
import { api } from '../lib/api-client';
import { toEpic } from '../lib/api-transforms';

export function useEpics(projectId: string) {
  return useQuery({
    queryKey: ['epics', projectId],
    queryFn: async (): Promise<Epic[]> => {
      const raw = await api.get<unknown[]>(`/projects/${projectId}/epics`);
      return raw.map(toEpic);
    },
    enabled: !!projectId,
  });
}

export function useEpic(projectId: string, epicId: string) {
  return useQuery({
    queryKey: ['epic', epicId],
    queryFn: async (): Promise<Epic> => {
      const raw = await api.get(`/projects/${projectId}/epics/${epicId}`);
      return toEpic(raw);
    },
    enabled: !!projectId && !!epicId,
  });
}

export function useCreateEpic(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const raw = await api.post(`/projects/${projectId}/epics`, data);
      return toEpic(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['epics', projectId] }),
  });
}

export function useUpdateEpic(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ epicId, data }: { epicId: string; data: Record<string, unknown> }) => {
      const raw = await api.patch(`/projects/${projectId}/epics/${epicId}`, data);
      return toEpic(raw);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['epic', vars.epicId] });
      qc.invalidateQueries({ queryKey: ['epics', projectId] });
    },
  });
}

export function useDeleteEpic(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (epicId: string) => {
      await api.delete(`/projects/${projectId}/epics/${epicId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['epics', projectId] }),
  });
}
