import { useParams, Link } from '@tanstack/react-router';
import { Badge } from '@projecta/ui';
import { useEpics } from '../../hooks/use-epics';
import { useWorkItems } from '../../hooks/use-work-items';
import { PriorityIndicator } from '../../components/priority-indicator';
import { CreateEpicDialog } from '../../components/create-epic-dialog';

const statusColors: Record<string, 'success' | 'default' | 'secondary' | 'outline' | 'warning'> = {
  open: 'default',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'secondary',
};

export function EpicsPage() {
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Epics</h2>
        <CreateEpicDialog projectId={projectId} />
      </div>

      {epics.length === 0 && (
        <p className="py-12 text-center text-gray-400">
          No epics yet. Epics group related stories into feature-level deliverables.
        </p>
      )}

      <div className="space-y-3">
        {epics.map((epic) => {
          const storyCount = allItems.filter((i) => i.epicId === epic.id).length;
          const doneCount = allItems.filter((i) => i.epicId === epic.id && i.status === 'done').length;

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
                    {epic.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                  <PriorityIndicator priority={epic.priority} />
                </div>
                <span className="text-sm text-gray-500">
                  {doneCount}/{storyCount} stories
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
