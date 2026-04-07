import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

// ---------- Types ----------

export interface VCSConnection {
  id: string;
  projectId: string;
  provider: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  authMethod: string;
  hasToken: boolean;
  installationId?: number | undefined;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VCSBranch {
  id: string;
  connectionId: string;
  name: string;
  sha: string | null;
  url: string | null;
  provider: string;
  repoOwner: string;
  repoName: string;
  createdAt: string;
}

export interface VCSPullRequest {
  id: string;
  connectionId: string;
  externalId: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  sourceBranch: string;
  targetBranch: string;
  authorLogin: string | null;
  authorAvatar: string | null;
  url: string;
  checksStatus: 'pending' | 'success' | 'failure' | 'neutral' | null;
  checksUrl: string | null;
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'commented' | null;
  mergedAt: string | null;
  closedAt: string | null;
  provider: string;
  repoOwner: string;
  repoName: string;
  createdAt: string;
  updatedAt: string;
}

export interface VCSCommit {
  id: string;
  connectionId: string;
  sha: string;
  message: string;
  authorLogin: string | null;
  authorEmail: string | null;
  url: string | null;
  provider: string;
  repoOwner: string;
  repoName: string;
  committedAt: string;
}

export interface VCSSummary {
  branchCount: number;
  openPrCount: number;
  mergedPrs: number;
  commitCount: number;
  checksStatus: string | null;
  reviewStatus: string | null;
}

// ---------- Transform functions ----------

function toConnection(r: Record<string, unknown>): VCSConnection {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    provider: r.provider as string,
    owner: r.owner as string,
    repo: r.repo as string,
    defaultBranch: r.default_branch as string,
    authMethod: r.auth_method as string,
    hasToken: r.has_token as boolean,
    installationId: (r.installation_id as number | null) ?? undefined,
    enabled: r.enabled as boolean,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toBranch(r: Record<string, unknown>): VCSBranch {
  return {
    id: r.id as string,
    connectionId: r.connection_id as string,
    name: r.name as string,
    sha: r.sha as string | null,
    url: r.url as string | null,
    provider: r.provider as string,
    repoOwner: r.repo_owner as string,
    repoName: r.repo_name as string,
    createdAt: r.created_at as string,
  };
}

function toPullRequest(r: Record<string, unknown>): VCSPullRequest {
  return {
    id: r.id as string,
    connectionId: r.connection_id as string,
    externalId: r.external_id as number,
    title: r.title as string,
    state: r.state as VCSPullRequest['state'],
    draft: r.draft as boolean,
    sourceBranch: r.source_branch as string,
    targetBranch: r.target_branch as string,
    authorLogin: r.author_login as string | null,
    authorAvatar: r.author_avatar as string | null,
    url: r.url as string,
    checksStatus: r.checks_status as VCSPullRequest['checksStatus'],
    checksUrl: r.checks_url as string | null,
    reviewStatus: r.review_status as VCSPullRequest['reviewStatus'],
    mergedAt: r.merged_at as string | null,
    closedAt: r.closed_at as string | null,
    provider: r.provider as string,
    repoOwner: r.repo_owner as string,
    repoName: r.repo_name as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toCommit(r: Record<string, unknown>): VCSCommit {
  return {
    id: r.id as string,
    connectionId: r.connection_id as string,
    sha: r.sha as string,
    message: r.message as string,
    authorLogin: r.author_login as string | null,
    authorEmail: r.author_email as string | null,
    url: r.url as string | null,
    provider: r.provider as string,
    repoOwner: r.repo_owner as string,
    repoName: r.repo_name as string,
    committedAt: r.committed_at as string,
  };
}

function toSummary(r: Record<string, unknown>): VCSSummary {
  return {
    branchCount: r.branch_count as number,
    openPrCount: r.open_pr_count as number,
    mergedPrs: r.merged_prs as number,
    commitCount: r.commit_count as number,
    checksStatus: r.checks_status as string | null,
    reviewStatus: r.review_status as string | null,
  };
}

// ---------- Connection hooks (project-scoped) ----------

export function useVCSConnections(projectId: string) {
  return useQuery({
    queryKey: ['vcs-connections', projectId],
    queryFn: async (): Promise<VCSConnection[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/vcs/connections`
      );
      return raw.map(toConnection);
    },
    enabled: !!projectId,
  });
}

export function useCreateVCSConnection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      provider: string;
      owner: string;
      repo: string;
      default_branch?: string;
      auth_method: string;
      token: string;
      installation_id?: number;
    }) => {
      const raw = await api.post(`/projects/${projectId}/vcs/connections`, data);
      return raw as Record<string, unknown>;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['vcs-connections', projectId] }),
  });
}

export function useUpdateVCSConnection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      connectionId,
      data,
    }: {
      connectionId: string;
      data: { default_branch?: string; token?: string; enabled?: boolean };
    }) => {
      const raw = await api.patch(
        `/projects/${projectId}/vcs/connections/${connectionId}`,
        data
      );
      return toConnection(raw as Record<string, unknown>);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['vcs-connections', projectId] }),
  });
}

export function useDeleteVCSConnection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      await api.delete(`/projects/${projectId}/vcs/connections/${connectionId}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['vcs-connections', projectId] }),
  });
}

export function useTestVCSConnection(projectId: string) {
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const raw = await api.post(
        `/projects/${projectId}/vcs/connections/${connectionId}/test`
      );
      return raw as { success: boolean; error?: string };
    },
  });
}

