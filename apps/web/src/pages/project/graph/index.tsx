import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Epic, Sprint } from '@projecta/types';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api-client';
import { toProject } from '../../../lib/api-transforms';
import { useWorkItems, useUpdateWorkItem } from '../../../hooks/use-work-items';
import { useProjectDependencies } from '../../../hooks/use-project-dependencies';
import { useProjectMembers } from '../../../hooks/use-project-members';
import { useBulkCommitDependencies } from '../../../hooks/use-bulk-commit-dependencies';
import { useEpics, useCreateEpic, useUpdateEpic, useDeleteEpic } from '../../../hooks/use-epics';
import { useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint, useAddSprintItem } from '../../../hooks/use-sprints';
import { useEpicDependencies } from '../../../hooks/use-container-dependencies';
import { useSprintDependencies } from '../../../hooks/use-container-dependencies';
import {
  GraphWorkItemNode,
  type GraphNodeData,
} from '../../../components/graph/graph-work-item-node';
import {
  GraphEpicNode,
  type EpicNodeData,
} from '../../../components/graph/graph-epic-node';
import {
  GraphSprintNode,
  type SprintNodeData,
} from '../../../components/graph/graph-sprint-node';
import {
  DependencyEdge,
  EdgeMarkerDefs,
  type DependencyEdgeData,
} from '../../../components/graph/dependency-edge';
import { GraphCreatePanel } from '../../../components/graph/graph-create-panel';
import { GraphEditPanel } from '../../../components/graph/graph-edit-panel';
import { useGraphDraftState, type MergedEdge } from './use-graph-draft-state';
import { useGraphLayout } from './use-graph-layout';
import { validateGraph } from './validate-graph';

const nodeTypes = {
  workItem: GraphWorkItemNode,
  epic: GraphEpicNode,
  sprint: GraphSprintNode,
};
const edgeTypes = { dependency: DependencyEdge };

function mergedEdgesToRfEdges(mergedEdges: MergedEdge[]): Edge<DependencyEdgeData>[] {
  return mergedEdges
    .filter((e) => !e.isRemoved)
    .map((e) => ({
      id: e.id,
      source: e.type === 'depends_on' ? e.targetId : e.sourceId,
      target: e.type === 'depends_on' ? e.sourceId : e.targetId,
      type: 'dependency',
      data: {
        depType: e.type,
        strength: e.strength,
        isDraft: e.isDraft,
      },
    }));
}

type ConnectorMode = 'hard_depends' | 'soft_depends' | 'relates_to';
type CreateMode = 'epic' | 'sprint' | null;

export function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphPageInner />
    </ReactFlowProvider>
  );
}

