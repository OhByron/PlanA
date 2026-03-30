import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Comment } from '@projecta/types';
import { api } from '../lib/api-client';
import { toComment } from '../lib/api-transforms';
import type { PaginatedResponse } from '../lib/api-pagination';

export function useComments(workItemId: string) {
  return useQuery({
    queryKey: ['comments', workItemId],
    queryFn: async (): Promise<Comment[]> => {
      const raw = await api.get<PaginatedResponse>(`/work-items/${workItemId}/comments?page_size=200`);
      return raw.items.map(toComment);
    },
    enabled: !!workItemId,
  });
}

export function useCreateComment(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const raw = await api.post(`/work-items/${workItemId}/comments`, { body });
      return toComment(raw);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['comments', workItemId] }),
  });
}
