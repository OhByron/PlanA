import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface BurndownDay {
  date: string;
  remaining: number;
  ideal: number;
}

export interface BurndownData {
  totalPoints: number;
  days: BurndownDay[];
}

export function useBurndown(projectId: string, sprintId: string) {
  return useQuery({
    queryKey: ['burndown', sprintId],
    queryFn: async (): Promise<BurndownData> => {
      const raw = await api.get<{
        total_points: number;
        days: Array<{ date: string; remaining: number; ideal: number }>;
      }>(`/projects/${projectId}/sprints/${sprintId}/burndown`);
      return {
        totalPoints: raw.total_points,
        days: raw.days ?? [],
      };
    },
    enabled: !!projectId && !!sprintId,
    staleTime: 60_000,
  });
}