function GraphPageInner() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const searchParams = useSearch({ strict: false }) as { highlight?: string };
  const navigateTo = useNavigate();
  const reactFlowInstance = useReactFlow();

  // Data fetching
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => { const raw = await api.get(`/projects/${projectId}`); return toProject(raw); },
    staleTime: 5 * 60_000,
  });
  const { data: items = [] } = useWorkItems(projectId);
  const { data: persistedDeps = [] } = useProjectDependencies(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: epics = [] } = useEpics(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const { data: epicDeps = [] } = useEpicDependencies(projectId);
  const { data: sprintDeps = [] } = useSprintDependencies(projectId);
  const bulkCommit = useBulkCommitDependencies(projectId);
  const createEpic = useCreateEpic(projectId);
  const createSprint = useCreateSprint(projectId);
  const updateEpic = useUpdateEpic(projectId);
  const updateSprint = useUpdateSprint(projectId);
  const deleteEpic = useDeleteEpic(projectId);
  const deleteSprint = useDeleteSprint(projectId);
  const updateItem = useUpdateWorkItem(projectId);
  const addSprintItem = useAddSprintItem();

  // Draft state (work item dependencies)
  const draft = useGraphDraftState(persistedDeps);

  // UI state
  const [connectorMode, setConnectorMode] = useState<ConnectorMode>('hard_depends');
  const [createMode, setCreateMode] = useState<CreateMode>(null);

  type EditTarget =
    | { type: 'epic'; epic: Epic & { itemNumber?: number | null } }
    | { type: 'sprint'; sprint: Sprint }
    | null;
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragToast, setDragToast] = useState<string | null>(null);
  const dragStartPos = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Precompute work item lookup maps
  const extras = useMemo(() => {
    const assigneeNames = new Map<string, string>();
    for (const m of members) assigneeNames.set(m.id, m.name);
    const blockedItems = new Set<string>();
    const parentTitles = new Map<string, string>();
    const childCounts = new Map<string, number>();
    const itemMap = new Map(items.map((i) => [i.id, i]));
    for (const item of items) {
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        if (parent) parentTitles.set(item.id, parent.title);
        childCounts.set(item.parentId, (childCounts.get(item.parentId) ?? 0) + 1);
      }
    }
    for (const edge of draft.mergedEdges) {
      if (edge.isRemoved || edge.type !== 'depends_on' || edge.strength !== 'hard') continue;
      const target = itemMap.get(edge.targetId);
      if (target && target.status !== 'done' && target.status !== 'cancelled') {
        blockedItems.add(edge.sourceId);
      }
    }
    return { assigneeNames, blockedItems, parentTitles, childCounts, highlightId: null as string | null };
  }, [items, members, draft.mergedEdges]);

  // Work item layout (persisted edges only to keep stable)
  const persistedEdges = useMemo(
    () => draft.mergedEdges.filter((e) => !e.isDraft),
    [draft.mergedEdges],
  );
  const workItemNodes = useGraphLayout(items, persistedEdges, projectId, extras);

  // Epic nodes
  const epicNodes = useMemo((): Node<EpicNodeData>[] => {
    const NODE_WIDTH = 288;
    const NODE_HEIGHT = 140;
    const GAP = 40;
    const OFFSET_Y = -200; // Place epics above work items

    return epics.map((epic, i) => {
      const epicItems = items.filter((wi) => wi.epicId === epic.id);
      const doneItems = epicItems.filter((wi) => wi.status === 'done' || wi.status === 'cancelled');
      const totalPts = epicItems.reduce((s, wi) => s + (wi.storyPoints ?? 0), 0);
      const donePts = doneItems.reduce((s, wi) => s + (wi.storyPoints ?? 0), 0);

      return {
        id: `epic-${epic.id}`,
        type: 'epic' as const,
        position: { x: i * (NODE_WIDTH + GAP), y: OFFSET_Y },
        data: {
          epic,
          itemCount: epicItems.length,
          doneCount: doneItems.length,
          totalPoints: totalPts,
          donePoints: donePts,
          isHighlighted: undefined,
          isDropTarget: undefined,
        },
      };
    });
  }, [epics, items]);

  // Sprint nodes
  const sprintNodes = useMemo((): Node<SprintNodeData>[] => {
    const NODE_WIDTH = 288;
    const GAP = 40;
    // Place sprints below work items
    const maxWorkItemY = workItemNodes.reduce((max, n) => Math.max(max, n.position.y), 0);
    const OFFSET_Y = maxWorkItemY + 200;

    // Compute average velocity from completed sprints
    const completedSprints = sprints.filter((s) => s.status === 'completed' && s.velocity != null);
    const avgVelocity = completedSprints.length > 0
      ? Math.round(completedSprints.reduce((s, sp) => s + (sp.velocity ?? 0), 0) / completedSprints.length)
      : null;

    return sprints.map((sprint, i) => {
      // TODO: need sprint items data - for now count items with no sprint assignment
      // In a full implementation we'd fetch sprint_items. For now use a placeholder.
      return {
        id: `sprint-${sprint.id}`,
        type: 'sprint' as const,
        position: { x: i * (NODE_WIDTH + GAP), y: OFFSET_Y },
        data: {
          sprint,
          itemCount: 0, // Will be populated when we add sprint item fetching
          doneCount: 0,
          totalPoints: 0,
          avgVelocity,
          isHighlighted: undefined,
          isDropTarget: undefined,
        },
      };
    });
  }, [sprints, workItemNodes]);

  // Combine all edges: work item deps + epic deps + sprint deps
  const allRfEdges = useMemo(() => {
    const wiEdges = mergedEdgesToRfEdges(draft.mergedEdges);

    const epicEdges: Edge<DependencyEdgeData>[] = epicDeps.map((d) => ({
      id: `edep-${d.id}`,
      source: d.type === 'depends_on' ? `epic-${d.targetId}` : `epic-${d.sourceId}`,
      target: d.type === 'depends_on' ? `epic-${d.sourceId}` : `epic-${d.targetId}`,
      type: 'dependency',
      data: { depType: d.type, strength: d.strength, isDraft: undefined },
    }));

    const sprintEdges: Edge<DependencyEdgeData>[] = sprintDeps.map((d) => ({
      id: `sdep-${d.id}`,
      source: d.type === 'depends_on' ? `sprint-${d.targetId}` : `sprint-${d.sourceId}`,
      target: d.type === 'depends_on' ? `sprint-${d.sourceId}` : `sprint-${d.targetId}`,
      type: 'dependency',
      data: { depType: d.type, strength: d.strength, isDraft: undefined },
    }));

    return [...wiEdges, ...epicEdges, ...sprintEdges];
  }, [draft.mergedEdges, epicDeps, sprintDeps]);

  // Combine all nodes
  const allLayoutNodes = useMemo(
    () => [...workItemNodes, ...epicNodes, ...sprintNodes] as Node[],
    [workItemNodes, epicNodes, sprintNodes],
  );

  // Node state management
  const layoutKey = useMemo(
    () => items.map((i) => i.id).join(',') + '|' + persistedDeps.map((d) => d.id).join(',')
      + '|' + epics.map((e) => e.id).join(',') + '|' + sprints.map((s) => s.id).join(','),
    [items, persistedDeps, epics, sprints],
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  const appliedKeyRef = useRef('');
  const wasDirtyRef = useRef(false);
  const isDirty = draft.isDirty;

  useEffect(() => {
    const keyChanged = appliedKeyRef.current !== layoutKey;
    const justCommitted = wasDirtyRef.current && !isDirty;
    wasDirtyRef.current = isDirty;
    if (keyChanged || justCommitted) {
      appliedKeyRef.current = layoutKey;
      setNodes(allLayoutNodes);
    }
  }, [layoutKey, isDirty, allLayoutNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  // Helper: find which container node the dragged item overlaps
  const findOverlappingContainer = useCallback(
    (draggedNode: Node): string | null => {
      const cx = draggedNode.position.x + 120;
      const cy = draggedNode.position.y + 50;
      for (const node of nodes) {
        if (node.id === draggedNode.id) continue;
        if (!node.id.startsWith('epic-') && !node.id.startsWith('sprint-')) continue;
        const x1 = node.position.x;
        const y1 = node.position.y;
        if (cx >= x1 && cx <= x1 + 288 && cy >= y1 && cy <= y1 + 140) return node.id;
      }
      return null;
    },
    [nodes],
  );

  // Record starting position when a drag begins
  const onNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      dragStartPos.current.set(node.id, { ...node.position });
    },
    [],
  );

  // Snap a node back to its pre-drag position
  const snapBack = useCallback(
    (nodeId: string) => {
      const pos = dragStartPos.current.get(nodeId);
      if (!pos) return;
      setNodes((ns) => ns.map((n) => n.id === nodeId ? { ...n, position: pos } : n));
      dragStartPos.current.delete(nodeId);
    },
    [],
  );

  // Track hover target during drag for visual feedback
  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      // Only work items can be dropped on containers
      const isWorkItem = !draggedNode.id.startsWith('epic-') && !draggedNode.id.startsWith('sprint-');
      const target = isWorkItem ? findOverlappingContainer(draggedNode) : null;

      setDropTargetId((prev) => {
        if (prev === target) return prev;
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id === target) return { ...n, data: { ...n.data, isDropTarget: true } };
            if (n.id === prev) return { ...n, data: { ...n.data, isDropTarget: false } };
            return n;
          }),
        );
        return target;
      });
    },
    [findOverlappingContainer],
  );

  // Drag-to-assign or reject invalid drops
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      // Clear drop highlights
      setNodes((ns) => ns.map((n) => n.data?.isDropTarget ? { ...n, data: { ...n.data, isDropTarget: false } } : n));
      setDropTargetId(null);

      const isEpic = draggedNode.id.startsWith('epic-');
      const isSprint = draggedNode.id.startsWith('sprint-');
      const overlapping = findOverlappingContainer(draggedNode);

      // Reject invalid drops: epic-on-anything, sprint-on-anything
      if ((isEpic || isSprint) && overlapping) {
        let message: string;
        if (isEpic && overlapping.startsWith('epic-')) {
          message = t('graph.cannotDropEpicOnEpic');
        } else if (isSprint && overlapping.startsWith('sprint-')) {
          message = t('graph.cannotDropSprintOnSprint');
        } else if (isSprint && overlapping.startsWith('epic-')) {
          message = t('graph.cannotDropSprintOnEpic');
        } else {
          message = t('graph.invalidDrop');
        }
        snapBack(draggedNode.id);
        setDragToast(message);
        setTimeout(() => setDragToast(null), 3000);
        return;
      }

      // Valid drop: work item onto a container
      if (!isEpic && !isSprint && overlapping) {
        if (overlapping.startsWith('epic-')) {
          const epicId = overlapping.replace('epic-', '');
          updateItem.mutate({ workItemId: draggedNode.id, data: { epicId } });
          const children = items.filter((i) => i.parentId === draggedNode.id);
          for (const child of children) {
            updateItem.mutate({ workItemId: child.id, data: { epicId } });
          }
        } else if (overlapping.startsWith('sprint-')) {
          const sprintId = overlapping.replace('sprint-', '');
          addSprintItem.mutate({ sprintId, workItemId: draggedNode.id });
        }
      }

      dragStartPos.current.delete(draggedNode.id);
    },
    [findOverlappingContainer, updateItem, addSprintItem, items, snapBack, t],
  );

  const edges = allRfEdges;

  // Connection handler
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const type = connectorMode === 'relates_to' ? 'relates_to' as const : 'depends_on' as const;
      const strength = connectorMode === 'soft_depends' ? 'soft' as const : 'hard' as const;
      const sourceId = type === 'depends_on' ? connection.target : connection.source;
      const targetId = type === 'depends_on' ? connection.source : connection.target;
      draft.addEdge(sourceId, targetId, type, strength);
    },
    [connectorMode, draft],
  );

  // Edge changes
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge<DependencyEdgeData>>[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          draft.removeEdge(change.id);
        }
      }
    },
    [draft],
  );

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      draft.removeEdge(edge.id);
    },
    [draft],
  );

  // Validation
  const warnings = useMemo(
    () => validateGraph(draft.mergedEdges, items, members),
    [draft.mergedEdges, items, members],
  );
  const hasErrors = warnings.some((w) => w.severity === 'error');

  // Commit
  const handleCommit = useCallback(async () => {
    if (hasErrors) return;
    try {
      await bulkCommit.mutateAsync(draft.commitPayload);
      draft.committed();
    } catch { /* handled by React Query */ }
  }, [bulkCommit, draft, hasErrors]);

  // Create handlers
  const handleCreateEpic = useCallback(
    (data: Record<string, unknown>) => { createEpic.mutate(data); },
    [createEpic],
  );
  const handleCreateSprint = useCallback(
    (data: Record<string, unknown>) => { createSprint.mutate(data); },
    [createSprint],
  );

  // Highlight
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const highlightHandled = useRef<string | null>(null);

  useEffect(() => {
    const id = searchParams.highlight;
    if (!id || nodes.length === 0 || highlightHandled.current === id) return;
    highlightHandled.current = id;
    navigateTo({ to: '/p/$projectId/graph', params: { projectId }, search: {}, replace: true });
    setHighlightNodeId(id);
    setNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, data: { ...n.data, isHighlighted: true } } : n),
    );
    const timer = setTimeout(() => {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        reactFlowInstance.setCenter(node.position.x + 130, node.position.y + 60, { zoom: 1.2, duration: 600 });
      }
    }, 300);
    const clearTimer = setTimeout(() => {
      setHighlightNodeId(null);
      setNodes((prev) =>
        prev.map((n) => n.id === id ? { ...n, data: { ...n.data, isHighlighted: undefined } } : n),
      );
    }, 2500);
    return () => { clearTimeout(timer); clearTimeout(clearTimer); };
  }, [searchParams.highlight, nodes.length, reactFlowInstance, navigateTo, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Double-click node:
  //  - Work items → navigate to backlog with highlight
  //  - Epics/sprints → open edit panel
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id.startsWith('epic-')) {
        const epicId = node.id.replace('epic-', '');
        const epic = epics.find((e) => e.id === epicId);
        if (epic) {
          setCreateMode(null);
          setEditTarget({ type: 'epic', epic });
        }
      } else if (node.id.startsWith('sprint-')) {
        const sprintId = node.id.replace('sprint-', '');
        const sprint = sprints.find((s) => s.id === sprintId);
        if (sprint) {
          setCreateMode(null);
          setEditTarget({ type: 'sprint', sprint });
        }
      } else {
        navigateTo({
          to: '/p/$projectId/backlog',
          params: { projectId },
          search: { highlight: node.id },
        });
      }
    },
    [navigateTo, projectId, epics, sprints],
  );

  // Edit panel handlers
  const handleUpdateEpic = useCallback(
    (epicId: string, data: Record<string, unknown>) => { updateEpic.mutate({ epicId, data }); },
    [updateEpic],
  );
  const handleUpdateSprint = useCallback(
    (sprintId: string, data: Record<string, unknown>) => { updateSprint.mutate({ sprintId, data }); },
    [updateSprint],
  );
  const handleDeleteEpic = useCallback(
    (epicId: string) => { deleteEpic.mutate(epicId); },
    [deleteEpic],
  );
  const handleDeleteSprint = useCallback(
    (sprintId: string) => { deleteSprint.mutate(sprintId); },
    [deleteSprint],
  );

  const warningItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const w of warnings) for (const id of w.itemIds) ids.add(id);
    return ids;
  }, [warnings]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        {/* Connector mode */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setConnectorMode('hard_depends')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              connectorMode === 'hard_depends' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('graph.hardDependency')}
          </button>
          <button
            onClick={() => setConnectorMode('soft_depends')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              connectorMode === 'soft_depends' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('graph.softDependency')}
          </button>
          <button
            onClick={() => setConnectorMode('relates_to')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              connectorMode === 'relates_to' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('graph.relatesTo')}
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-gray-500" /> {t('graph.hardLine')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-amber-500" /> {t('graph.softLine')}
          </span>
        </div>

        <div className="mx-2 h-4 w-px bg-gray-200" />

        {/* Create buttons */}
        <button
          onClick={() => setCreateMode(createMode === 'epic' ? null : 'epic')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            createMode === 'epic' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          + {t('graph.epic')}
        </button>
        <button
          onClick={() => setCreateMode(createMode === 'sprint' ? null : 'sprint')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            createMode === 'sprint' ? 'bg-sky-100 text-sky-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          + {t('graph.sprint')}
        </button>

        <div className="flex-1" />

        {/* Validation */}
        {warnings.length > 0 && (
          <div className="flex items-center gap-2">
            {warnings.filter((w) => w.severity === 'error').length > 0 && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {warnings.filter((w) => w.severity === 'error').length} {t('graph.errors')}
              </span>
            )}
            {warnings.filter((w) => w.severity === 'warning').length > 0 && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {warnings.filter((w) => w.severity === 'warning').length} {t('graph.warnings')}
              </span>
            )}
          </div>
        )}

        {/* Commit/discard */}
        {draft.isDirty && (
          <>
            <button
              onClick={draft.reset}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('graph.discard')}
            </button>
            <button
              onClick={handleCommit}
              disabled={hasErrors || bulkCommit.isPending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {bulkCommit.isPending ? t('graph.committing') : t('graph.commit')}
            </button>
          </>
        )}
      </div>

      {/* Validation panel */}
      {warnings.length > 0 && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex flex-col gap-1">
            {warnings.map((w, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs ${w.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                <span>{w.severity === 'error' ? '●' : '▲'}</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invalid drop toast */}
      {dragToast && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
          <span className="text-xs text-amber-800">{dragToast}</span>
          <button onClick={() => setDragToast(null)} className="text-xs font-medium text-amber-600 hover:text-amber-800">
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1">
        <GraphCreatePanel
          mode={createMode}
          onClose={() => setCreateMode(null)}
          onCreateEpic={handleCreateEpic}
          onCreateSprint={handleCreateSprint}
          existingSprints={sprints}
          sprintDurationWeeks={project?.sprintDurationWeeks ?? 2}
          epicDurationWeeks={project?.defaultEpicWeeks ?? 6}
        />
        <GraphEditPanel
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdateEpic={handleUpdateEpic}
          onUpdateSprint={handleUpdateSprint}
          onDeleteEpic={handleDeleteEpic}
          onDeleteSprint={handleDeleteSprint}
          members={members}
        />
        <EdgeMarkerDefs />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          snapToGrid
          snapGrid={[20, 20]}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: 'dependency' }}
          deleteKeyCode="Delete"
          className="bg-gray-50"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              if (node.id === highlightNodeId) return '#6366f1';
              if (node.id.startsWith('epic-')) return '#a5b4fc';
              if (node.id.startsWith('sprint-')) return '#7dd3fc';
              if (warningItemIds.has(node.id)) return '#f59e0b';
              return '#e5e7eb';
            }}
            maskColor="rgba(0,0,0,0.1)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
