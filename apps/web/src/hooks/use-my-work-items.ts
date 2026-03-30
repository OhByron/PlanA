import { useQuery } from '@tanstack/react-query';
import type { WorkItem } from '@projecta/types';
import { api } from '../lib/api-client';
import { toWorkItem } from '../lib/api-transforms';

export function useMyWorkItems() {
  return useQuery({
    queryKey: ['my-work-items'],
    queryFn: async (): Promise<WorkItem[]> => {
      // /me/work-items may or may not be paginated — handle both formats
      const data = await api.get<unknown>('/me/work-items');
      const arr = Array.isArray(data) ? data : (data as { items: unknown[] }).items;
      return arr.map(toWorkItem);
    },
  });
}
