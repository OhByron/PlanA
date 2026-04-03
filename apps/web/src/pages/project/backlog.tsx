import { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Select, cn } from '@projecta/ui';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { WorkItem, WorkItemStatus, WorkItemType } from '@projecta/types';
import { useWorkItems, useUpdateWorkItem } from '../../hooks/use-work-items';
import { useProjectDependencies } from '../../hooks/use-project-dependencies';
import { SortableWorkItemRow } from '../../components/sortable-work-item-row';
import { QuickCreateWorkItem } from '../../components/quick-create-work-item';
import { HelpOverlay } from '../../components/help-overlay';

type NestReason = 'root' | 'child' | 'depends_on' | 'orphan';
type ViewMode = 'flow' | 'priority';

interface GroupedRow {
  item: WorkItem;
  depth: number;
  reason: NestReason;
  hasNextSibling: boolean;
  continuationLines: number[];
}

export function BacklogPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const search = useSearch({ strict: false }) as { highlight?: string };
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('flow');

  // Highlight support — scroll to and flash an item when arriving from the graph
  const highlightId = search.highlight;
  const highlightRef = useRef<HTMLDivElement>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    setFlashId(highlightId);
    // Clear the search param so refreshing doesn't re-flash
    navigate({
      to: '/p/$projectId/backlog',
      params: { projectId },
      search: {},
      replace: true,
    });
    // Scroll into view after a tick (let the list render)
    requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Clear flash after animation
    const timer = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightId, navigate, projectId]);

  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: t('backlog.allStatuses') },
    { value: 'backlog', label: t('status.backlog') },
    { value: 'ready', label: t('status.ready') },
    { value: 'in_progress', label: t('status.in_progress') },
    { value: 'in_review', label: t('status.in_review') },
    { value: 'done', label: t('status.done') },
  ];

  const TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: t('backlog.allTypes') },
    { value: 'story', label: t('backlog.stories') },
    { value: 'bug', label: t('backlog.bugs') },
    { value: 'task', label: t('backlog.tasks') },
  ];

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (typeFilter) filters.type = typeFilter;

  const { data: items = [], isLoading } = useWorkItems(projectId, Object.keys(filters).length > 0 ? filters : undefined);
  const { data: deps = [] } = useProjectDependencies(projectId);
  const updateItem = useUpdateWorkItem(projectId);

  const filtered = items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (typeFilter && item.type !== typeFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt));

  const calculatedPointsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.type === 'story') {
        const children = items.filter((i) => i.parentId === item.id);
        if (children.length > 0) {
          map.set(item.id, children.reduce((s, c) => s + (c.storyPoints ?? 0), 0));
        }
      }
    }
    return map;
  }, [items]);

  // -----------------------------------------------------------------------
  // Dependency flow view — structural tree + dependency-aware ordering.
  //
  // Nesting is ONLY structural (parentId). Dependencies affect ORDER
  // within the same level: items that are depended upon appear before items
  // that depend on them. This prevents tasks from appearing under
  // unrelated stories just because they share a depends_on edge.
  // -----------------------------------------------------------------------
  const flowGrouped = useMemo((): GroupedRow[] => {
    const filteredIds = new Set(sorted.map((i) => i.id));
    const itemMap = new Map(sorted.map((i) => [i.id, i]));

    // Structural children only (parentId)
    const structChildren = new Map<string, string[]>();
    const hasStructParent = new Set<string>();
    for (const item of sorted) {
      if (item.parentId && filteredIds.has(item.parentId)) {
        hasStructParent.add(item.id);
        const siblings = structChildren.get(item.parentId) ?? [];
        siblings.push(item.id);
        structChildren.set(item.parentId, siblings);
      }
    }

    // Build dependency graph for topological ordering within each level.
    // target must complete before source, so target comes first.
    const dependsOnTarget = new Map<string, Set<string>>(); // source → set of targets it depends on
    for (const dep of deps) {
      if (dep.type !== 'depends_on') continue;
      if (!filteredIds.has(dep.sourceId) || !filteredIds.has(dep.targetId)) continue;
      const set = dependsOnTarget.get(dep.sourceId) ?? new Set();
      set.add(dep.targetId);
      dependsOnTarget.set(dep.sourceId, set);
    }

    // Topological sort for a list of item IDs at the same level.
    // Items depended upon come first; ties broken by orderIndex.
    function topoSort(ids: string[]): string[] {
      if (ids.length <= 1) return ids;
      const idSet = new Set(ids);
      // Count in-level dependencies (only between items in the same list)
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>(); // target → [sources]
      for (const id of ids) {
        inDegree.set(id, 0);
      }
      for (const id of ids) {
        for (const target of dependsOnTarget.get(id) ?? []) {
          if (idSet.has(target)) {
            inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
            const a = adj.get(target) ?? [];
            a.push(id);
            adj.set(target, a);
          }
        }
      }
      // BFS
      const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0)
        .sort((a, b) => (itemMap.get(a)?.orderIndex ?? 0) - (itemMap.get(b)?.orderIndex ?? 0));
      const result: string[] = [];
      const visited = new Set<string>();
      let idx = 0;
      while (idx < queue.length) {
        const current = queue[idx++]!;
        if (visited.has(current)) continue;
        visited.add(current);
        result.push(current);
        const nexts = (adj.get(current) ?? [])
          .sort((a, b) => (itemMap.get(a)?.orderIndex ?? 0) - (itemMap.get(b)?.orderIndex ?? 0));
        for (const next of nexts) {
          const deg = (inDegree.get(next) ?? 1) - 1;
          inDegree.set(next, deg);
          if (deg <= 0) queue.push(next);
        }
      }
      // Any remaining (cycles) appended at end
      for (const id of ids) {
        if (!visited.has(id)) result.push(id);
      }
      return result;
    }

    // Roots = items with no structural parent
    const rootIds = sorted.filter((i) => !hasStructParent.has(i.id)).map((i) => i.id);
    const sortedRoots = topoSort(rootIds);

    // DFS walk — nesting is structural, ordering is dependency-aware
    const flat: Array<{ id: string; depth: number; reason: NestReason }> = [];
    const visited = new Set<string>();

    function walk(id: string, depth: number, reason: NestReason) {
      if (visited.has(id)) return;
      visited.add(id);
      if (!itemMap.has(id)) return;

      // Determine reason: if this item depends on any item already visited at the same
      // level, mark it as 'depends_on' for the badge
      let effectiveReason = reason;
      if (reason === 'root' && depth === 0) {
        for (const target of dependsOnTarget.get(id) ?? []) {
          if (visited.has(target)) { effectiveReason = 'depends_on'; break; }
        }
      }

      flat.push({ id, depth, reason: effectiveReason });

      // Children sorted by dependency order
      const children = structChildren.get(id) ?? [];
      const sortedChildren = topoSort(children);
      for (const childId of sortedChildren) {
        const childReason: NestReason = (() => {
          for (const target of dependsOnTarget.get(childId) ?? []) {
            if (visited.has(target)) return 'depends_on';
          }
          return 'child';
        })();
        walk(childId, depth + 1, childReason);
      }
    }

    for (const rootId of sortedRoots) walk(rootId, 0, 'root');
    // Orphans
    for (const item of sorted) {
      if (!visited.has(item.id)) flat.push({ id: item.id, depth: 0, reason: 'orphan' });
    }

    const result: GroupedRow[] = [];
    for (let i = 0; i < flat.length; i++) {
      const row = flat[i]!;
      const item = itemMap.get(row.id)!;

      let hasNextSibling = false;
      for (let j = i + 1; j < flat.length; j++) {
        const next = flat[j]!;
        if (next.depth < row.depth) break;
        if (next.depth === row.depth) { hasNextSibling = true; break; }
      }

      const continuationLines: number[] = [];
      for (let d = 1; d < row.depth; d++) {
        for (let j = i + 1; j < flat.length; j++) {
          const future = flat[j]!;
          if (future.depth < d) break;
          if (future.depth === d) { continuationLines.push(d); break; }
        }
      }

      result.push({ item, depth: row.depth, reason: row.reason, hasNextSibling, continuationLines });
    }
    return result;
  }, [sorted, deps]);

  // -----------------------------------------------------------------------
  // Priority view — flat list, only structural parent/child nesting
  // -----------------------------------------------------------------------
  const priorityGrouped = useMemo((): GroupedRow[] => {
    const childIds = new Set<string>();
    const parentChildren = new Map<string, typeof sorted>();

    for (const item of sorted) {
      if (item.parentId) {
        childIds.add(item.id);
        const siblings = parentChildren.get(item.parentId) ?? [];
        siblings.push(item);
        parentChildren.set(item.parentId, siblings);
      }
    }

    const result: GroupedRow[] = [];
    for (const item of sorted) {
      if (childIds.has(item.id)) continue;
      result.push({ item, depth: 0, reason: 'root', hasNextSibling: false, continuationLines: [] });
      const children = parentChildren.get(item.id);
      if (children) {
        children.forEach((child, idx) => {
          result.push({
            item: child,
            depth: 1,
            reason: 'child',
            hasNextSibling: idx < children.length - 1,
            continuationLines: [],
          });
        });
      }
    }
    return result;
  }, [sorted]);

  const grouped = viewMode === 'flow' ? flowGrouped : priorityGrouped;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const topLevel = useMemo(
    () => grouped.filter((g) => g.depth === 0).map((g) => g.item),
    [grouped],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdx = topLevel.findIndex((i) => i.id === active.id);
    const overIdx = topLevel.findIndex((i) => i.id === over.id);
    if (activeIdx === -1 || overIdx === -1) return;

    let newOrderIndex: number;
    if (overIdx === 0) {
      newOrderIndex = (topLevel[0]?.orderIndex ?? 0) - 1;
    } else if (overIdx >= topLevel.length - 1) {
      newOrderIndex = (topLevel[topLevel.length - 1]?.orderIndex ?? 0) + 1;
    } else if (activeIdx < overIdx) {
      const above = topLevel[overIdx]!;
      const below = topLevel[overIdx + 1];
      newOrderIndex = below
        ? (above.orderIndex + below.orderIndex) / 2
        : above.orderIndex + 1;
    } else {
      const above = topLevel[overIdx - 1];
      const below = topLevel[overIdx]!;
      newOrderIndex = above
        ? (above.orderIndex + below.orderIndex) / 2
        : below.orderIndex - 1;
    }

    updateItem.mutate({
      workItemId: active.id as string,
      data: { orderIndex: newOrderIndex },
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <HelpOverlay id="backlog-intro" title={t('backlog.helpTitle')}>
        <p className="mb-2">{t('backlog.helpBody1')}</p>
        <p className="mb-2">{t('backlog.helpBody2')}</p>
        <p>{t('backlog.helpBody3')}</p>
      </HelpOverlay>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setViewMode('flow')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'flow'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t('backlog.flowView')}
            </button>
            <button
              onClick={() => setViewMode('priority')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'priority'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t('backlog.priorityView')}
            </button>
          </div>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36"
            aria-label="Status filter"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-32"
            aria-label="Type filter"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <span className="text-sm text-gray-500">
            {t('backlog.itemCount', { count: sorted.length })}
          </span>
        </div>

        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          {t('backlog.newItem')}
        </Button>
      </div>

      {/* Quick create */}
      {showCreate && (
        <div className="mb-4">
          <QuickCreateWorkItem projectId={projectId} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* Sortable item list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={grouped.map((g) => g.item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {grouped.map(({ item, depth, reason, hasNextSibling, continuationLines }) => (
              <div
                key={item.id}
                ref={item.id === flashId ? highlightRef : undefined}
                className={cn(
                  'flex items-stretch transition-colors duration-700',
                  item.id === flashId && 'rounded-lg bg-brand-50 ring-2 ring-brand-300',
                )}
              >
                {/* Tree lines (flow view only) */}
                {depth > 0 && viewMode === 'flow' && (
                  <div className="flex shrink-0" style={{ width: `${depth * 1.5}rem` }}>
                    {Array.from({ length: depth }, (_, d) => {
                      const level = d + 1;
                      const isLastCol = level === depth;
                      const showVertical = continuationLines.includes(level);

                      return (
                        <div key={level} className="relative flex w-6 shrink-0 items-stretch">
                          {!isLastCol && showVertical && (
                            <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-300" />
                          )}
                          {isLastCol && (
                            <>
                              <div
                                className="absolute left-2.5 top-0 w-px bg-gray-300"
                                style={{ bottom: hasNextSibling ? 0 : '50%' }}
                              />
                              <div className="absolute left-2.5 top-1/2 h-px w-2.5 -translate-y-px bg-gray-300" />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Simple indent for priority view */}
                {depth > 0 && viewMode === 'priority' && (
                  <div style={{ width: `${depth * 1.5}rem` }} className="shrink-0" />
                )}

                {/* Nesting-reason indicator (flow view) */}
                {depth > 0 && viewMode === 'flow' && (
                  <div className="flex shrink-0 items-center pr-1.5">
                    {reason === 'depends_on' ? (
                      <span className="rounded bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-600" title="Blocked by parent">
                        dep
                      </span>
                    ) : reason === 'child' ? (
                      <span className="rounded bg-blue-50 px-1 py-px text-[10px] font-medium text-blue-500" title="Subtask">
                        sub
                      </span>
                    ) : null}
                  </div>
                )}

                {/* Work item row */}
                <div className="min-w-0 flex-1 flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <SortableWorkItemRow
                      item={item}
                      projectId={projectId}
                      calculatedPoints={calculatedPointsMap.get(item.id)}
                    />
                  </div>
                  {/* Show in graph link */}
                  <Link
                    to="/p/$projectId/graph"
                    params={{ projectId }}
                    search={{ highlight: item.id }}
                    className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                    title={t('backlog.showInGraph')}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="3" cy="8" r="2" />
                      <circle cx="13" cy="4" r="2" />
                      <circle cx="13" cy="12" r="2" />
                      <path d="M5 7.5L11 4.5M5 8.5L11 11.5" />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {grouped.length === 0 && (
        <p className="py-12 text-center text-gray-400">
          {t('backlog.noItemsMatch')}
        </p>
      )}
    </div>
  );
}
