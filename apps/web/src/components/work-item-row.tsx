import { Link } from '@tanstack/react-router';
import type { WorkItem } from '@projecta/types';
import { cn } from '@projecta/ui';
import { TypeIcon } from './type-icon';
import { PriorityIndicator } from './priority-indicator';
import { StatusBadge } from './status-badge';

interface WorkItemRowProps {
  item: WorkItem;
  projectId: string;
  calculatedPoints?: number | undefined;
  /** Drag handle props from dnd-kit — if provided, shows a drag handle */
  dragHandleProps?: Record<string, unknown> | undefined;
}

export function WorkItemRow({ item, projectId, calculatedPoints, dragHandleProps }: WorkItemRowProps) {
  const displayPoints = calculatedPoints != null ? calculatedPoints : item.storyPoints;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50',
        item.isBlocked && 'border-red-200 bg-red-50/30',
      )}
    >
      {/* Drag handle */}
      {dragHandleProps && (
        <button
          className="cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          {...dragHandleProps}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      )}

      <TypeIcon type={item.type} />

      {(item as unknown as { itemNumber?: number | null }).itemNumber != null && (
        <span className="text-xs text-gray-400 shrink-0 w-10">#{(item as unknown as { itemNumber: number }).itemNumber}</span>
      )}

      <Link
        to="/p/$projectId/items/$workItemId"
        params={{ projectId, workItemId: item.id }}
        className="flex-1 truncate text-sm font-medium text-gray-900 hover:text-brand-700"
      >
        {item.title}
      </Link>

      <StatusBadge stateName={item.stateName} stateSlug={item.stateSlug} stateColor={item.stateColor} isCancelled={item.isCancelled} />
      <PriorityIndicator priority={item.priority} />

      <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
        {displayPoints ?? '—'}
      </span>
    </div>
  );
}
