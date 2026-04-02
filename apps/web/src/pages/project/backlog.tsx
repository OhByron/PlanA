import { useMemo, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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

export function BacklogPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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

  // Group: stories/bugs with their child tasks nested, standalone tasks at top level
  const grouped = useMemo(() => {
    const childIds = new Set<string>();
    const parentChildren = new Map<string, typeof sorted>();

    // Collect children
    for (const item of sorted) {
      if (item.parentId) {
        childIds.add(item.id);
        const siblings = parentChildren.get(item.parentId) ?? [];
        siblings.push(item);
        parentChildren.set(item.parentId, siblings);
      }
    }

    // Build ordered list: parent followed by its children
    const result: Array<{ item: typeof sorted[0]; indent: boolean }> = [];
    for (const item of sorted) {
      if (childIds.has(item.id)) continue; // skip children — they render under their parent
      result.push({ item, indent: false });
      const children = parentChildren.get(item.id);
      if (children) {
        for (const child of children) {
          result.push({ item: child, indent: true });
        }
      }
    }
    return result;
  }, [sorted]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Flat list of top-level items only (no children) for reorder calculations
  const topLevel = useMemo(
    () => sorted.filter((i) => !i.parentId),
    [sorted],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdx = topLevel.findIndex((i) => i.id === active.id);
    const overIdx = topLevel.findIndex((i) => i.id === over.id);
    if (activeIdx === -1 || overIdx === -1) return;

    // Calculate new orderIndex — fractional between neighbors
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
        <p className="mb-2">
          {t('backlog.helpBody1')}
        </p>
        <p className="mb-2">
          {t('backlog.helpBody2')}
        </p>
        <p>
          {t('backlog.helpBody3')}
        </p>
      </HelpOverlay>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
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
          <div className="space-y-1">
            {grouped.map(({ item, indent }) => (
              <div key={item.id} className={indent ? 'ml-8' : ''}>
                <SortableWorkItemRow
                  item={item}
                  projectId={projectId}
                  calculatedPoints={calculatedPointsMap.get(item.id)}
                />
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
