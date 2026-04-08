import { useParams, Link } from '@tanstack/react-router';
import { Badge } from '@projecta/ui';
import { useTranslation } from 'react-i18next';
import { useEpics } from '../../hooks/use-epics';
import { useWorkItems } from '../../hooks/use-work-items';
import { PriorityIndicator } from '../../components/priority-indicator';
import { CreateEpicDialog } from '../../components/create-epic-dialog';
import { HelpOverlay } from '../../components/help-overlay';

const statusColors: Record<string, 'success' | 'default' | 'secondary' | 'outline' | 'warning'> = {
  open: 'default',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'secondary',
};

export function EpicsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: epics = [], isLoading } = useEpics(projectId);
  const { data: allItems = [] } = useWorkItems(projectId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <HelpOverlay id="epics-intro" title={t('epics.helpTitle')}>
        <p className="mb-2">
          {t('epics.helpBody1')}
        </p>
        <p>
          {t('epics.helpBody2')}
        </p>
      </HelpOverlay>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('epics.title')}</h2>
        <CreateEpicDialog projectId={projectId} />
      </div>

      {epics.length === 0 && (
        <p className="py-12 text-center text-gray-400">
          {t('epics.noEpicsYet')}
        </p>
      )}

      <div className="space-y-3">
        {epics.map((epic) => {
          const storyCount = allItems.filter((i) => i.epicId === epic.id).length;
          const doneCount = allItems.filter((i) => i.epicId === epic.id && i.stateIsTerminal).length;

          return (
            <Link
              key={epic.id}
              to="/p/$projectId/epics/$epicId"
              params={{ projectId, epicId: epic.id }}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-gray-900">{epic.title}</h3>
                  <Badge variant={statusColors[epic.status] ?? 'secondary'}>
                    {t(`status.${epic.status}`, epic.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}
                  </Badge>
                  <PriorityIndicator priority={epic.priority} />
                </div>
                <span className="text-sm text-gray-500">
                  {t('epics.storyProgress', { done: doneCount, total: storyCount })}
                </span>
              </div>
              {epic.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{epic.description}</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
