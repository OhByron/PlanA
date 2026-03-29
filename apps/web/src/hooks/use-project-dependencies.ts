import { useQuery } from '@tanstack/react-query';
import type { WorkItem } from '@projecta/types';
import { api } from '../lib/api-client';
import type { Dependency } from './use-dependencies';

function toDependency(w: Record<string, unknown>): Dependency {
  return {
    id: w.id as string,
    sourceId: w.source_id as string,
    targetId: w.target_id as string,
    type: w.type as 'depends_on' | 'relates_to',
    createdBy: w.created_by as string,
    createdAt: w.created_at as string,
    targetTitle: w.target_title as string,
    targetType: w.target_type as string,
  };
}

export interface BlockedInfo {
  /** Set of work item IDs that are blocked */
  blockedItems: Set<string>;
  /** Map of work item ID -> list of blockers (id + title) */
  blockerMap: Map<string, { id: string; title: string }[]>;
}

/**
 * Fetches all dependencies for a project in one request.
 * Computes which items are blocked based on `depends_on` where the target isn't done.
 */
export function useProjectBlockedStatus(projectId: string, items: WorkItem[]) {
  const itemStatusMap = new Map(items.map((i) => [i.id, i.status]));

  const { data } = useQuery({
    queryKey: ['project-dependencies', projectId],
    queryFn: async (): Promise<Dependency[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/dependencies`,
      );
      return raw.map(toDependency);
    },
    enabled: !!projectId && items.length > 0,
    staleTime: 30_000,
  });

  const deps = data ?? [];
  const blockedItems = new Set<string>();
  const blockerMap = new Map<string, { id: string; title: string }[]>();

  for (const dep of deps) {
    if (dep.type !== 'depends_on') continue;
    const targetStatus = itemStatusMap.get(dep.targetId);
    if (targetStatus && targetStatus !== 'done' && targetStatus !== 'cancelled') {
      blockedItems.add(dep.sourceId);
      const existing = blockerMap.get(dep.sourceId) ?? [];
      existing.push({ id: dep.targetId, title: dep.targetTitle });
      blockerMap.set(dep.sourceId, existing);
    }
  }

  return { blockedItems, blockerMap };
}
