import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface WorkItemLink {
  id: string;
  workItemId: string;
  label: string;
  url: string;
  createdAt: string;
}

function toLink(w: Record<string, unknown>): WorkItemLink {
  return {
    id: w.id as string,
    workItemId: w.work_item_id as string,
    label: w.label as string,
    url: w.url as string,
    createdAt: w.created_at as string,
  };
}

export function useLinks(workItemId: string) {
  return useQuery({
    queryKey: ['links', workItemId],
    queryFn: async (): Promise<WorkItemLink[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/work-items/${workItemId}/links`);
      return raw.map(toLink);
    },
    enabled: !!workItemId,
  });
}

export function useCreateLink(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { label: string; url: string }) => {
      const raw = await api.post(`/work-items/${workItemId}/links`, data);
      return toLink(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['links', workItemId] }),
  });
}

export function useDeleteLink(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      await api.delete(`/work-items/${workItemId}/links/${linkId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['links', workItemId] }),
  });
}
