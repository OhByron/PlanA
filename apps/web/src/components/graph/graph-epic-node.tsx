import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Epic } from '@projecta/types';
import { cn } from '@projecta/ui';
import { PriorityIndicator } from '../priority-indicator';

export interface EpicNodeData {
  epic: Epic & { itemNumber?: number | null };
  /** Total work items in this epic */
  itemCount: number;
  /** Done/cancelled items */
  doneCount: number;
  /** Total estimated points */
  totalPoints: number;
  /** Total done points */
  donePoints: number;
  isHighlighted: boolean | undefined;
  isDropTarget: boolean | undefined;
  [key: string]: unknown;
}

export type GraphEpicNodeType = Node<EpicNodeData>;

const STATUS_COLORS: Record<string, string> = {
  open: 'border-indigo-300 bg-indigo-50/60',
  in_progress: 'border-indigo-400 bg-indigo-50/80',
  done: 'border-emerald-400 bg-emerald-50/60',
  cancelled: 'border-gray-300 bg-gray-50/60',
};

function EpicNodeInner({ data }: NodeProps<GraphEpicNodeType>) {
  const { epic, itemCount, doneCount, totalPoints, donePoints } = data;
  const progress = itemCount > 0 ? (doneCount / itemCount) * 100 : 0;
  const overdue = epic.dueDate && new Date(epic.dueDate) < new Date() && epic.status !== 'done' && epic.status !== 'cancelled';

  return (
    <div
      className={cn(
        'w-72 rounded-lg border-2 p-3 shadow-sm',
        STATUS_COLORS[epic.status] ?? STATUS_COLORS.open,
        data.isDropTarget && 'ring-2 ring-indigo-500 ring-offset-2 scale-105 transition-transform',
        data.isHighlighted && !data.isDropTarget && 'ring-2 ring-indigo-400 ring-offset-2',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-400"
      />

      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">Epic</span>
            {epic.itemNumber != null && (
              <span className="text-[10px] text-indigo-400">#{epic.itemNumber}</span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2">{epic.title}</h3>
        </div>
        <PriorityIndicator priority={epic.priority} />
      </div>

      {/* Progress bar */}
      {itemCount > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
            <span>{doneCount}/{itemCount} items</span>
            <span>{donePoints}/{totalPoints} pts</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/80">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress === 100 ? 'bg-emerald-400' : 'bg-indigo-400',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400">
        {epic.startDate && (
          <span>Start: {new Date(epic.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        )}
        {epic.dueDate && (
          <span className={cn(overdue && 'font-semibold text-red-500')}>
            Due: {new Date(epic.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {overdue && ' (overdue)'}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-400"
      />
    </div>
  );
}

export const GraphEpicNode = memo(EpicNodeInner);
