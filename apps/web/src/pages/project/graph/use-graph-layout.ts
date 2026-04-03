import { useMemo } from 'react';
import type { Node } from '@xyflow/react';
import type { WorkItem } from '@projecta/types';
import type { MergedEdge } from './use-graph-draft-state';
import type { GraphNodeData } from '../../../components/graph/graph-work-item-node';

const GRID = 20;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;
const COL_GAP = 80;
const ROW_GAP = 40;

function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/**
 * Computes node positions using BFS layering on the dependency graph.
 * Items with no dependencies go in the first column; items that depend on
 * first-column items go in the second column, etc.
 *
 * Items with no edges at all are placed in a separate "unconnected" column at the far left.
 */
export function useGraphLayout(
  items: WorkItem[],
  edges: MergedEdge[],
  projectId: string,
  extras: {
    assigneeNames: Map<string, string>;
    blockedItems: Set<string>;
    parentTitles: Map<string, string>;
    childCounts: Map<string, number>;
    highlightId: string | null;
  },
): Node<GraphNodeData>[] {
  return useMemo(() => {
    if (items.length === 0) return [];

    // Only consider active (non-removed) depends_on edges for layout
    const activeEdges = edges.filter((e) => !e.isRemoved && e.type === 'depends_on');

    // Build adjacency: source depends on target (target must finish first)
    // So target comes BEFORE source in the layout (left to right)
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>(); // target -> [sources that depend on it]
    const connectedIds = new Set<string>();

    for (const item of items) {
      inDegree.set(item.id, 0);
    }

    for (const edge of activeEdges) {
      connectedIds.add(edge.sourceId);
      connectedIds.add(edge.targetId);
      inDegree.set(edge.sourceId, (inDegree.get(edge.sourceId) ?? 0) + 1);
      const existing = outEdges.get(edge.targetId) ?? [];
      existing.push(edge.sourceId);
      outEdges.set(edge.targetId, existing);
    }

    // Also mark items that have relates_to edges as connected
    for (const edge of edges) {
      if (!edge.isRemoved && edge.type === 'relates_to') {
        connectedIds.add(edge.sourceId);
        connectedIds.add(edge.targetId);
      }
    }

    // BFS topological layering
    const layers: string[][] = [];
    const assigned = new Set<string>();

    // Find roots (items with no dependencies among connected items)
    const connectedItems = items.filter((i) => connectedIds.has(i.id));
    const unconnectedItems = items.filter((i) => !connectedIds.has(i.id));

    let currentLayer = connectedItems
      .filter((i) => (inDegree.get(i.id) ?? 0) === 0)
      .map((i) => i.id);

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      for (const id of currentLayer) assigned.add(id);

      const nextLayer: string[] = [];
      for (const id of currentLayer) {
        for (const dependent of outEdges.get(id) ?? []) {
          if (assigned.has(dependent)) continue;
          const remaining = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, remaining);
          if (remaining <= 0) {
            nextLayer.push(dependent);
          }
        }
      }
      currentLayer = nextLayer;
    }

    // Any connected items not assigned (cycles) go in the last layer
    const unassigned = connectedItems.filter((i) => !assigned.has(i.id));
    if (unassigned.length > 0) {
      layers.push(unassigned.map((i) => i.id));
    }

    // Position connected nodes
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const nodes: Node<GraphNodeData>[] = [];

    for (let col = 0; col < layers.length; col++) {
      const layer = layers[col]!;
      for (let row = 0; row < layer.length; row++) {
        const item = itemMap.get(layer[row]!);
        if (!item) continue;
        nodes.push({
          id: item.id,
          type: 'workItem',
          position: {
            x: snapToGrid(col * (NODE_WIDTH + COL_GAP)),
            y: snapToGrid(row * (NODE_HEIGHT + ROW_GAP)),
          },
          data: {
            item,
            projectId,
            assigneeName: extras.assigneeNames.get(item.assigneeId ?? ''),
            isBlocked: extras.blockedItems.has(item.id),
            parentTitle: extras.parentTitles.get(item.id),
            childTaskCount: extras.childCounts.get(item.id),
            isHighlighted: extras.highlightId === item.id ? true : undefined,
          },
        });
      }
    }

    // Position unconnected nodes in a column to the right of the graph
    const rightEdge = layers.length * (NODE_WIDTH + COL_GAP);
    const unconnectedX = snapToGrid(rightEdge + COL_GAP);
    for (const item of unconnectedItems) {
      nodes.push({
        id: item.id,
        type: 'workItem',
        position: {
          x: unconnectedX,
          y: snapToGrid(unconnectedItems.indexOf(item) * (NODE_HEIGHT + ROW_GAP)),
        },
        data: {
          item,
          projectId,
          assigneeName: extras.assigneeNames.get(item.assigneeId ?? ''),
          isBlocked: extras.blockedItems.has(item.id),
          parentTitle: extras.parentTitles.get(item.id),
          childTaskCount: extras.childCounts.get(item.id),
          isHighlighted: extras.highlightId === item.id ? true : undefined,
        },
      });
    }

    return nodes;
  }, [items, edges, projectId, extras]);
}
