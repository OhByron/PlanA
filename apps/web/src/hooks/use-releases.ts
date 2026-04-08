import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface Release {
  id: string;
  projectId: string;
  name: string;
  version: string | null;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  shareToken: string | null;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface ReleaseItem {
  id: string;
  itemNumber: number | null;
  title: string;
  type: string;
  stateName: string;
  stateColor: string;
}

export interface ReleaseSprint {
  id: string;
  name: string;
}

function toRelease(w: Record<string, unknown>): Release {
  return {
    id: w.id as string,
    projectId: w.project_id as string,
    name: w.name as string,
    version: (w.version as string) ?? null,
    description: (w.description as string) ?? null,
    status: w.status as Release['status'],
    notes: (w.notes as string) ?? null,
    shareToken: (w.share_token as string) ?? null,
    publishedAt: (w.published_at as string) ?? null,
    createdBy: w.created_by as string,
    createdAt: w.created_at as string,
    updatedAt: w.updated_at as string,
    itemCount: (w.item_count as number) ?? 0,
  };
}

export function useReleases(projectId: string) {
  return useQuery({
    queryKey: ['releases', projectId],
    queryFn: async (): Promise<Release[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/projects/${projectId}/releases`);
      return raw.map(toRelease);
    },
    enabled: !!projectId,
  });
}

export function useRelease(projectId: string, releaseId: string) {
  return useQuery({
    queryKey: ['release', releaseId],
    queryFn: async () => {
      const raw = await api.get<Record<string, unknown>>(`/projects/${projectId}/releases/${releaseId}`);
      const release = toRelease(raw.release as Record<string, unknown>);
      const items = ((raw.items as Record<string, unknown>[]) ?? []).map((i): ReleaseItem => ({
        id: i.id as string,
        itemNumber: (i.item_number as number) ?? null,
        title: i.title as string,
        type: i.type as string,
        stateName: i.state_name as string,
        stateColor: i.state_color as string,
      }));
      const sprints = ((raw.sprints as Record<string, unknown>[]) ?? []).map((s): ReleaseSprint => ({
        id: s.id as string,
        name: s.name as string,
      }));
      return { release, items, sprints };
    },
    enabled: !!projectId && !!releaseId,
  });
}

export function useCreateRelease(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; version?: string | undefined; sprint_ids: string[] }) => {
      const raw = await api.post(`/projects/${projectId}/releases`, data);
      return raw as Record<string, unknown>;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  });
}

export function useUpdateRelease(projectId: string, releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await api.patch(`/projects/${projectId}/releases/${releaseId}`, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['releases', projectId] });
      qc.invalidateQueries({ queryKey: ['release', releaseId] });
    },
  });
}

export function useGenerateNotes(projectId: string, releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const raw = await api.post(`/projects/${projectId}/releases/${releaseId}/generate-notes`);
      return (raw as { notes: string }).notes;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['release', releaseId] }),
  });
}

export function useEnhanceNotes(projectId: string, releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const raw = await api.post(`/projects/${projectId}/releases/${releaseId}/enhance-notes`);
      return (raw as { notes: string }).notes;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['release', releaseId] }),
  });
}

export function usePublishRelease(projectId: string, releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/releases/${releaseId}/publish`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['releases', projectId] });
      qc.invalidateQueries({ queryKey: ['release', releaseId] });
    },
  });
}

export function useShareRelease(projectId: string, releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const raw = await api.post(`/projects/${projectId}/releases/${releaseId}/share`);
      return (raw as { share_token: string }).share_token;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['release', releaseId] }),
  });
}

export function useUnshareRelease(projectId: string, releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/releases/${releaseId}/share`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['release', releaseId] }),
  });
}
