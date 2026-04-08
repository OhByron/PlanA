import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { WorkItem } from '@projecta/types';
import { useMyWorkItems } from '../hooks/use-my-work-items';
import { useAuth } from '../auth/auth-context';
import { TypeIcon } from '../components/type-icon';
import { PriorityIndicator } from '../components/priority-indicator';
import { StatusBadge } from '../components/status-badge';
import { api } from '../lib/api-client';
import { toProject } from '../lib/api-transforms';

export function MyWorkPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: items = [], isLoading } = useMyWorkItems();

  // Fetch project names for all unique project IDs in a single query
  const projectIds = useMemo(() => [...new Set(items.map((i) => i.projectId))], [items]);
  const { data: projectNameMap = new Map<string, string>() } = useQuery({
    queryKey: ['my-work-project-names', projectIds.join(',')],
    queryFn: async () => {
      const map = new Map<string, string>();
      for (const pid of projectIds) {
        try {
          const raw = await api.get<{ name: string }>(`/projects/${pid}`);
          map.set(pid, raw.name);
        } catch {
          // project not accessible — use short ID
        }
      }
      return map;
    },
    enabled: projectIds.length > 0,
    staleTime: 5 * 60_000,
  });
  const projectNames = projectNameMap;

  // Group items by project
  const grouped = useMemo(() => {
    const groups = new Map<string, WorkItem[]>();
    for (const item of items) {
      const existing = groups.get(item.projectId) ?? [];
      existing.push(item);
      groups.set(item.projectId, existing);
    }
    return groups;
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('myWork.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('myWork.itemCount', { count: items.length })}
        </p>
      </div>

      {items.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-gray-400">{t('myWork.noItems')}</p>
          <p className="mt-2 text-sm text-gray-400">
            {t('myWork.noItemsHelp')}
          </p>
        </div>
      )}

      {[...grouped.entries()].map(([projectId, projectItems]) => (
        <div key={projectId} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">
            {projectNames.get(projectId) ?? projectId.slice(0, 8)}
          </h2>
          <div className="space-y-2">
            {projectItems.map((item) => (
              <Link
                key={item.id}
                to="/p/$projectId/items/$workItemId"
                params={{ projectId: item.projectId, workItemId: item.id }}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 transition-colors hover:bg-gray-50"
              >
                <TypeIcon type={item.type} />
                <span className="flex-1 truncate text-sm font-medium text-gray-900">
                  {item.title}
                </span>
                <StatusBadge stateName={item.stateName} stateSlug={item.stateSlug} stateColor={item.stateColor} isCancelled={item.isCancelled} />
                <PriorityIndicator priority={item.priority} />
                {item.storyPoints != null && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    {item.storyPoints}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
