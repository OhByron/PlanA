import { useMemo, useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { Button, Badge, Input, Select } from '@projecta/ui';
import type { WorkItem } from '@projecta/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSprints, useSprintItems, useRemoveSprintItem, useUpdateSprint, useAddSprintItem } from '../../hooks/use-sprints';
import { useWorkItems } from '../../hooks/use-work-items';
import { api } from '../../lib/api-client';
import { TypeIcon } from '../../components/type-icon';
import { PriorityIndicator } from '../../components/priority-indicator';
import { StatusBadge } from '../../components/status-badge';

const statusColors: Record<string, 'success' | 'default' | 'secondary' | 'outline'> = {
  active: 'success',
  planned: 'default',
  completed: 'secondary',
  cancelled: 'outline',
};

export function SprintDetailPage() {
  const { projectId, sprintId } = useParams({ strict: false }) as {
    projectId: string;
    sprintId: string;
  };

  const { data: sprints = [] } = useSprints(projectId);
  const sprint = sprints.find((s) => s.id === sprintId);
  const { data: sprintItems = [], isLoading } = useSprintItems(sprintId);
  const { data: allItems = [] } = useWorkItems(projectId);
  const removeItem = useRemoveSprintItem();
  const addItem = useAddSprintItem();
  const updateSprint = useUpdateSprint(projectId);

  const [showPicker, setShowPicker] = useState(false);

  // IDs assigned to ANY sprint in this project
  const { data: assignedIds = [] } = useQuery({
    queryKey: ['sprint-assigned', projectId],
    queryFn: () => api.get<string[]>(`/projects/${projectId}/sprint-assigned`),
    staleTime: 15_000,
  });
  const assignedSet = useMemo(() => new Set(assignedIds), [assignedIds]);

  // Stories available to add (not in any sprint, not done/cancelled)
  const availableStories = useMemo(
    () => allItems.filter(
      (i) => i.type === 'story' && !assignedSet.has(i.id) && i.status !== 'done' && i.status !== 'cancelled',
    ),
    [allItems, assignedSet],
  );

  // Group sprint items: stories with their child tasks nested
  const { stories, standaloneTasks } = useMemo(() => {
    const stories: (WorkItem & { children: WorkItem[] })[] = [];
    const taskParentIds = new Set<string>();

    // Find stories in sprint
    for (const item of sprintItems) {
      if (item.type === 'story') {
        const children = sprintItems.filter((i) => i.parentId === item.id);
        stories.push({ ...item, children });
        for (const c of children) taskParentIds.add(c.id);
      }
    }

    // Tasks without a parent story in the sprint
    const standaloneTasks = sprintItems.filter(
      (i) => i.type !== 'story' && !taskParentIds.has(i.id) && !stories.some((s) => s.id === i.parentId),
    );

    return { stories, standaloneTasks };
  }, [sprintItems]);

  // Calculate total points (from tasks, or story points for stories without tasks)
  const totalPoints = useMemo(() => {
    let sum = 0;
    for (const s of stories) {
      if (s.children.length > 0) {
        sum += s.children.reduce((acc, c) => acc + (c.storyPoints ?? 0), 0);
      } else {
        sum += s.storyPoints ?? 0;
      }
    }
    for (const t of standaloneTasks) {
      sum += t.storyPoints ?? 0;
    }
    return sum;
  }, [stories, standaloneTasks]);

  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);

  const handleAddStory = async (storyId: string) => {
    setAdding(storyId);
    try {
      // Add story + all child tasks in sequence
      await api.post(`/sprints/${sprintId}/items/${storyId}`, {});
      const children = allItems.filter((i) => i.parentId === storyId);
      for (const child of children) {
        try { await api.post(`/sprints/${sprintId}/items/${child.id}`, {}); } catch { /* already added */ }
      }
      // Invalidate everything at once
      qc.invalidateQueries({ queryKey: ['sprint-items', sprintId] });
      qc.invalidateQueries({ queryKey: ['sprint-assigned', projectId] });
    } finally {
      setAdding(null);
    }
  };

  const handleRemoveStory = async (storyId: string) => {
    // Remove children first, then the story
    const children = sprintItems.filter((i) => i.parentId === storyId);
    for (const child of children) {
      try { await api.delete(`/sprints/${sprintId}/items/${child.id}`); } catch { /* already removed */ }
    }
    await api.delete(`/sprints/${sprintId}/items/${storyId}`);
    qc.invalidateQueries({ queryKey: ['sprint-items', sprintId] });
    qc.invalidateQueries({ queryKey: ['sprint-assigned', projectId] });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <Link
        to="/p/$projectId/sprints"
        params={{ projectId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to sprints
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{sprint?.name ?? 'Sprint'}</h1>
            {sprint && (
              <Badge variant={statusColors[sprint.status] ?? 'secondary'}>
                {sprint.status.charAt(0).toUpperCase() + sprint.status.slice(1)}
              </Badge>
            )}
          </div>
          {sprint?.goal && <p className="mt-1 text-sm text-gray-500">{sprint.goal}</p>}
          <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
            {sprint?.startDate && <span>Start: {new Date(sprint.startDate).toLocaleDateString()}</span>}
            {sprint?.endDate && <span>End: {new Date(sprint.endDate).toLocaleDateString()}</span>}
            <span>{totalPoints} story points</span>
            <span>{stories.length} stories, {sprintItems.length} total items</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPicker(!showPicker)}>
            {showPicker ? 'Done' : '+ Add Stories'}
          </Button>
          {sprint?.status === 'planned' && (
            <Button
              size="sm"
              onClick={() => updateSprint.mutate({ sprintId, data: { status: 'active' } })}
            >
              Start Sprint
            </Button>
          )}
          {sprint?.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Calculate velocity from done items' points
                const donePoints = sprintItems
                  .filter((i) => i.status === 'done')
                  .reduce((s, i) => s + (i.storyPoints ?? 0), 0);
                updateSprint.mutate({ sprintId, data: { status: 'completed', velocity: donePoints } });
              }}
            >
              Complete Sprint
            </Button>
          )}
        </div>
      </div>

      {/* Story picker */}
      {showPicker && (
        <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50/30 p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">
            Add stories to sprint ({availableStories.length} available)
          </h3>
          {availableStories.length === 0 && (
            <p className="text-sm text-gray-400">All stories are already in a sprint or completed.</p>
          )}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {availableStories.map((story) => {
              const children = allItems.filter((i) => i.parentId === story.id);
              const taskPoints = children.length > 0
                ? children.reduce((s, c) => s + (c.storyPoints ?? 0), 0)
                : story.storyPoints ?? 0;
              return (
                <div key={story.id} className="flex items-center gap-3 rounded border border-gray-200 bg-white px-3 py-2">
                  <TypeIcon type={story.type} />
                  <span className="flex-1 truncate text-sm text-gray-900">{story.title}</span>
                  <PriorityIndicator priority={story.priority} />
                  <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    {taskPoints || '—'}
                  </span>
                  {children.length > 0 && (
                    <span className="text-[10px] text-gray-400">{children.length} tasks</span>
                  )}
                  <Button
                    size="xs"
                    onClick={() => handleAddStory(story.id)}
                    disabled={adding !== null}
                  >
                    {adding === story.id ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sprint contents */}
      {stories.length === 0 && standaloneTasks.length === 0 && !showPicker && (
        <p className="py-12 text-center text-gray-400">
          No items in this sprint yet. Click "+ Add Stories" to pull from the backlog.
        </p>
      )}

      <div className="space-y-4">
        {stories.map((story) => {
          const taskPoints = story.children.length > 0
            ? story.children.reduce((s, c) => s + (c.storyPoints ?? 0), 0)
            : story.storyPoints ?? 0;
          return (
            <div key={story.id} className="rounded-lg border border-gray-200 bg-white">
              {/* Story row */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <TypeIcon type={story.type} />
                <Link
                  to="/p/$projectId/items/$workItemId"
                  params={{ projectId, workItemId: story.id }}
                  className="flex-1 truncate text-sm font-medium text-gray-900 hover:text-brand-700"
                >
                  {story.title}
                </Link>
                <StatusBadge status={story.status} />
                <PriorityIndicator priority={story.priority} />
                <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  {taskPoints || '—'}
                </span>
                <button
                  onClick={() => handleRemoveStory(story.id)}
                  className="text-gray-400 hover:text-red-500"
                  title="Remove story and tasks from sprint"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Child tasks */}
              {story.children.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  {story.children.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-1.5 pl-10">
                      <TypeIcon type={task.type} />
                      <Link
                        to="/p/$projectId/items/$workItemId"
                        params={{ projectId, workItemId: task.id }}
                        className="flex-1 truncate text-sm text-gray-700 hover:text-brand-700"
                      >
                        {task.title}
                      </Link>
                      <StatusBadge status={task.status} />
                      <span className="w-8 text-center text-xs text-gray-500">
                        {task.storyPoints ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Standalone tasks (not under a story) */}
        {standaloneTasks.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold text-gray-400 uppercase">Standalone Tasks</h3>
            {standaloneTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 mb-2">
                <TypeIcon type={task.type} />
                <Link
                  to="/p/$projectId/items/$workItemId"
                  params={{ projectId, workItemId: task.id }}
                  className="flex-1 truncate text-sm font-medium text-gray-900 hover:text-brand-700"
                >
                  {task.title}
                </Link>
                <StatusBadge status={task.status} />
                <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  {task.storyPoints ?? '—'}
                </span>
                <button
                  onClick={() => removeItem.mutate({ sprintId, workItemId: task.id })}
                  className="text-gray-400 hover:text-red-500"
                  title="Remove from sprint"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
