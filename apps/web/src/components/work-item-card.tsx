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
  calculatedPoints?: number | undefined;
  isBlocked?: boolean | undefined;
  assigneeName?: string | undefined;
}

export function WorkItemCard({
  item,
  projectId,
  parentTitle,
  childTaskCount,
  calculatedPoints,
  isBlocked: isBlockedProp,
  assigneeName,
}: WorkItemCardProps) {
  const navigate = useNavigate();

  const displayPoints = calculatedPoints != null ? calculatedPoints
    : item.storyPoints;
  const blocked = isBlockedProp ?? item.isBlocked;

  return (
    <button
      onClick={() =>
        navigate({
          to: '/p/$projectId/items/$workItemId',
          params: { projectId, workItemId: item.id },
        })
      }
      className={cn(
        'w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md',
        blocked && 'border-red-300 bg-red-50/50',
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
              {childTaskCount} task{childTaskCount !== 1 ? 's' : ''}
            </span>
          )}
          {blocked && (
            <span className="text-xs font-medium text-red-600">Blocked</span>
          )}
        </div>

        {item.assigneeId && (
          <Avatar name={assigneeName ?? '?'} size="xs" />
        )}
      </div>
    </button>
  );
}
