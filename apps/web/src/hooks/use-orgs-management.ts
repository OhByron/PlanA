import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { toOrgDetail, type OrgDetail } from '../lib/api-transforms';
import type { PaginatedResponse } from '../lib/api-pagination';

export function useOrgsList(includeArchived = false) {
  return useQuery({
    queryKey: ['orgs-list', includeArchived],
    queryFn: async (): Promise<OrgDetail[]> => {
      const qs = includeArchived ? 'include_archived=true&page_size=200' : 'page_size=200';
      const raw = await api.get<PaginatedResponse>(`/orgs?${qs}`);
      return raw.items.map(toOrgDetail);
    },
  });
}

export function useOrg(orgId: string) {
  return useQuery({
    queryKey: ['org', orgId],
    queryFn: async (): Promise<OrgDetail> => {
      const raw = await api.get(`/orgs/${orgId}`);
      return toOrgDetail(raw);
    },
    enabled: !!orgId,
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const raw = await api.post('/orgs', data);
      return toOrgDetail(raw);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orgs-list'] });
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
    },
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, data }: { orgId: string; data: Record<string, unknown> }) => {
      const raw = await api.patch(`/orgs/${orgId}`, data);
      return toOrgDetail(raw);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['org', vars.orgId] });
      qc.invalidateQueries({ queryKey: ['orgs-list'] });
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
    },
  });
}

export function useArchiveOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      await api.post(`/orgs/${orgId}/archive`, {});
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orgs-list'] });
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
    },
  });
}

export function useUnarchiveOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      await api.post(`/orgs/${orgId}/unarchive`, {});
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orgs-list'] });
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
    },
  });
}

export function useDeleteOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      await api.delete(`/orgs/${orgId}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orgs-list'] });
      qc.invalidateQueries({ queryKey: ['nav-tree'] });
    },
  });
}
