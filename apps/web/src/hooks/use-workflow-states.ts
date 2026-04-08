import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { WorkflowState } from '@projecta/types';

function toState(w: Record<string, unknown>): WorkflowState {
  return {
    id: w.id as string,
    orgId: w.org_id as string,
    name: w.name as string,
    slug: w.slug as string,
    color: w.color as string,
    position: w.position as number,
    isInitial: w.is_initial as boolean,
    isTerminal: w.is_terminal as boolean,
    createdAt: w.created_at as string,
    updatedAt: w.updated_at as string,
  };
}

// ---------- Org-level states ----------

export function useWorkflowStates(orgId: string) {
  return useQuery({
    queryKey: ['workflow-states', orgId],
    queryFn: async (): Promise<WorkflowState[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/orgs/${orgId}/workflow-states`);
      return raw.map(toState);
    },
    enabled: !!orgId,
  });
}

export function useCreateWorkflowState(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; slug?: string; color?: string; position: number }) => {
      const raw = await api.post(`/orgs/${orgId}/workflow-states`, data);
      return toState(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workflow-states', orgId] }),
  });
}

export function useUpdateWorkflowState(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stateId, data }: { stateId: string; data: { name?: string; color?: string } }) => {
      const raw = await api.patch(`/orgs/${orgId}/workflow-states/${stateId}`, data);
      return toState(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workflow-states', orgId] }),
  });
}

export function useDeleteWorkflowState(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stateId: string) => {
      await api.delete(`/orgs/${orgId}/workflow-states/${stateId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workflow-states', orgId] }),
  });
}

export function useReorderWorkflowStates(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stateIds: string[]) => {
      const raw = await api.post(`/orgs/${orgId}/workflow-states/reorder`, { state_ids: stateIds });
      return (raw as Record<string, unknown>[]).map(toState);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workflow-states', orgId] }),
  });
}

// ---------- Project-level states ----------

export function useProjectWorkflowStates(projectId: string) {
  return useQuery({
    queryKey: ['project-workflow-states', projectId],
    queryFn: async (): Promise<WorkflowState[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/projects/${projectId}/workflow-states`);
      return raw.map(toState);
    },
    enabled: !!projectId,
  });
}
