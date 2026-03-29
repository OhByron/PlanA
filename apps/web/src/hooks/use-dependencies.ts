import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Dependency {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'depends_on' | 'relates_to';
  createdBy: string;
  createdAt: string;
  targetTitle: string;
  targetType: string;
}

function toDependency(w: Record<string, unknown>): Dependency {
  return {
    id: w.id as string,
    sourceId: w.source_id as string,
    targetId: w.target_id as string,
    type: w.type as 'depends_on' | 'relates_to',
    createdBy: w.created_by as string,
    createdAt: w.created_at as string,
    targetTitle: w.target_title as string,
    targetType: w.target_type as string,
  };
}

export function useDependencies(workItemId: string) {
  return useQuery({
    queryKey: ['dependencies', workItemId],
    queryFn: async (): Promise<Dependency[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/work-items/${workItemId}/dependencies`,
      );
      return raw.map(toDependency);
    },
    enabled: !!workItemId,
  });
}

export function useCreateDependency(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { target_id: string; type: string }) => {
      const raw = await api.post(`/work-items/${workItemId}/dependencies`, data);
      return toDependency(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['dependencies', workItemId] }),
  });
}

export function useDeleteDependency(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (depId: string) => {
      await api.delete(`/work-items/${workItemId}/dependencies/${depId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['dependencies', workItemId] }),
  });
}
