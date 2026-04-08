import { useParams } from '@tanstack/react-router';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkItem, WorkflowState } from '@projecta/types';
import { cn } from '@projecta/ui';
import { ApiError } from '../../lib/api-client';
import { useWorkItems, useUpdateWorkItem } from '../../hooks/use-work-items';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useProjectBlockedStatus, useProjectDependencies } from '../../hooks/use-project-dependencies';
import { useVCSBulkSummary } from '../../hooks/use-vcs';
import { useProjectWorkflowStates } from '../../hooks/use-workflow-states';
import { useProjectRealtimeInvalidation } from '../../hooks/use-realtime-invalidation';
import { BoardColumn } from '../../components/board-column';
import { WorkItemCard } from '../../components/work-item-card';
import { HelpOverlay } from '../../components/help-overlay';

export function BoardPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: items = [], isLoading } = useWorkItems(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const updateItem = useUpdateWorkItem(projectId);
  const { blockedItems } = useProjectBlockedStatus(projectId, items);
  const { data: deps = [] } = useProjectDependencies(projectId);
  const { data: vcsSummaries } = useVCSBulkSummary(projectId);
  const { data: workflowStates = [] } = useProjectWorkflowStates(projectId);
  useProjectRealtimeInvalidation(projectId);

  // Active (non-cancelled) items for the board
  const activeItems = useMemo(() => items.filter((i) => !i.isCancelled), [items]);

  // Compute enabler map: for each item, count how many not-yet-done items
  // are waiting on it (directly or transitively via depends_on chains).
  // Items that unblock the most work should be promoted through the pipeline first.
  const unblocksMap = useMemo(() => {
    const map = new Map<string, number>();
    if (deps.length === 0) return map;

    // Build: target → [sources that depend on it]
    // "source depends_on target" means target is the enabler
    const dependents = new Map<string, Set<string>>();
    const itemMap = new Map(activeItems.map((i) => [i.id, i]));
    for (const dep of deps) {
      if (dep.type !== 'depends_on') continue;
      const target = itemMap.get(dep.targetId);
      const source = itemMap.get(dep.sourceId);
      if (!target || !source) continue;
      if (target.stateIsTerminal || source.stateIsTerminal) continue;
      const set = dependents.get(dep.targetId) ?? new Set();
      set.add(dep.sourceId);
      dependents.set(dep.targetId, set);
    }

    // Count transitive dependents via BFS from each enabler
    for (const [enablerId] of dependents) {
      const visited = new Set<string>();
      const queue = [enablerId];
      while (queue.length > 0) {
        const current = queue.pop()!;
        const directDeps = dependents.get(current);
        if (!directDeps) continue;
        for (const depId of directDeps) {
          if (visited.has(depId)) continue;
          visited.add(depId);
          queue.push(depId);
        }
      }
      if (visited.size > 0) {
        map.set(enablerId, visited.size);
      }
    }

    return map;
  }, [items, deps]);

  const memberNames = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );

  const totalCapacity = useMemo(
    () => members.reduce((s, m) => s + (m.capacity ?? 0), 0),
    [members],
  );

  const totalInProgress = useMemo(
    () => activeItems
      .filter((i) => !i.stateIsInitial && !i.stateIsTerminal)
      .reduce((s, i) => s + (i.storyPoints ?? 0), 0),
    [activeItems],
  );
  const [activeItem, setActiveItem] = useState<WorkItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Build parent-child lookup maps
  const { parentTitles, childTaskCounts, calculatedPointsMap, childDoneCounts } = useMemo(() => {
    const parentTitles = new Map<string, string>();
    const childTaskCounts = new Map<string, number>();
    const calculatedPointsMap = new Map<string, number>();

    // Map parent IDs to titles
    const itemMap = new Map(items.map((i) => [i.id, i]));

    for (const item of items) {
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        if (parent) {
          parentTitles.set(item.id, parent.title);
          childTaskCounts.set(parent.id, (childTaskCounts.get(parent.id) ?? 0) + 1);
        }
      }
    }

    // Calculate points for stories from their child tasks
    for (const item of items) {
      if (item.type === 'story') {
        const children = items.filter((i) => i.parentId === item.id);
        if (children.length > 0) {
          const sum = children.reduce((s, c) => s + (c.storyPoints ?? 0), 0);
          calculatedPointsMap.set(item.id, sum);
        }
      }
    }

    // Count done children for progress bars on story cards
    const childDoneCounts = new Map<string, number>();
    for (const item of items) {
      if (item.parentId && (item.stateIsTerminal || item.isCancelled)) {
        childDoneCounts.set(item.parentId, (childDoneCounts.get(item.parentId) ?? 0) + 1);
      }
    }

    return { parentTitles, childTaskCounts, calculatedPointsMap, childDoneCounts };
  }, [items]);

  // Group items by workflow state ID
  const grouped = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const state of workflowStates) {
      const columnItems = activeItems
        .filter((i) => i.workflowStateId === state.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      map.set(state.id, columnItems);
    }
    return map;
  }, [activeItems, workflowStates]);

  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    setActiveItem(item ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    // over.id may be a state ID (column) OR a card id (when dropped onto a card)
    const stateIds = workflowStates.map((s) => s.id);
    let newStateId: string;
    if (stateIds.includes(over.id as string)) {
      newStateId = over.id as string;
    } else {
      // Dropped on a card - find which column that card belongs to
      const overItem = activeItems.find((i) => i.id === over.id);
      if (!overItem) return;
      newStateId = overItem.workflowStateId;
    }

    const item = activeItems.find((i) => i.id === active.id);
    if (!item) return;

    // Same column - reorder within the column
    if (item.workflowStateId === newStateId && !stateIds.includes(over.id as string)) {
      const columnItems = grouped.get(newStateId) ?? [];
      const activeIdx = columnItems.findIndex((i) => i.id === active.id);
      const overIdx = columnItems.findIndex((i) => i.id === over.id);
      if (activeIdx === -1 || overIdx === -1 || activeIdx === overIdx) return;

      let newOrderIndex: number;
      if (overIdx === 0) {
        newOrderIndex = (columnItems[0]?.orderIndex ?? 0) - 1;
      } else if (overIdx >= columnItems.length - 1) {
        newOrderIndex = (columnItems[columnItems.length - 1]?.orderIndex ?? 0) + 1;
      } else if (activeIdx < overIdx) {
        const above = columnItems[overIdx]!;
        const below = columnItems[overIdx + 1];
        newOrderIndex = below ? (above.orderIndex + below.orderIndex) / 2 : above.orderIndex + 1;
      } else {
        const above = columnItems[overIdx - 1];
        const below = columnItems[overIdx]!;
        newOrderIndex = above ? (above.orderIndex + below.orderIndex) / 2 : below.orderIndex - 1;
      }

      updateItem.mutate({ workItemId: item.id, data: { orderIndex: newOrderIndex } });
      return;
    }

    if (item.workflowStateId === newStateId) return;

    const onMutateError = (err: Error) => {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      }
    };

    // Move the item to the new state
    updateItem.mutate(
      { workItemId: item.id, data: { workflowStateId: newStateId } },
      { onError: onMutateError },
    );

    // Cascade: if it's a story, move child tasks too
    if (item.type === 'story') {
      const children = activeItems.filter((i) => i.parentId === item.id && i.workflowStateId !== newStateId);
      for (const child of children) {
        updateItem.mutate(
          { workItemId: child.id, data: { workflowStateId: newStateId } },
          { onError: onMutateError },
        );
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <HelpOverlay id="board-intro" title={t('board.helpTitle')}>
        <p className="mb-2">
          {t('board.helpBody1')}
        </p>
        <p className="mb-2">
          {t('board.helpBody2')}
        </p>
        <p>
          {t('board.helpBody3')}
        </p>
      </HelpOverlay>

      {errorMessage && (
        <div className="mx-6 mt-2 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-4 font-medium hover:text-red-900" aria-label={t('common.dismiss')}>
            {t('common.dismiss')}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-3">
        <p className="text-sm text-gray-500">
          {t('board.itemCount', { count: items.length })}
        </p>
        {totalCapacity > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className={cn(
              'font-medium',
              totalInProgress > totalCapacity ? 'text-red-600' : 'text-gray-500'
            )}>
              {t('board.ptsInFlight', { inProgress: totalInProgress, capacity: totalCapacity })}
            </span>
            {totalInProgress > totalCapacity && (
              <span className="text-xs text-red-500">&#x26A0; {t('board.overCapacity')}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {workflowStates.map((state) => (
            <BoardColumn
              key={state.id}
              state={state}
              items={grouped.get(state.id) ?? []}
              projectId={projectId}
              parentTitles={parentTitles}
              childTaskCounts={childTaskCounts}
              calculatedPointsMap={calculatedPointsMap}
              blockedItems={blockedItems}
              wipWarning={!state.isInitial && !state.isTerminal && totalInProgress > totalCapacity}
              memberNames={memberNames}
              unblocksMap={unblocksMap}
              childDoneCounts={childDoneCounts}
              vcsSummaries={vcsSummaries}
            />
          ))}

          <DragOverlay>
            {activeItem && (
              <div className="rotate-2 opacity-90">
                <WorkItemCard
                  item={activeItem}
                  projectId={projectId}
                  parentTitle={parentTitles.get(activeItem.id)}
                  childTaskCount={childTaskCounts.get(activeItem.id)}
                  calculatedPoints={calculatedPointsMap.get(activeItem.id)}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
