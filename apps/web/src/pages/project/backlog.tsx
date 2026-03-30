import { useMemo, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Select } from '@projecta/ui';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { WorkItemStatus, WorkItemType } from '@projecta/types';
import { useWorkItems, useUpdateWorkItem } from '../../hooks/use-work-items';
import { SortableWorkItemRow } from '../../components/sortable-work-item-row';
import { QuickCreateWorkItem } from '../../components/quick-create-work-item';
import { HelpOverlay } from '../../components/help-overlay';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'story', label: 'Stories' },
  { value: 'bug', label: 'Bugs' },
  { value: 'task', label: 'Tasks' },
];

export function BacklogPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (typeFilter) filters.type = typeFilter;

  const { data: items = [], isLoading } = useWorkItems(projectId, Object.keys(filters).length > 0 ? filters : undefined);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdx = sorted.findIndex((i) => i.id === active.id);
    const overIdx = sorted.findIndex((i) => i.id === over.id);
    if (activeIdx === -1 || overIdx === -1) return;

    // Calculate new orderIndex — fractional between neighbors
    let newOrderIndex: number;
    if (overIdx === 0) {
      // Moving to the top
      newOrderIndex = (sorted[0]?.orderIndex ?? 0) - 1;
    } else if (overIdx >= sorted.length - 1) {
      // Moving to the bottom
      newOrderIndex = (sorted[sorted.length - 1]?.orderIndex ?? 0) + 1;
    } else if (activeIdx < overIdx) {
      // Moving down — place between over and the one after
      const above = sorted[overIdx]!;
      const below = sorted[overIdx + 1];
      newOrderIndex = below
        ? (above.orderIndex + below.orderIndex) / 2
        : above.orderIndex + 1;
    } else {
      // Moving up — place between the one before over and over
      const above = sorted[overIdx - 1];
      const below = sorted[overIdx]!;
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
      <HelpOverlay id="backlog-intro" title="Your Backlog">
        <p className="mb-2">
          The backlog is your prioritized list of work. Items at the top are highest priority.
        </p>
        <p className="mb-2">
          <strong>Drag items</strong> by the grip handle to reprioritize. Use the filters
          to focus on stories, bugs, or specific statuses.
        </p>
        <p>
          Click <strong>+ New Item</strong> to quickly add stories or tasks.
        </p>
      </HelpOverlay>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-32"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <span className="text-sm text-gray-500">
            {sorted.length} item{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          + New Item
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
        <SortableContext items={sorted.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sorted.map((item) => (
              <SortableWorkItemRow
                key={item.id}
                item={item}
                projectId={projectId}
                calculatedPoints={calculatedPointsMap.get(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sorted.length === 0 && (
        <p className="py-12 text-center text-gray-400">
          No items match your filters. Try adjusting or create a new item.
        </p>
      )}
    </div>
  );
}
