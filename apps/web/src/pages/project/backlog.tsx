import { useMemo, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Select } from '@projecta/ui';
import type { WorkItemStatus, WorkItemType } from '@projecta/types';
import { useWorkItems } from '../../hooks/use-work-items';
import { WorkItemRow } from '../../components/work-item-row';
import { QuickCreateWorkItem } from '../../components/quick-create-work-item';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'story', label: 'Stories' },
  { value: 'bug', label: 'Bugs' },
  { value: 'task', label: 'Tasks' },
];

export function BacklogPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filters: Record<string, string> = {};
  if (statusFilter) filters.status = statusFilter;
  if (typeFilter) filters.type = typeFilter;

  const { data: items = [], isLoading } = useWorkItems(projectId, Object.keys(filters).length > 0 ? filters : undefined);

  // Client-side filter when no server filter is applied (to avoid extra queries)
  const filtered = items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (typeFilter && item.type !== typeFilter) return false;
    return true;
  });

  // Sort by order_index then created_at
  const sorted = [...filtered].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt));

  // Calculate story points from child tasks for stories
  const calculatedPointsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.type === 'story') {
        const children = items.filter((i) => i.parentId === item.id);
        if (children.length > 0) {
          map.set(item.id, children.reduce((s, c) => s + (c.storyPoints ?? 0), 0));
        }
      }
    }
    return map;
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
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-32"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <span className="text-sm text-gray-500">
            {sorted.length} item{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          + New Item
        </Button>
      </div>

      {/* Quick create */}
      {showCreate && (
        <div className="mb-4">
          <QuickCreateWorkItem projectId={projectId} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* Item list */}
      <div className="space-y-2">
        {sorted.map((item) => (
          <WorkItemRow
            key={item.id}
            item={item}
            projectId={projectId}
            calculatedPoints={calculatedPointsMap.get(item.id)}
          />
        ))}

        {sorted.length === 0 && (
          <p className="py-12 text-center text-gray-400">
            No items match your filters. Try adjusting or create a new item.
          </p>
        )}
      </div>
    </div>
  );
}
