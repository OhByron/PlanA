import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@projecta/ui';
import type { Sprint, SprintStatus } from '@projecta/types';
import { useSprints } from '../../hooks/use-sprints';
import { CreateSprintDialog } from '../../components/create-sprint-dialog';
import { HelpOverlay } from '../../components/help-overlay';

const statusOrder: SprintStatus[] = ['active', 'planned', 'completed', 'cancelled'];
const statusColors: Record<SprintStatus, 'success' | 'default' | 'secondary' | 'outline'> = {
  active: 'success',
  planned: 'default',
  completed: 'secondary',
  cancelled: 'outline',
};

export function SprintsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: sprints = [], isLoading } = useSprints(projectId);

  const sorted = [...sprints].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <HelpOverlay id="sprints-intro" title={t('sprints.helpTitle')}>
        <p className="mb-2">
          {t('sprints.helpBody1')}
        </p>
        <p>
          {t('sprints.helpBody2')}
        </p>
      </HelpOverlay>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('sprints.title')}</h2>
        <CreateSprintDialog projectId={projectId} />
      </div>

      {sorted.length === 0 && (
        <p className="py-12 text-center text-gray-400">
          {t('sprints.noSprintsYet')}
        </p>
      )}

      <div className="space-y-3">
        {sorted.map((sprint) => (
          <Link
            key={sprint.id}
            to="/p/$projectId/sprints/$sprintId"
            params={{ projectId, sprintId: sprint.id }}
            className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-gray-900">{sprint.name}</h3>
                <Badge variant={statusColors[sprint.status]}>
                  {t(`sprintStatus.${sprint.status}`)}
                </Badge>
              </div>
              {sprint.velocity != null && (
                <span className="text-sm text-gray-500">{t('sprints.pts', { count: sprint.velocity })}</span>
              )}
            </div>
            {sprint.goal && (
              <p className="mt-1 text-sm text-gray-500">{sprint.goal}</p>
            )}
            {(sprint.startDate || sprint.endDate) && (
              <p className="mt-1 text-xs text-gray-400">
                {sprint.startDate ? new Date(sprint.startDate).toLocaleDateString() : '?'}
                {' — '}
                {sprint.endDate ? new Date(sprint.endDate).toLocaleDateString() : '?'}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