// ---------- Bulk summary (project-scoped, for board cards) ----------

export interface VCSBulkItem {
  workItemId: string;
  openPrCount: number;
  mergedPrs: number;
  checksStatus: string | null;
}

export function useVCSBulkSummary(projectId: string) {
  return useQuery({
    queryKey: ['vcs-bulk-summary', projectId],
    queryFn: async (): Promise<Map<string, VCSBulkItem>> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/vcs/summary`
      );
      const map = new Map<string, VCSBulkItem>();
      for (const r of raw) {
        const item: VCSBulkItem = {
          workItemId: r.work_item_id as string,
          openPrCount: r.open_pr_count as number,
          mergedPrs: r.merged_prs as number,
          checksStatus: r.checks_status as string | null,
        };
        map.set(item.workItemId, item);
      }
      return map;
    },
    enabled: !!projectId,
  });
}

// ---------- Activity hooks (work-item-scoped) ----------

export function useVCSSummary(workItemId: string) {
  return useQuery({
    queryKey: ['vcs-summary', workItemId],
    queryFn: async (): Promise<VCSSummary> => {
      const raw = await api.get<Record<string, unknown>>(
        `/work-items/${workItemId}/vcs-summary`
      );
      return toSummary(raw);
    },
    enabled: !!workItemId,
  });
}

export function useVCSBranches(workItemId: string) {
  return useQuery({
    queryKey: ['vcs-branches', workItemId],
    queryFn: async (): Promise<VCSBranch[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/work-items/${workItemId}/branches`
      );
      return raw.map(toBranch);
    },
    enabled: !!workItemId,
  });
}

export function useVCSPullRequests(workItemId: string) {
  return useQuery({
    queryKey: ['vcs-pull-requests', workItemId],
    queryFn: async (): Promise<VCSPullRequest[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/work-items/${workItemId}/pull-requests`
      );
      return raw.map(toPullRequest);
    },
    enabled: !!workItemId,
  });
}

export function useCreateBranch(workItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const raw = await api.post(`/work-items/${workItemId}/create-branch`);
      return raw as { branch: string; provider: string; repo: string };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['vcs-branches', workItemId] });
      qc.invalidateQueries({ queryKey: ['vcs-summary', workItemId] });
    },
  });
}

export function useVCSCommits(workItemId: string) {
  return useQuery({
    queryKey: ['vcs-commits', workItemId],
    queryFn: async (): Promise<VCSCommit[]> => {
      const raw = await api.get<Record<string, unknown>[]>(
        `/work-items/${workItemId}/commits`
      );
      return raw.map(toCommit);
    },
    enabled: !!workItemId,
  });
}
