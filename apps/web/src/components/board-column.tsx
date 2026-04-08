import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { WorkItem, WorkflowState } from '@projecta/types';
import { cn } from '@projecta/ui';
import { SortableWorkItemCard } from './sortable-work-item-card';
import type { VCSBulkItem } from '../hooks/use-vcs';

interface BoardColumnProps {
  state: WorkflowState;
  items: WorkItem[];
  projectId: string;
  parentTitles?: Map<string, string> | undefined;
  childTaskCounts?: Map<string, number> | undefined;
  calculatedPointsMap?: Map<string, number> | undefined;
  blockedItems?: Set<string> | undefined;
  wipWarning?: boolean | undefined;
  memberNames?: Map<string, string> | undefined;
  unblocksMap?: Map<string, number> | undefined;
  childDoneCounts?: Map<string, number> | undefined;
  vcsSummaries?: Map<string, VCSBulkItem> | undefined;
}

export function BoardColumn({
  state,
  items,
  projectId,
  parentTitles,
  childTaskCounts,
  calculatedPointsMap,
  blockedItems,
  wipWarning,
  memberNames,
  unblocksMap,
  childDoneCounts,
  vcsSummaries,
}: BoardColumnProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: state.id });
  const itemIds = items.map((i) => i.id);

  // Use translated name if available, otherwise the DB name
  const displayName = t(`status.${state.slug}`, { defaultValue: state.name });

  return (
    <div
      role="region"
      aria-label={t('board.column', { status: displayName })}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg border-t-2 bg-gray-50',
        isOver && 'bg-brand-50/50',
      )}
      style={{ borderTopColor: state.color }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {displayName}
        </h3>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          wipWarning ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600',
        )}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-8"
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
              assigneeName={memberNames?.get(item.assigneeId ?? '')}
              unblocksCount={unblocksMap?.get(item.id)}
              childDoneCount={childDoneCounts?.get(item.id)}
              vcsSummary={vcsSummaries?.get(item.id)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">{t('board.noItems')}</p>
        )}
      </div>
    </div>
  );
}
