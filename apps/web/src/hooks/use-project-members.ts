import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  jobRole: string;
  createdAt: string;
  updatedAt: string;
}

function toMember(w: Record<string, unknown>): ProjectMember {
  return {
    id: w.id as string,
    projectId: w.project_id as string,
    userId: (w.user_id as string) ?? null,
    name: w.name as string,
    email: (w.email as string) ?? null,
    phone: (w.phone as string) ?? null,
    jobRole: w.job_role as string,
    createdAt: w.created_at as string,
    updatedAt: w.updated_at as string,
  };
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async (): Promise<ProjectMember[]> => {
      const raw = await api.get<Record<string, unknown>[]>(`/projects/${projectId}/members`);
      return raw.map(toMember);
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; email?: string; phone?: string; job_role: string }) => {
      const raw = await api.post(`/projects/${projectId}/members`, data);
      return toMember(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });
}

export function useUpdateProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, data }: { memberId: string; data: Record<string, unknown> }) => {
      const raw = await api.patch(`/projects/${projectId}/members/${memberId}`, data);
      return toMember(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });
}

export function useDeleteProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      await api.delete(`/projects/${projectId}/members/${memberId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });
}
