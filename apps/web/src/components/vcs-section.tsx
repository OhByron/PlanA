import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VCSBranch, VCSPullRequest, VCSCommit } from '../hooks/use-vcs';
import { useVCSBranches, useVCSPullRequests, useVCSCommits, useCreateBranch, useVCSConnections } from '../hooks/use-vcs';
import { VCSStatusBadge } from './vcs-status-badge';

interface VCSSectionProps {
  workItemId: string;
  projectId: string;
  itemNumber: number | null;
  itemTitle: string;
}

export function VCSSection({ workItemId, projectId, itemNumber, itemTitle }: VCSSectionProps) {
  const { t } = useTranslation();
  const { data: branches } = useVCSBranches(workItemId);
  const { data: prs } = useVCSPullRequests(workItemId);
  const { data: commits } = useVCSCommits(workItemId);
  const { data: vcsConns } = useVCSConnections(projectId);
  const createBranch = useCreateBranch(workItemId);
  const [copiedBranch, setCopiedBranch] = useState(false);

  const hasBranches = branches && branches.length > 0;
  const hasPRs = prs && prs.length > 0;
  const hasCommits = commits && commits.length > 0;
  const hasConnection = (vcsConns?.length ?? 0) > 0;
  const hasData = hasBranches || hasPRs || hasCommits;

  if (!hasData && !hasConnection) return null;

  const handleCopyBranch = () => {
    if (itemNumber == null) return;
    const slug = itemTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    navigator.clipboard.writeText(`feature/#${itemNumber}-${slug}`);
    setCopiedBranch(true);
    setTimeout(() => setCopiedBranch(false), 2000);
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {t('vcs.title')}
        </h2>
        {itemNumber != null && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyBranch}
              className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              title={t('vcs.copyBranch') ?? 'Copy branch name'}
            >
              {copiedBranch ? (t('vcs.copied') ?? 'Copied!') : (t('vcs.copyBranch') ?? 'Copy branch name')}
            </button>
            {hasConnection && (
              <button
                onClick={() => createBranch.mutate()}
                disabled={createBranch.isPending}
                className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors disabled:opacity-50"
                title={t('vcs.createBranch') ?? 'Create branch in repository'}
              >
                {createBranch.isPending
                  ? (t('common.creating') ?? 'Creating...')
                  : createBranch.isSuccess
                    ? createBranch.data?.branch
                    : (t('vcs.createBranch') ?? 'Create branch')}
              </button>
            )}
          </div>
        )}
      </div>
      {hasData && (
        <div className="space-y-3">
          {hasBranches && <BranchList branches={branches} />}
          {hasPRs && <PRList prs={prs} />}
          {hasCommits && <CommitList commits={commits} />}
        </div>
      )}
    </section>
  );
}

// ---------- Branch list ----------

function BranchList({ branches }: { branches: VCSBranch[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold text-gray-500">{t('vcs.branches')}</h3>
      <ul className="space-y-1.5">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center gap-2 text-sm">
            <ProviderIcon provider={b.provider} />
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">
              {b.name}
            </code>
            {b.sha && (
              <span className="text-[10px] text-gray-400 font-mono">{b.sha.slice(0, 7)}</span>
            )}
            <span className="text-[10px] text-gray-400">
              {b.repoOwner}/{b.repoName}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- PR list ----------

function PRList({ prs }: { prs: VCSPullRequest[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold text-gray-500">{t('vcs.pullRequests')}</h3>
      <ul className="space-y-2">
        {prs.map((pr) => (
          <li key={pr.id} className="flex items-start gap-2">
            <ProviderIcon provider={pr.provider} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 hover:text-brand-600 truncate"
                >
                  #{pr.externalId} {pr.title}
                </a>
                <VCSStatusBadge
                  state={pr.state}
                  checksStatus={pr.checksStatus}
                  checksUrl={pr.checksUrl}
                  draft={pr.draft}
                />
                {pr.reviewStatus && (
                  <ReviewBadge status={pr.reviewStatus} />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                <span>{pr.sourceBranch} &rarr; {pr.targetBranch}</span>
                {pr.authorLogin && <span>by {pr.authorLogin}</span>}
                <span>{pr.repoOwner}/{pr.repoName}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Commit list ----------

function CommitList({ commits }: { commits: VCSCommit[] }) {
  const { t } = useTranslation();
  // Show at most 10 commits inline
  const shown = commits.slice(0, 10);
  const remaining = commits.length - shown.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold text-gray-500">
        {t('vcs.commits')} ({commits.length})
      </h3>
      <ul className="space-y-1.5">
        {shown.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span className="text-[10px] text-gray-400 font-mono shrink-0 mt-0.5">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">
                  {c.sha.slice(0, 7)}
                </a>
              ) : (
                c.sha.slice(0, 7)
              )}
            </span>
            <span className="text-gray-700 truncate">{firstLine(c.message)}</span>
            {c.authorLogin && (
              <span className="text-[10px] text-gray-400 shrink-0">{c.authorLogin}</span>
            )}
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="mt-2 text-[10px] text-gray-400">
          +{remaining} {t('vcs.moreCommits')}
        </p>
      )}
    </div>
  );
}

// ---------- Helpers ----------

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'github') {
    return (
      <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }
  // GitLab icon
  return (
    <svg className="h-4 w-4 shrink-0 text-orange-500" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 14.615l2.49-7.66H5.51L8 14.615z" />
      <path d="M8 14.615L5.51 6.955H1.27L8 14.615z" opacity="0.7" />
      <path d="M1.27 6.955l-.87 2.68c-.08.24 0 .51.21.66L8 14.615 1.27 6.955z" />
      <path d="M1.27 6.955h4.24L3.6 1.18c-.09-.27-.47-.27-.56 0L1.27 6.955z" />
      <path d="M8 14.615l2.49-7.66h4.24L8 14.615z" opacity="0.7" />
      <path d="M14.73 6.955l.87 2.68c.08.24 0 .51-.21.66L8 14.615l6.73-7.66z" />
      <path d="M14.73 6.955H10.49l1.91-5.775c.09-.27.47-.27.56 0l1.77 5.775z" />
    </svg>
  );
}

function ReviewBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return <span className="rounded bg-green-50 px-1 py-0.5 text-[10px] font-medium text-green-700">Approved</span>;
  }
  if (status === 'changes_requested') {
    return <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700">Changes requested</span>;
  }
  return null;
}

function firstLine(message: string): string {
  const idx = message.indexOf('\n');
  return idx > 0 ? message.slice(0, idx) : message;
}
