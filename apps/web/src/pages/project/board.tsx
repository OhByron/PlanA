import { useParams } from '@tanstack/react-router';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import type { WorkItem, WorkItemStatus } from '@projecta/types';
import { useWorkItems, useUpdateWorkItem } from '../../hooks/use-work-items';
import { useProjectBlockedStatus } from '../../hooks/use-project-dependencies';
import { BoardColumn } from '../../components/board-column';
import { WorkItemCard } from '../../components/work-item-card';
import { HelpOverlay } from '../../components/help-overlay';

const COLUMNS: WorkItemStatus[] = ['backlog', 'ready', 'in_progress', 'in_review', 'done'];

export function BoardPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: items = [], isLoading } = useWorkItems(projectId);
  const updateItem = useUpdateWorkItem(projectId);
  const { blockedItems } = useProjectBlockedStatus(projectId, items);
  const [activeItem, setActiveItem] = useState<WorkItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Build parent-child lookup maps
  const { parentTitles, childTaskCounts, calculatedPointsMap } = useMemo(() => {
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

    return { parentTitles, childTaskCounts, calculatedPointsMap };
  }, [items]);

  const grouped = COLUMNS.reduce(
    (acc, status) => {
      acc[status] = items.filter((i) => i.status === status);
      return acc;
    },
    {} as Record<WorkItemStatus, WorkItem[]>,
  );

  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    setActiveItem(item ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const newStatus = over.id as WorkItemStatus;
    const item = items.find((i) => i.id === active.id);
    if (!item || item.status === newStatus) return;

    // Move the item
    updateItem.mutate({
      workItemId: item.id,
      data: { status: newStatus },
    });

    // Cascade: if it's a story, move child tasks too
    if (item.type === 'story') {
      const children = items.filter((i) => i.parentId === item.id && i.status !== newStatus);
      for (const child of children) {
        updateItem.mutate({
          workItemId: child.id,
          data: { status: newStatus },
        });
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
      <HelpOverlay id="board-intro" title="Your Kanban Board">
        <p className="mb-2">
          This is your team's work visualized as a flow. Each column represents a stage
          in your workflow.
        </p>
        <p className="mb-2">
          <strong>Drag cards</strong> between columns to update their status instantly.
          When you move a story, its child tasks move with it.
        </p>
        <p>
          Keep the "In Progress" column small — limiting work-in-progress helps your
          team finish things instead of starting new ones.
        </p>
      </HelpOverlay>

      <div className="flex items-center justify-between px-6 py-3">
        <p className="text-sm text-gray-500">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-6">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {COLUMNS.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              items={grouped[status] ?? []}
              projectId={projectId}
              parentTitles={parentTitles}
              childTaskCounts={childTaskCounts}
              calculatedPointsMap={calculatedPointsMap}
              blockedItems={blockedItems}
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
