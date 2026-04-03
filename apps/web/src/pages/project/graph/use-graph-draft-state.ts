import { useReducer, useCallback, useMemo } from 'react';
type DependencyType = 'depends_on' | 'relates_to';
type DependencyStrength = 'hard' | 'soft';
import type { Dependency } from '../../../hooks/use-dependencies';

// --- Types ---

export interface DraftEdge {
  tempId: string;
  sourceId: string;
  targetId: string;
  type: DependencyType;
  strength: DependencyStrength;
}

export interface MergedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: DependencyType;
  strength: DependencyStrength;
  isDraft: boolean;
  isRemoved: boolean;
}

// --- State & Actions ---

interface DraftState {
  addedEdges: Map<string, DraftEdge>;
  removedEdgeIds: Set<string>;
}

type DraftAction =
  | { type: 'ADD_EDGE'; edge: DraftEdge }
  | { type: 'REMOVE_EDGE'; edgeId: string; isPersisted: boolean }
  | { type: 'RESTORE_EDGE'; edgeId: string }
  | { type: 'UPDATE_EDGE'; edgeId: string; updates: Partial<Pick<DraftEdge, 'type' | 'strength'>> }
  | { type: 'RESET' }
  | { type: 'COMMITTED' };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'ADD_EDGE': {
      const next = new Map(state.addedEdges);
      next.set(action.edge.tempId, action.edge);
      return { ...state, addedEdges: next };
    }
    case 'REMOVE_EDGE': {
      if (action.isPersisted) {
        // Mark a persisted edge for deletion
        const next = new Set(state.removedEdgeIds);
        next.add(action.edgeId);
        return { ...state, removedEdgeIds: next };
      }
      // Remove a draft edge
      const next = new Map(state.addedEdges);
      next.delete(action.edgeId);
      return { ...state, addedEdges: next };
    }
    case 'RESTORE_EDGE': {
      const next = new Set(state.removedEdgeIds);
      next.delete(action.edgeId);
      return { ...state, removedEdgeIds: next };
    }
    case 'UPDATE_EDGE': {
      const existing = state.addedEdges.get(action.edgeId);
      if (existing) {
        const next = new Map(state.addedEdges);
        next.set(action.edgeId, { ...existing, ...action.updates });
        return { ...state, addedEdges: next };
      }
      return state;
    }
    case 'RESET':
    case 'COMMITTED':
      return { addedEdges: new Map(), removedEdgeIds: new Set() };
    default:
      return state;
  }
}

const initialState: DraftState = {
  addedEdges: new Map(),
  removedEdgeIds: new Set(),
};

// --- Hook ---

let tempIdCounter = 0;

export function useGraphDraftState(persistedDeps: Dependency[]) {
  const [state, dispatch] = useReducer(draftReducer, initialState);

  const addEdge = useCallback(
    (sourceId: string, targetId: string, type: DependencyType, strength: DependencyStrength) => {
      const tempId = `draft-${++tempIdCounter}`;
      dispatch({
        type: 'ADD_EDGE',
        edge: { tempId, sourceId, targetId, type, strength },
      });
      return tempId;
    },
    [],
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      const isPersisted = !edgeId.startsWith('draft-');
      dispatch({ type: 'REMOVE_EDGE', edgeId, isPersisted });
    },
    [],
  );

  const restoreEdge = useCallback((edgeId: string) => {
    dispatch({ type: 'RESTORE_EDGE', edgeId });
  }, []);

  const updateEdge = useCallback(
    (edgeId: string, updates: Partial<Pick<DraftEdge, 'type' | 'strength'>>) => {
      dispatch({ type: 'UPDATE_EDGE', edgeId, updates });
    },
    [],
  );

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const committed = useCallback(() => dispatch({ type: 'COMMITTED' }), []);

  // Merge persisted + draft edges
  const mergedEdges: MergedEdge[] = useMemo(() => {
    const edges: MergedEdge[] = [];

    // Persisted edges (minus removed ones)
    for (const dep of persistedDeps) {
      edges.push({
        id: dep.id,
        sourceId: dep.sourceId,
        targetId: dep.targetId,
        type: dep.type,
        strength: dep.strength,
        isDraft: false,
        isRemoved: state.removedEdgeIds.has(dep.id),
      });
    }

    // Draft edges
    for (const [, draft] of state.addedEdges) {
      edges.push({
        id: draft.tempId,
        sourceId: draft.sourceId,
        targetId: draft.targetId,
        type: draft.type,
        strength: draft.strength,
        isDraft: true,
        isRemoved: false,
      });
    }

    return edges;
  }, [persistedDeps, state.addedEdges, state.removedEdgeIds]);

  const isDirty = state.addedEdges.size > 0 || state.removedEdgeIds.size > 0;

  // Build the payload for the bulk commit API
  const commitPayload = useMemo(
    () => ({
      create: Array.from(state.addedEdges.values()).map((e) => ({
        source_id: e.sourceId,
        target_id: e.targetId,
        type: e.type,
        strength: e.strength,
      })),
      delete: Array.from(state.removedEdgeIds),
    }),
    [state.addedEdges, state.removedEdgeIds],
  );

  return {
    mergedEdges,
    isDirty,
    commitPayload,
    addEdge,
    removeEdge,
    restoreEdge,
    updateEdge,
    reset,
    committed,
  };
}
