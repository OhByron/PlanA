import type { WorkItem } from '@projecta/types';
import type { ProjectMember } from '../../../hooks/use-project-members';
import type { MergedEdge } from './use-graph-draft-state';

export type ValidationSeverity = 'error' | 'warning';
export type ValidationType =
  | 'circular_dependency'
  | 'resource_overallocation'
  | 'conflicting_state';

export interface ValidationWarning {
  type: ValidationType;
  severity: ValidationSeverity;
  message: string;
  itemIds: string[];
}

/**
 * Detects circular dependencies using DFS among active depends_on edges.
 */
export function detectCycles(edges: MergedEdge[]): ValidationWarning[] {
  const activeEdges = edges.filter(
    (e) => !e.isRemoved && e.type === 'depends_on',
  );

  // Build adjacency: source -> targets it depends on
  const adj = new Map<string, string[]>();
  for (const edge of activeEdges) {
    const existing = adj.get(edge.sourceId) ?? [];
    existing.push(edge.targetId);
    adj.set(edge.sourceId, existing);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const warnings: ValidationWarning[] = [];

  function dfs(node: string, path: string[]): boolean {
    if (inStack.has(node)) {
      // Found cycle — extract it
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart);
      warnings.push({
        type: 'circular_dependency',
        severity: 'error',
        message: `Circular dependency detected: ${cycle.length} items form a cycle`,
        itemIds: cycle,
      });
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    for (const neighbor of adj.get(node) ?? []) {
      if (dfs(neighbor, [...path, node])) return true;
    }

    inStack.delete(node);
    return false;
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return warnings;
}

/**
 * Detects resource overallocation: more parallel tasks of a given role
 * than available members with that role.
 *
 * "Parallel" tasks = tasks with no dependency chain between them that are
 * both in an active status (ready, in_progress, in_review).
 */
export function detectOverallocation(
  items: WorkItem[],
  edges: MergedEdge[],
  members: ProjectMember[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Count developers (job_role = 'dev')
  const devCount = members.filter((m) => m.jobRole === 'dev').length;
  if (devCount === 0) return warnings;

  const activeEdges = edges.filter(
    (e) => !e.isRemoved && e.type === 'depends_on',
  );

  // Build dependency graph for reachability
  const dependsOn = new Map<string, Set<string>>();
  for (const edge of activeEdges) {
    const set = dependsOn.get(edge.sourceId) ?? new Set();
    set.add(edge.targetId);
    dependsOn.set(edge.sourceId, set);
  }

  // Compute transitive closure (reachability) for active items
  const activeItems = items.filter((i) =>
    !i.stateIsTerminal && !i.isCancelled && !i.stateIsInitial,
  );

  // Find items that can run in parallel (no path between them)
  // For simplicity, count items in active states that are not blocked by each other
  const activeDev = activeItems.filter((i) => i.type === 'task' || i.type === 'story');

  // Group into parallelism levels using BFS layers
  const inDegree = new Map<string, number>();
  const activeIds = new Set(activeDev.map((i) => i.id));

  for (const item of activeDev) {
    inDegree.set(item.id, 0);
  }
  for (const edge of activeEdges) {
    if (activeIds.has(edge.sourceId) && activeIds.has(edge.targetId)) {
      inDegree.set(edge.sourceId, (inDegree.get(edge.sourceId) ?? 0) + 1);
    }
  }

  // Find the widest layer (max parallelism)
  const assigned = new Set<string>();
  let currentLayer = activeDev
    .filter((i) => (inDegree.get(i.id) ?? 0) === 0)
    .map((i) => i.id);
  let maxParallel = currentLayer.length;

  const outEdges = new Map<string, string[]>();
  for (const edge of activeEdges) {
    if (activeIds.has(edge.sourceId) && activeIds.has(edge.targetId)) {
      const existing = outEdges.get(edge.targetId) ?? [];
      existing.push(edge.sourceId);
      outEdges.set(edge.targetId, existing);
    }
  }

  while (currentLayer.length > 0) {
    for (const id of currentLayer) assigned.add(id);
    const nextLayer: string[] = [];
    for (const id of currentLayer) {
      for (const dep of outEdges.get(id) ?? []) {
        if (assigned.has(dep)) continue;
        const remaining = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, remaining);
        if (remaining <= 0) nextLayer.push(dep);
      }
    }
    currentLayer = nextLayer;
    if (currentLayer.length > maxParallel) maxParallel = currentLayer.length;
  }

  if (maxParallel > devCount) {
    warnings.push({
      type: 'resource_overallocation',
      severity: 'warning',
      message: `Up to ${maxParallel} tasks could run in parallel, but only ${devCount} developer${devCount > 1 ? 's' : ''} available`,
      itemIds: activeDev.map((i) => i.id),
    });
  }

  return warnings;
}

/**
 * Detects conflicting dependency states.
 */
export function detectConflicts(
  edges: MergedEdge[],
  items: WorkItem[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const activeEdges = edges.filter(
    (e) => !e.isRemoved && e.type === 'depends_on' && e.strength === 'hard',
  );

  for (const edge of activeEdges) {
    const source = itemMap.get(edge.sourceId);
    const target = itemMap.get(edge.targetId);
    if (!source || !target) continue;

    // Source is actively being worked but its dependency is still in initial state (backlog)
    if (
      !source.stateIsTerminal && !source.isCancelled && !source.stateIsInitial &&
      target.stateIsInitial
    ) {
      warnings.push({
        type: 'conflicting_state',
        severity: 'warning',
        message: `An active item depends on an item still in backlog`,
        itemIds: [edge.sourceId, edge.targetId],
      });
    }

    // Dependency target was cancelled but source is not done/cancelled
    if (
      target.isCancelled &&
      !source.stateIsTerminal && !source.isCancelled
    ) {
      warnings.push({
        type: 'conflicting_state',
        severity: 'warning',
        message: `An item depends on a cancelled item`,
        itemIds: [edge.sourceId, edge.targetId],
      });
    }
  }

  return warnings;
}

/**
 * Run all validations and return combined results.
 */
export function validateGraph(
  edges: MergedEdge[],
  items: WorkItem[],
  members: ProjectMember[],
): ValidationWarning[] {
  return [
    ...detectCycles(edges),
    ...detectOverallocation(items, edges, members),
    ...detectConflicts(edges, items),
  ];
}
