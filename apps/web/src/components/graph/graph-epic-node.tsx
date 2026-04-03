import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Epic } from '@projecta/types';
import { cn } from '@projecta/ui';
import { PriorityIndicator } from '../priority-indicator';

export interface EpicNodeData {
  epic: Epic & { itemNumber?: number | null };
  itemCount: number;
  doneCount: number;
  totalPoints: number;
  donePoints: number;
  /** Computed width/height to fit children */
  containerWidth: number;
  containerHeight: number;
  isHighlighted: boolean | undefined;
  isDropTarget: boolean | undefined;
  [key: string]: unknown;
}

export type GraphEpicNodeType = Node<EpicNodeData>;

const STATUS_COLORS: Record<string, string> = {
  open: 'border-indigo-300/50 bg-indigo-50/30',
  in_progress: 'border-indigo-400/50 bg-indigo-50/40',
  done: 'border-emerald-400/50 bg-emerald-50/30',
  cancelled: 'border-gray-300/50 bg-gray-50/30',
};

function EpicNodeInner({ data }: NodeProps<GraphEpicNodeType>) {
  const { epic, itemCount, doneCount, totalPoints, donePoints, containerWidth, containerHeight } = data;
  const progress = itemCount > 0 ? (doneCount / itemCount) * 100 : 0;
  const overdue = epic.dueDate && new Date(epic.dueDate) < new Date() && epic.status !== 'done' && epic.status !== 'cancelled';

  return (
    <div
      className={cn(
        'rounded-xl border-2 shadow-sm',
        STATUS_COLORS[epic.status] ?? STATUS_COLORS.open,
        data.isDropTarget && 'ring-2 ring-indigo-500 ring-offset-2 transition-shadow',
        data.isHighlighted && !data.isDropTarget && 'ring-2 ring-indigo-400 ring-offset-2',
      )}
      style={{ width: containerWidth, minHeight: containerHeight }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-400"
      />

      {/* Header bar */}
      <div className="flex items-center gap-2 rounded-t-xl bg-indigo-100/60 px-3 py-2 border-b border-indigo-200/50">
        <span className="rounded bg-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">Epic</span>
        {epic.itemNumber != null && (
          <span className="text-[10px] text-indigo-400">#{epic.itemNumber}</span>
        )}
        <h3 className="flex-1 text-xs font-semibold text-gray-800 truncate">{epic.title}</h3>
        <PriorityIndicator priority={epic.priority} />

        {/* Progress pill */}
        {itemCount > 0 && (
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-gray-500">
            {doneCount}/{itemCount}
          </span>
        )}
      </div>

      {/* Dates row */}
      {(epic.startDate || epic.dueDate) && (
        <div className="flex items-center gap-3 px-3 py-1 text-[10px] text-gray-400">
          {epic.startDate && (
            <span>Start: {new Date(epic.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          )}
          {epic.dueDate && (
            <span className={cn(overdue && 'font-semibold text-red-500')}>
              Due: {new Date(epic.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {overdue && ' !'}
            </span>
          )}
          {totalPoints > 0 && (
            <span>{donePoints}/{totalPoints} pts</span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {itemCount > 0 && (
        <div className="mx-3 mt-1 mb-2 h-1 rounded-full bg-white/60">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              progress === 100 ? 'bg-emerald-400' : 'bg-indigo-400',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Children render here automatically via React Flow parentId */}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-400"
      />
    </div>
  );
}

export const GraphEpicNode = memo(EpicNodeInner);
