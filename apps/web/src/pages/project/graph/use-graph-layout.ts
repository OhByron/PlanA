import { useMemo } from 'react';
import type { Node } from '@xyflow/react';
import type { WorkItem, Epic } from '@projecta/types';
import type { MergedEdge } from './use-graph-draft-state';
import type { GraphNodeData } from '../../../components/graph/graph-work-item-node';
import type { EpicNodeData } from '../../../components/graph/graph-epic-node';

const GRID = 20;
const ITEM_W = 260;
const ITEM_H = 100;
const COL_GAP = 60;
const ROW_GAP = 20;
const EPIC_PADDING_X = 20;
const EPIC_HEADER_H = 80; // space for the epic header/dates/progress bar
const EPIC_PADDING_BOTTOM = 20;
const EPIC_GAP = 60; // gap between epic containers

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

interface LayoutExtras {
  assigneeNames: Map<string, string>;
  blockedItems: Set<string>;
  parentTitles: Map<string, string>;
  childCounts: Map<string, number>;
  highlightId: string | null;
}

/**
 * Produces all graph nodes: epic containers with work items inside them,
 * plus any orphan items (no epic) as standalone nodes.
 *
 * Work items inside an epic get `parentId` set so React Flow renders
 * them relative to the epic container.
 */
export function useGraphLayout(
  items: WorkItem[],
  edges: MergedEdge[],
  projectId: string,
  extras: LayoutExtras,
  epics: (Epic & { itemNumber?: number | null })[] = [],
): Node[] {
  return useMemo(() => {
    const allNodes: Node[] = [];
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Group items by epicId
    const itemsByEpic = new Map<string, WorkItem[]>();
    const orphanItems: WorkItem[] = [];
    for (const item of items) {
      if (item.epicId) {
        const list = itemsByEpic.get(item.epicId) ?? [];
        list.push(item);
        itemsByEpic.set(item.epicId, list);
      } else {
        orphanItems.push(item);
      }
    }

    // Layout each epic as a container with its items inside
    let epicX = 0;

    for (const epic of epics) {
      const epicItems = itemsByEpic.get(epic.id) ?? [];
      if (epicItems.length === 0 && epics.length > 1) {
        // Skip empty epics in multi-epic projects (they'll still show as a small container)
      }

      // Position items inside the epic in a simple column layout
      const itemPositions = layoutItemsInColumn(epicItems, edges, itemMap);
      const contentWidth = itemPositions.length > 0
        ? Math.max(...itemPositions.map((p) => p.x + ITEM_W)) + EPIC_PADDING_X * 2
        : ITEM_W + EPIC_PADDING_X * 2;
      const contentHeight = itemPositions.length > 0
        ? Math.max(...itemPositions.map((p) => p.y + ITEM_H)) + EPIC_HEADER_H + EPIC_PADDING_BOTTOM
        : EPIC_HEADER_H + ITEM_H + EPIC_PADDING_BOTTOM;

      const containerW = snap(Math.max(contentWidth, 300));
      const containerH = snap(Math.max(contentHeight, 160));

      const doneItems = epicItems.filter((i) => i.status === 'done' || i.status === 'cancelled');
      const totalPts = epicItems.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
      const donePts = doneItems.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

      // Epic container node
      allNodes.push({
        id: `epic-${epic.id}`,
        type: 'epic',
        position: { x: snap(epicX), y: 0 },
        data: {
          epic,
          itemCount: epicItems.length,
          doneCount: doneItems.length,
          totalPoints: totalPts,
          donePoints: donePts,
          containerWidth: containerW,
          containerHeight: containerH,
          isHighlighted: undefined,
          isDropTarget: undefined,
        } satisfies EpicNodeData,
        style: { width: containerW, height: containerH },
      });

      // Work item nodes inside the epic (positions relative to epic)
      for (const pos of itemPositions) {
        const item = pos.item;
        allNodes.push({
          id: item.id,
          type: 'workItem',
          position: { x: snap(EPIC_PADDING_X + pos.x), y: snap(EPIC_HEADER_H + pos.y) },
          parentId: `epic-${epic.id}`,
          extent: 'parent' as const,
          data: {
            item,
            projectId,
            assigneeName: extras.assigneeNames.get(item.assigneeId ?? ''),
            isBlocked: extras.blockedItems.has(item.id),
            parentTitle: extras.parentTitles.get(item.id),
            childTaskCount: extras.childCounts.get(item.id),
            isHighlighted: extras.highlightId === item.id ? true : undefined,
          } satisfies GraphNodeData,
        });
      }

      epicX += containerW + EPIC_GAP;
    }

    // Orphan items (no epic) positioned to the right of all epics
    if (orphanItems.length > 0) {
      const orphanPositions = layoutItemsInColumn(orphanItems, edges, itemMap);
      for (const pos of orphanPositions) {
        const item = pos.item;
        allNodes.push({
          id: item.id,
          type: 'workItem',
          position: { x: snap(epicX + pos.x), y: snap(pos.y) },
          data: {
            item,
            projectId,
            assigneeName: extras.assigneeNames.get(item.assigneeId ?? ''),
            isBlocked: extras.blockedItems.has(item.id),
            parentTitle: extras.parentTitles.get(item.id),
            childTaskCount: extras.childCounts.get(item.id),
            isHighlighted: extras.highlightId === item.id ? true : undefined,
          } satisfies GraphNodeData,
        });
      }
    }

    return allNodes;
  }, [items, edges, projectId, extras, epics]);
}

// Position items in a column using BFS topological layering
interface ItemPosition {
  item: WorkItem;
  x: number;
  y: number;
}

function layoutItemsInColumn(
  items: WorkItem[],
  edges: MergedEdge[],
  itemMap: Map<string, WorkItem>,
): ItemPosition[] {
  if (items.length === 0) return [];

  const ids = new Set(items.map((i) => i.id));
  const activeEdges = edges.filter(
    (e) => !e.isRemoved && e.type === 'depends_on' && ids.has(e.sourceId) && ids.has(e.targetId),
  );

  // BFS layering
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const item of items) inDegree.set(item.id, 0);
  for (const edge of activeEdges) {
    inDegree.set(edge.sourceId, (inDegree.get(edge.sourceId) ?? 0) + 1);
    const a = adj.get(edge.targetId) ?? [];
    a.push(edge.sourceId);
    adj.set(edge.targetId, a);
  }

  const layers: string[][] = [];
  const assigned = new Set<string>();
  let current = items.filter((i) => (inDegree.get(i.id) ?? 0) === 0).map((i) => i.id);

  while (current.length > 0) {
    layers.push(current);
    for (const id of current) assigned.add(id);
    const next: string[] = [];
    for (const id of current) {
      for (const dep of adj.get(id) ?? []) {
        if (assigned.has(dep)) continue;
        const rem = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, rem);
        if (rem <= 0) next.push(dep);
      }
    }
    current = next;
  }

  // Unassigned (cycles)
  const remaining = items.filter((i) => !assigned.has(i.id));
  if (remaining.length > 0) layers.push(remaining.map((i) => i.id));

  const positions: ItemPosition[] = [];
  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col]!;
    for (let row = 0; row < layer.length; row++) {
      const item = itemMap.get(layer[row]!);
      if (!item) continue;
      positions.push({
        item,
        x: col * (ITEM_W + COL_GAP),
        y: row * (ITEM_H + ROW_GAP),
      });
    }
  }

  return positions;
}
