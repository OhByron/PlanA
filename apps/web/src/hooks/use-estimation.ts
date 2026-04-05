import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface EstimationVote {
  id: string;
  memberId: string;
  memberName: string;
  value: number;
  createdAt: string;
}

function toVote(w: Record<string, unknown>): EstimationVote {
  return {
    id: w.id as string,
    memberId: w.member_id as string,
    memberName: w.member_name as string,
    value: w.value as number,
    createdAt: w.created_at as string,
  };
}

export function useEstimationVotes(workItemId: string) {
  return useQuery({
    queryKey: ['estimation-votes', workItemId],
    queryFn: async (): Promise<EstimationVote[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/work-items/${workItemId}/votes`);
      return raw.map(toVote);
    },
    enabled: !!workItemId,
    refetchInterval: 5000, // Poll every 5s for other team members' votes
  });
}

export function useCastVote(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) => {
      return api.post(`/work-items/${workItemId}/votes`, { value });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['estimation-votes', workItemId] }),
  });
}

export function useLockEstimate(workItemId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) => {
      return api.post(`/work-items/${workItemId}/votes/lock`, { value });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['estimation-votes', workItemId] });
      qc.invalidateQueries({ queryKey: ['work-items', projectId] });
      qc.invalidateQueries({ queryKey: ['work-item', workItemId] });
    },
  });
}

export function useResetVotes(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete(`/work-items/${workItemId}/votes`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['estimation-votes', workItemId] }),
  });
}
