import { useQuery } from '@tanstack/react-query';
import type { WorkItem } from '@projecta/types';
import { api } from '../lib/api-client';
import { toDependency, type Dependency } from './use-dependencies';

export interface BlockedInfo {
  /** Set of work item IDs that are blocked */
  blockedItems: Set<string>;
  /** Map of work item ID -> list of blockers (id + title) */
  blockerMap: Map<string, { id: string; title: string }[]>;
}

/**
 * Fetches all dependencies for a project in one request.
 * Computes which items are blocked based on hard `depends_on` where the target isn't done.
 */
export function useProjectBlockedStatus(projectId: string, items: WorkItem[]) {
  const itemTerminalMap = new Map(items.map((i) => [i.id, { stateIsTerminal: i.stateIsTerminal, isCancelled: i.isCancelled }]));

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
    // Only hard depends_on relationships create blocking
    if (dep.type !== 'depends_on' || dep.strength !== 'hard') continue;
    const targetState = itemTerminalMap.get(dep.targetId);
    if (targetState && !targetState.stateIsTerminal && !targetState.isCancelled) {
      blockedItems.add(dep.sourceId);
      const existing = blockerMap.get(dep.sourceId) ?? [];
      existing.push({ id: dep.targetId, title: dep.targetTitle });
      blockerMap.set(dep.sourceId, existing);
    }
  }

  return { blockedItems, blockerMap };
}

/** Fetches all project dependencies (for the graph view). */
export function useProjectDependencies(projectId: string) {
  return useQuery({
    queryKey: ['project-dependencies', projectId],
    queryFn: async (): Promise<Dependency[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/dependencies`,
      );
      return raw.map(toDependency);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}
