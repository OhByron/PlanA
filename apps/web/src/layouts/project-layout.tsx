import { Link, Outlet, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cn } from '@projecta/ui';
import { api } from '../lib/api-client';
import { toProject } from '../lib/api-transforms';
import { useAuth } from '../auth/auth-context';
import { useProjectMembers } from '../hooks/use-project-members';

export function ProjectLayout() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { user } = useAuth();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const raw = await api.get(`/projects/${projectId}`);
      return toProject(raw);
    },
    staleTime: 5 * 60_000,
  });

  const { data: members = [] } = useProjectMembers(projectId);
  const currentMember = members.find((m) => m.userId === user?.id);
  const isPM = currentMember?.jobRole === 'pm' || currentMember?.jobRole === 'po';

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const tabs = [
    { label: t('nav.board'), to: '/p/$projectId/board' as const },
    { label: t('nav.graph'), to: '/p/$projectId/graph' as const },
    { label: t('nav.backlog'), to: '/p/$projectId/backlog' as const },
    { label: t('nav.epics'), to: '/p/$projectId/epics' as const },
    { label: t('nav.sprints'), to: '/p/$projectId/sprints' as const },
    ...(isPM ? [{ label: t('nav.gantt'), to: '/p/$projectId/gantt' as const }] : []),
    { label: t('nav.calendar'), to: '/p/$projectId/calendar' as const },
    { label: t('nav.reports'), to: '/p/$projectId/reports' as const },
    { label: t('nav.report'), to: '/p/$projectId/report' as const },
    { label: t('nav.team'), to: '/p/$projectId/team' as const },
    { label: t('nav.settings'), to: '/p/$projectId/settings' as const },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Project header + tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex items-center gap-4 pt-4 pb-0">
          <h1 className="text-lg font-semibold text-gray-900">
            {project?.name ?? t('nav.project')}
          </h1>
          {project?.methodology && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {t(`methodology.${project.methodology}`, project.methodology)}
            </span>
          )}
        </div>
        <nav className="mt-3 flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ projectId }}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
              activeProps={{
                className: 'border-brand-600 text-brand-700',
              }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
