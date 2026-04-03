import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
export interface DependencyEdgeData {
  depType: 'depends_on' | 'relates_to';
  strength: 'hard' | 'soft';
  isDraft: boolean | undefined;
  [key: string]: unknown;
}

export type DependencyEdgeType = Edge<DependencyEdgeData, 'dependency'>;

function DependencyEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<DependencyEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isDependsOn = data?.depType === 'depends_on';
  const isHard = data?.strength === 'hard';
  const isDraft = data?.isDraft;

  // Solid for hard depends_on, dashed for everything else
  const strokeDasharray = isHard && isDependsOn ? undefined : '6 4';
  const strokeColor = isDraft
    ? '#3b82f6' // blue for draft
    : isDependsOn
      ? isHard
        ? '#6b7280' // gray-500 for hard blocking
        : '#d97706' // amber-600 for soft dependency
      : '#9ca3af'; // gray-400 for relates_to
  const strokeWidth = selected ? 2.5 : 1.5;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
        }}
        markerEnd={
          isDependsOn
            ? `url(#arrow-${isHard ? 'hard' : 'soft'}${isDraft ? '-draft' : ''})`
            : ''
        }
      />
      {isDraft && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            draft
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const DependencyEdge = memo(DependencyEdgeInner);

/** SVG marker definitions for arrowheads — render once inside the ReactFlow wrapper */
export function EdgeMarkerDefs() {
  return (
    <svg className="absolute h-0 w-0">
      <defs>
        {/* Hard blocking arrow */}
        <marker
          id="arrow-hard"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
        </marker>
        {/* Soft dependency arrow */}
        <marker
          id="arrow-soft"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#d97706" />
        </marker>
        {/* Draft hard arrow */}
        <marker
          id="arrow-hard-draft"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
        </marker>
        {/* Draft soft arrow */}
        <marker
          id="arrow-soft-draft"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
        </marker>
      </defs>
    </svg>
  );
}
