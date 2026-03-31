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

export interface TestResult {
  id: string;
  projectId: string;
  workItemId: string | null;
  testName: string;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
  source: string;
  suiteName: string | null;
  runId: string | null;
  reportedAt: string;
  createdAt: string;
}

export function useTestResult(projectId: string, resultId: string | null) {
  return useQuery({
    queryKey: ['test-result', resultId],
    queryFn: async (): Promise<TestResult> => {
      const raw = await api.get<Record<string, unknown>>(`/projects/${projectId}/test-results/${resultId}`);
      return {
        id: raw.id as string,
        projectId: raw.project_id as string,
        workItemId: (raw.work_item_id as string) ?? null,
        testName: raw.test_name as string,
        status: raw.status as string,
        durationMs: (raw.duration_ms as number) ?? null,
        errorMessage: (raw.error_message as string) ?? null,
        source: raw.source as string,
        suiteName: (raw.suite_name as string) ?? null,
        runId: (raw.run_id as string) ?? null,
        reportedAt: raw.reported_at as string,
        createdAt: raw.created_at as string,
      };
    },
    enabled: !!resultId && !!projectId,
    staleTime: 60_000,
  });
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
