import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { WorkItem, WorkItemStatus } from '@projecta/types';
import { cn } from '@projecta/ui';
import { SortableWorkItemCard } from './sortable-work-item-card';

const columnLabels: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

const columnColors: Record<string, string> = {
  backlog: 'border-t-gray-300',
  ready: 'border-t-blue-400',
  in_progress: 'border-t-brand-500',
  in_review: 'border-t-amber-400',
  done: 'border-t-green-500',
};

interface BoardColumnProps {
  status: WorkItemStatus;
  items: WorkItem[];
  projectId: string;
  parentTitles?: Map<string, string> | undefined;
  childTaskCounts?: Map<string, number> | undefined;
  calculatedPointsMap?: Map<string, number> | undefined;
  blockedItems?: Set<string> | undefined;
}

export function BoardColumn({
  status,
  items,
  projectId,
  parentTitles,
  childTaskCounts,
  calculatedPointsMap,
  blockedItems,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const itemIds = items.map((i) => i.id);

  return (
    <div
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg border-t-2 bg-gray-50',
        columnColors[status] ?? 'border-t-gray-300',
        isOver && 'bg-brand-50/50',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {columnLabels[status] ?? status}
        </h3>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
        style={{ minHeight: 100 }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableWorkItemCard
              key={item.id}
              item={item}
              projectId={projectId}
              parentTitle={parentTitles?.get(item.id)}
              childTaskCount={childTaskCounts?.get(item.id)}
              calculatedPoints={calculatedPointsMap?.get(item.id)}
              isBlocked={blockedItems?.has(item.id)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">No items</p>
        )}
      </div>
    </div>
  );
}
