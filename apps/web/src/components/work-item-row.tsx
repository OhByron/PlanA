import { Link } from '@tanstack/react-router';
import type { WorkItem } from '@projecta/types';
import { cn } from '@projecta/ui';
import { TypeIcon } from './type-icon';
import { PriorityIndicator } from './priority-indicator';
import { StatusBadge } from './status-badge';

interface WorkItemRowProps {
  item: WorkItem;
  projectId: string;
  /** Calculated points from child tasks — used instead of item.storyPoints for stories */
  calculatedPoints?: number | undefined;
}

export function WorkItemRow({ item, projectId, calculatedPoints }: WorkItemRowProps) {
  const displayPoints = calculatedPoints != null ? calculatedPoints : item.storyPoints;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 transition-colors hover:bg-gray-50',
        item.isBlocked && 'border-red-200 bg-red-50/30',
      )}
    >
      <TypeIcon type={item.type} />

      <Link
        to="/p/$projectId/items/$workItemId"
        params={{ projectId, workItemId: item.id }}
        className="flex-1 truncate text-sm font-medium text-gray-900 hover:text-brand-700"
      >
        {item.title}
      </Link>

      <StatusBadge status={item.status} />
      <PriorityIndicator priority={item.priority} />

      <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
        {displayPoints ?? '—'}
      </span>
    </div>
  );
}
