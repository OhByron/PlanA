import { useQuery } from '@tanstack/react-query';
import type { WorkItem } from '@projecta/types';
import { api } from '../lib/api-client';
import { toWorkItem } from '../lib/api-transforms';

export function useMyWorkItems() {
  return useQuery({
    queryKey: ['my-work-items'],
    queryFn: async (): Promise<WorkItem[]> => {
      const raw = await api.get<unknown[]>('/me/work-items');
      return raw.map(toWorkItem);
    },
  });
}
