import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { WorkItem } from '@projecta/types';
import { cn } from '@projecta/ui';
import { WorkItemCard } from '../work-item-card';

export interface GraphNodeData {
  item: WorkItem;
  projectId: string;
  assigneeName: string | undefined;
  isBlocked: boolean | undefined;
  parentTitle: string | undefined;
  childTaskCount: number | undefined;
  isHighlighted: boolean | undefined;
  [key: string]: unknown;
}

export type GraphWorkItemNodeType = Node<GraphNodeData>;

function GraphWorkItemNodeInner({ data }: NodeProps<GraphWorkItemNodeType>) {
  return (
    <div className={cn('w-60', data.isHighlighted && 'rounded-xl ring-2 ring-indigo-400 ring-offset-2')}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-gray-400"
      />
      <WorkItemCard
        item={data.item}
        projectId={data.projectId}
        assigneeName={data.assigneeName}
        isBlocked={data.isBlocked}
        parentTitle={data.parentTitle}
        childTaskCount={data.childTaskCount}
        onClick={() => {
          // Prevent navigation in graph view — node click is handled by ReactFlow
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-gray-400"
      />
    </div>
  );
}

export const GraphWorkItemNode = memo(GraphWorkItemNodeInner);
