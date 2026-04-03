import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Sprint } from '@projecta/types';
import { cn } from '@projecta/ui';

export interface SprintNodeData {
  sprint: Sprint;
  /** Total work items in this sprint */
  itemCount: number;
  /** Done items */
  doneCount: number;
  /** Total committed points */
  totalPoints: number;
  /** Team velocity average (for capacity indicator) */
  avgVelocity: number | null;
  isHighlighted: boolean | undefined;
  isDropTarget: boolean | undefined;
  [key: string]: unknown;
}

export type GraphSprintNodeType = Node<SprintNodeData>;

const STATUS_COLORS: Record<string, string> = {
  planned: 'border-sky-300 bg-sky-50/60',
  active: 'border-sky-400 bg-sky-50/80',
  completed: 'border-emerald-400 bg-emerald-50/60',
  cancelled: 'border-gray-300 bg-gray-50/60',
};

function SprintNodeInner({ data }: NodeProps<GraphSprintNodeType>) {
  const { sprint, itemCount, doneCount, totalPoints, avgVelocity } = data;
  const progress = itemCount > 0 ? (doneCount / itemCount) * 100 : 0;
  const overCapacity = avgVelocity != null && avgVelocity > 0 && totalPoints > avgVelocity;

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  return (
    <div
      className={cn(
        'w-72 rounded-lg border-2 p-3 shadow-sm',
        STATUS_COLORS[sprint.status] ?? STATUS_COLORS.planned,
        data.isDropTarget && 'ring-2 ring-sky-500 ring-offset-2 scale-105 transition-transform',
        data.isHighlighted && !data.isDropTarget && 'ring-2 ring-sky-400 ring-offset-2',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-sky-400"
      />

      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 uppercase">Sprint</span>
          <span className="text-[10px] text-sky-400">{sprint.status}</span>
        </div>
        <h3 className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2">{sprint.name}</h3>
        {sprint.goal && (
          <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{sprint.goal}</p>
        )}
      </div>

      {/* Progress bar */}
      {itemCount > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
            <span>{doneCount}/{itemCount} items</span>
            <span className={cn(overCapacity && 'font-semibold text-red-500')}>
              {totalPoints} pts{avgVelocity != null ? ` / ${avgVelocity} vel` : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/80">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress === 100 ? 'bg-emerald-400' : 'bg-sky-400',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Capacity warning */}
      {overCapacity && (
        <p className="mb-1.5 text-[10px] font-medium text-red-500">
          Over capacity by {totalPoints - (avgVelocity ?? 0)} pts
        </p>
      )}

      {/* Dates */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400">
        <span>{formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}</span>
        {sprint.velocity != null && (
          <span className="text-emerald-600">Velocity: {sprint.velocity}</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-sky-400"
      />
    </div>
  );
}

export const GraphSprintNode = memo(SprintNodeInner);
