import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface ContainerDependency {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'depends_on' | 'relates_to';
  strength: 'hard' | 'soft';
  createdBy: string;
  createdAt: string;
}

function toContainerDep(w: Record<string, unknown>): ContainerDependency {
  return {
    id: w.id as string,
    sourceId: w.source_id as string,
    targetId: w.target_id as string,
    type: w.type as 'depends_on' | 'relates_to',
    strength: (w.strength as 'hard' | 'soft') ?? 'hard',
    createdBy: w.created_by as string,
    createdAt: w.created_at as string,
  };
}

// ---- Epic Dependencies ----

export function useEpicDependencies(projectId: string) {
  return useQuery({
    queryKey: ['epic-dependencies', projectId],
    queryFn: async (): Promise<ContainerDependency[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/epic-dependencies`,
      );
      return raw.map(toContainerDep);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useCreateEpicDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ epicId, data }: { epicId: string; data: { target_id: string; type: string; strength?: string } }) => {
      const raw = await api.post(`/projects/${projectId}/epics/${epicId}/dependencies`, data);
      return toContainerDep(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['epic-dependencies', projectId] }),
  });
}

export function useDeleteEpicDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ epicId, depId }: { epicId: string; depId: string }) => {
      await api.delete(`/projects/${projectId}/epics/${epicId}/dependencies/${depId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['epic-dependencies', projectId] }),
  });
}

// ---- Sprint Dependencies ----

export function useSprintDependencies(projectId: string) {
  return useQuery({
    queryKey: ['sprint-dependencies', projectId],
    queryFn: async (): Promise<ContainerDependency[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/sprint-dependencies`,
      );
      return raw.map(toContainerDep);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useCreateSprintDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, data }: { sprintId: string; data: { target_id: string; type: string; strength?: string } }) => {
      const raw = await api.post(`/sprints/${sprintId}/dependencies`, data);
      return toContainerDep(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sprint-dependencies', projectId] }),
  });
}

export function useDeleteSprintDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, depId }: { sprintId: string; depId: string }) => {
      await api.delete(`/sprints/${sprintId}/dependencies/${depId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sprint-dependencies', projectId] }),
  });
}
