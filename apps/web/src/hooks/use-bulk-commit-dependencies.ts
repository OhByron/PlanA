import { useMutation, useQueryClient } from '@tanstack/react-query';
type DependencyType = 'depends_on' | 'relates_to';
type DependencyStrength = 'hard' | 'soft';
import { api } from '../lib/api-client';
import { toDependency, type Dependency } from './use-dependencies';

export interface BulkCreateItem {
  source_id: string;
  target_id: string;
  type: DependencyType;
  strength: DependencyStrength;
}

export interface BulkCommitPayload {
  create: BulkCreateItem[];
  delete: string[];
}

interface BulkCommitRawResponse {
  created: number;
  deleted: number;
  deps: Record<string, unknown>[];
}

export interface BulkCommitResult {
  created: number;
  deleted: number;
  deps: Dependency[];
}

export function useBulkCommitDependencies(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkCommitPayload): Promise<BulkCommitResult> => {
      const raw = await api.post<BulkCommitRawResponse>(
        `/projects/${projectId}/dependencies/bulk`,
        payload,
      );
      return {
        created: raw.created,
        deleted: raw.deleted,
        deps: raw.deps.map(toDependency),
      };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project-dependencies', projectId] });
    },
  });
}
