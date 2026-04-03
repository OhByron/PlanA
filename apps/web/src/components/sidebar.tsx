import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { cn } from '@projecta/ui';
import { useTranslation } from 'react-i18next';
import { useNavigationTree } from '../hooks/use-orgs';

export function Sidebar() {
  const { t } = useTranslation();
  const { data: tree = [], isLoading, error } = useNavigationTree();
  const params = useParams({ strict: false }) as { projectId?: string };
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('plana_sidebar_collapsed') === 'true',
  );
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string> | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string> | null>(null);

  // Auto-expand on first load so the user sees something immediately
  if (!expandedOrgs && tree.length > 0) {
    const orgIds = new Set(tree.map((o) => o.id));
    const teamIds = new Set(tree.flatMap((o) => o.teams.map((t) => t.id)));
    setExpandedOrgs(orgIds);
    setExpandedTeams(teamIds);
  }

  const safeExpandedOrgs = expandedOrgs ?? new Set<string>();
  const safeExpandedTeams = expandedTeams ?? new Set<string>();

  const toggle = (set: Set<string> | null, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('plana_sidebar_collapsed', String(next));
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 flex-col items-center border-r border-gray-200 bg-white py-4" role="navigation" aria-label="Sidebar">
        <button
          onClick={toggleCollapse}
          className="mb-6 text-lg font-bold text-brand-600"
          title={t('sidebar.expandSidebar')}
          aria-label={t('sidebar.expandSidebar')}
        >
          P
        </button>
        <Link
          to="/my-work"
          className="mb-4 rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title={t('sidebar.myWork')}
          aria-label={t('sidebar.myWork')}
        >
          <ClipboardIcon />
        </Link>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white" role="navigation" aria-label="Sidebar">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
        <span className="text-lg font-bold text-gray-900">
          Plan<span className="text-brand-600">A</span>
        </span>
        <button
          onClick={toggleCollapse}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={t('sidebar.collapseSidebar')}
          aria-label={t('sidebar.collapseSidebar')}
        >
          <ChevronLeftIcon />
        </button>
      </div>

      {/* Quick nav */}
      <div className="px-3 pt-3 space-y-0.5">
        <Link
          to="/my-work"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          activeProps={{ className: 'bg-brand-50 text-brand-700' }}
        >
          <ClipboardIcon />
          {t('sidebar.myWork')}
        </Link>
        <Link
          to="/orgs"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          activeProps={{ className: 'bg-brand-50 text-brand-700' }}
        >
          <OrgIcon />
          {t('sidebar.organisations')}
        </Link>
        <Link
          to="/archive"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          activeProps={{ className: 'bg-brand-50 text-brand-700' }}
        >
          <ArchiveIcon />
          {t('sidebar.archive')}
        </Link>
      </div>

      {/* Nav tree */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {isLoading && (
          <p className="px-2 text-xs text-gray-400">{t('common.loading')}</p>
        )}
        {error && (
          <p className="px-2 text-xs text-red-500">{t('common.error', { message: error.message })}</p>
        )}
        {!isLoading && !error && tree.length === 0 && (
          <p className="px-2 text-xs text-gray-400">{t('sidebar.noOrganisationsYet')}</p>
        )}

        {tree.map((org) => (
          <div key={org.id} className="mb-2">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => toggle(safeExpandedOrgs, org.id, setExpandedOrgs)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t('sidebar.toggle', { name: org.name })}
              >
                <TriangleIcon expanded={safeExpandedOrgs.has(org.id)} />
              </button>
              <Link
                to="/orgs/$orgId"
                params={{ orgId: org.id }}
                className="flex-1 truncate rounded px-1 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                {org.name}
              </Link>
            </div>

            {safeExpandedOrgs.has(org.id) &&
              org.teams.flatMap((team) =>
                team.projects.map((project) => (
                  <Link
                    key={project.id}
                    to="/p/$projectId/board"
                    params={{ projectId: project.id }}
                    className={cn(
                      'ml-4 block truncate rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100',
                      params.projectId === project.id && 'bg-brand-50 font-medium text-brand-700',
                    )}
                  >
                    {project.name}
                  </Link>
                )),
              )}
          </div>
        ))}

      </nav>
    </aside>
  );
}

// --- Inline icons (avoiding a full icon library for now) ---

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function OrgIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function TriangleIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M6 4l8 6-8 6V4z" />
    </svg>
  );
}
