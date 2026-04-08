import { useTranslation } from 'react-i18next';
import { Avatar } from '@projecta/ui';
import type { ActivityEntry } from '../hooks/use-activity';

interface ActivityFeedProps {
  entries: ActivityEntry[];
  loading?: boolean | undefined;
}

export function ActivityFeed({ entries, loading }: ActivityFeedProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        {t('activity.noActivity') ?? 'No activity yet.'}
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3 py-3 border-b border-gray-100 last:border-b-0">
          {/* Timeline dot */}
          <div className="flex flex-col items-center pt-1">
            <Avatar name={entry.actorName || '?'} size="xs" />
            {i < entries.length - 1 && (
              <div className="mt-1 flex-1 w-px bg-gray-200" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1 text-sm">
              <span className="font-medium text-gray-900">{entry.actorName}</span>
              <span className="text-gray-500">{describeEvent(entry)}</span>
            </div>
            {renderChanges(entry)}
            <time className="text-[10px] text-gray-400 mt-0.5 block">
              {formatRelative(entry.createdAt)}
            </time>
          </div>
        </div>
      ))}
    </div>
  );
}

function describeEvent(entry: ActivityEntry): string {
  const changes = entry.changes;
  switch (entry.eventType) {
    case 'work_item.created':
      return `created ${(changes.title as string) ?? 'item'}`;
    case 'work_item.updated':
      if (changes.state) return `moved to ${(changes.state as Record<string, unknown>)?.name ?? ''}`;
      if (changes.assignee) return 'changed assignment';
      if (changes.priority) return `changed priority to ${(changes.priority as Record<string, unknown>)?.new ?? ''}`;
      if (changes.is_cancelled) return (changes.is_cancelled as Record<string, unknown>)?.new ? 'cancelled item' : 'restored item';
      return 'updated item';
    case 'work_item.deleted':
      return 'deleted item';
    case 'comment.created':
      return `commented on ${(changes.work_item_title as string) ?? 'item'}`;
    case 'sprint_item.added':
      return 'added to sprint';
    case 'sprint_item.removed':
      return 'removed from sprint';
    case 'sprint.updated':
      return 'updated sprint';
    default:
      return entry.eventType;
  }
}

function renderChanges(entry: ActivityEntry): React.ReactNode {
  const changes = entry.changes;

  if (entry.eventType === 'work_item.updated' && changes.story_points) {
    const pts = changes.story_points as Record<string, unknown>;
    return (
      <p className="text-xs text-gray-500 mt-0.5">
        Story points: {String(pts.new)}
      </p>
    );
  }

  return null;
}

function formatRelative(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
