import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface TestSummary {
  total: number;
  pass: number;
  fail: number;
  error: number;
  skip: number;
  lastRun: string | null;
  status: string;
}

export function useTestSummary(workItemId: string) {
  return useQuery({
    queryKey: ['test-summary', workItemId],
    queryFn: async (): Promise<TestSummary> => {
      const raw = await api.get<Record<string, unknown>>(`/work-items/${workItemId}/test-summary`);
      return {
        total: (raw.total as number) ?? 0,
        pass: (raw.pass as number) ?? 0,
        fail: (raw.fail as number) ?? 0,
        error: (raw.error as number) ?? 0,
        skip: (raw.skip as number) ?? 0,
        lastRun: (raw.last_run as string) ?? null,
        status: (raw.status as string) ?? 'none',
      };
    },
    enabled: !!workItemId,
    staleTime: 60_000,
  });
}
