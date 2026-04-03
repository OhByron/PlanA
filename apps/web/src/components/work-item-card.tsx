import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import type { WorkItem } from '@projecta/types';
import { Avatar, cn } from '@projecta/ui';
import { TypeIcon } from './type-icon';
import { PriorityIndicator } from './priority-indicator';

interface WorkItemCardProps {
  item: WorkItem;
  projectId: string;
  parentTitle?: string | undefined;
  childTaskCount?: number | undefined;
  childDoneCount?: number | undefined;
  calculatedPoints?: number | undefined;
  isBlocked?: boolean | undefined;
  assigneeName?: string | undefined;
  onClick?: () => void;
  /** Number of items this card unblocks when completed */
  unblocksCount?: number | undefined;
}

export function WorkItemCard({
  item,
  projectId,
  parentTitle,
  childTaskCount,
  calculatedPoints,
  isBlocked: isBlockedProp,
  assigneeName,
  onClick: onClickProp,
  unblocksCount,
  childDoneCount,
}: WorkItemCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const displayPoints = calculatedPoints != null ? calculatedPoints
    : item.storyPoints;
  const blocked = isBlockedProp ?? item.isBlocked;

  return (
    <button
      onClick={() =>
        onClickProp
          ? onClickProp()
          : navigate({
              to: '/p/$projectId/items/$workItemId',
              params: { projectId, workItemId: item.id },
            })
      }
      aria-label={t('workItemCard.open', { title: item.title })}
      className={cn(
        'w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md',
        blocked && 'border-red-300 bg-red-50/50',
        unblocksCount && unblocksCount > 0 && !blocked && 'border-l-[3px] border-l-emerald-400',
      )}
    >
      {/* Parent breadcrumb for tasks */}
      {parentTitle && (
        <p className="mb-1 truncate text-[10px] text-gray-400">
          ↳ {parentTitle}
        </p>
      )}

      <div className="flex items-start gap-2">
        <TypeIcon type={item.type} />
        {(item as unknown as { itemNumber?: number | null }).itemNumber != null && (
          <span className="text-xs text-gray-400 shrink-0">#{(item as unknown as { itemNumber: number }).itemNumber}</span>
        )}
        <span className="flex-1 text-sm font-medium text-gray-900 line-clamp-2">
          {item.title}
        </span>
      </div>

      {/* Task progress bar for stories */}
      {childTaskCount != null && childTaskCount > 0 && childDoneCount != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-gray-100">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                childDoneCount === childTaskCount ? 'bg-emerald-400' : 'bg-brand-400',
              )}
              style={{ width: `${(childDoneCount / childTaskCount) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 shrink-0">
            {childDoneCount}/{childTaskCount}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PriorityIndicator priority={item.priority} />
          {displayPoints != null && displayPoints > 0 && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {displayPoints}
            </span>
          )}
          {childTaskCount != null && childTaskCount > 0 && (
            <span className="text-[10px] text-gray-400">
              {t('workItemCard.taskCount', { count: childTaskCount })}
            </span>
          )}
          {blocked && (
            <span className="text-xs font-medium text-red-600">{t('workItemDetail.blocked')}</span>
          )}
          {unblocksCount != null && unblocksCount > 0 && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              {t('workItemCard.unblocks', { count: unblocksCount })}
            </span>
          )}
        </div>

        {item.assigneeId && (
          <Avatar name={assigneeName ?? '?'} size="xs" />
        )}
      </div>
    </button>
  );
}
