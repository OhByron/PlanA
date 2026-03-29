import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AcceptanceCriterion } from '@projecta/types';
import { api } from '../lib/api-client';
import { toAcceptanceCriterion } from '../lib/api-transforms';

export function useAcceptanceCriteria(workItemId: string) {
  return useQuery({
    queryKey: ['acceptance-criteria', workItemId],
    queryFn: async (): Promise<AcceptanceCriterion[]> => {
      const raw = await api.get<unknown[]>(`/work-items/${workItemId}/acceptance-criteria`);
      return raw.map(toAcceptanceCriterion);
    },
    enabled: !!workItemId,
  });
}

export function useCreateAcceptanceCriterion(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { given_clause: string; when_clause: string; then_clause: string }) => {
      const raw = await api.post(`/work-items/${workItemId}/acceptance-criteria`, data);
      return toAcceptanceCriterion(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['acceptance-criteria', workItemId] }),
  });
}

export function useUpdateAcceptanceCriterion(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ acId, data }: { acId: string; data: Record<string, unknown> }) => {
      const raw = await api.patch(`/work-items/${workItemId}/acceptance-criteria/${acId}`, data);
      return toAcceptanceCriterion(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['acceptance-criteria', workItemId] }),
  });
}

export function useDeleteAcceptanceCriterion(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acId: string) => {
      await api.delete(`/work-items/${workItemId}/acceptance-criteria/${acId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['acceptance-criteria', workItemId] }),
  });
}
