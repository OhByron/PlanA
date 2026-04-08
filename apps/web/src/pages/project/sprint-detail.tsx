import { useMemo, useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { Button, Badge, Input, Select } from '@projecta/ui';
import type { WorkItem } from '@projecta/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSprints, useSprintItems, useRemoveSprintItem, useUpdateSprint, useAddSprintItem } from '../../hooks/use-sprints';
import { useWorkItems } from '../../hooks/use-work-items';
import { useProjectMembers } from '../../hooks/use-project-members';
import { api } from '../../lib/api-client';
import { TypeIcon } from '../../components/type-icon';
import { PriorityIndicator } from '../../components/priority-indicator';
import { StatusBadge } from '../../components/status-badge';
import { useAIAvailable } from '../../hooks/use-ai-available';
import { AINotConfigured } from '../../components/ai-not-configured';

const statusColors: Record<string, 'success' | 'default' | 'secondary' | 'outline'> = {
  active: 'success',
  planned: 'default',
  completed: 'secondary',
  cancelled: 'outline',
};

export function SprintDetailPage() {
  const { t } = useTranslation();
  const { projectId, sprintId } = useParams({ strict: false }) as {
    projectId: string;
    sprintId: string;
  };

  const { data: sprints = [] } = useSprints(projectId);
  const sprint = sprints.find((s) => s.id === sprintId);
  const { data: sprintItems = [], isLoading } = useSprintItems(sprintId);
  const { data: allItems = [] } = useWorkItems(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const removeItem = useRemoveSprintItem();

  const totalCapacity = useMemo(
    () => members.reduce((s, m) => s + (m.capacity ?? 0), 0),
    [members],
  );
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
      (i) => i.type === 'story' && !assignedSet.has(i.id) && !i.stateIsTerminal && !i.isCancelled,
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

  const [editName, setEditName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editGoal, setEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [aiGoalLoading, setAiGoalLoading] = useState(false);
  const { guardAI, showNotConfigured, dismissNotConfigured } = useAIAvailable(projectId);

  const generateGoal = async () => {
    if (!sprint || sprintItems.length === 0) return;
    setAiGoalLoading(true);
    try {
      const result = await api.post<{ goal: string }>(`/projects/${projectId}/ai/suggest-inline`, {
        type: 'sprint_goal',
        sprint_name: sprint.name,
        item_titles: sprintItems.map((i) => i.title),
      });
      setGoalDraft(result.goal);
      setEditGoal(true);
    } catch {
      // AI not configured or failed - silently ignore
    } finally {
      setAiGoalLoading(false);
    }
  };

  const patchSprint = (data: Record<string, unknown>) => {
    updateSprint.mutate({ sprintId, data });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
      <AINotConfigured show={showNotConfigured} onDismiss={dismissNotConfigured} />
      {/* Header */}
      <button
        onClick={() => window.history.back()}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('common.back')}
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{sprint?.name ?? 'Sprint'}</h1>
            {sprint && (
              <Badge variant={statusColors[sprint.status] ?? 'secondary'}>
                {t(`sprintStatus.${sprint.status}`)}
              </Badge>
            )}
          </div>
          {sprint?.goal && <p className="mt-1 text-sm text-gray-500">{sprint.goal}</p>}
          <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
            {sprint?.startDate && <span>{t('sprintDetail.start')} {new Date(sprint.startDate).toLocaleDateString()}</span>}
            {sprint?.endDate && <span>{t('sprintDetail.end')} {new Date(sprint.endDate).toLocaleDateString()}</span>}
            {totalCapacity > 0 ? (
              <span className={totalPoints > totalCapacity ? 'text-red-500 font-medium' : ''}>
                {t('sprintDetail.capacity', { points: totalPoints, capacity: totalCapacity })}
              </span>
            ) : (
              <span>{t('sprintDetail.storyPoints', { count: totalPoints })}</span>
            )}
            <span>{t('sprintDetail.storiesAndItems', { stories: stories.length, items: sprintItems.length })}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPicker(!showPicker)}>
            {showPicker ? t('sprintDetail.done') : t('sprintDetail.addStories')}
          </Button>
          {sprint?.status === 'planned' && (
            <Button
              size="sm"
              onClick={() => updateSprint.mutate({ sprintId, data: { status: 'active' } })}
            >
              {t('sprintDetail.startSprint')}
            </Button>
          )}
          {sprint?.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Calculate velocity from done items' points
                const donePoints = sprintItems
                  .filter((i) => i.stateIsTerminal)
                  .reduce((s, i) => s + (i.storyPoints ?? 0), 0);
                updateSprint.mutate({ sprintId, data: { status: 'completed', velocity: donePoints } });
              }}
            >
              {t('sprintDetail.completeSprint')}
            </Button>
          )}
        </div>
      </div>

      {/* Story picker */}
      {showPicker && (
        <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50/30 p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-900">
            {t('sprintDetail.addStoriesToSprint', { count: availableStories.length })}
          </h3>
          {availableStories.length === 0 && (
            <p className="text-sm text-gray-400">{t('sprintDetail.allStoriesAssigned')}</p>
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
                    <span className="text-[10px] text-gray-400">{t('sprintDetail.tasks', { count: children.length })}</span>
                  )}
                  <Button
                    size="xs"
                    onClick={() => handleAddStory(story.id)}
                    disabled={adding !== null}
                  >
                    {adding === story.id ? t('sprintDetail.adding') : t('common.add')}
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
          {t('sprintDetail.noItemsYet')}
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
                <StatusBadge stateName={story.stateName} stateSlug={story.stateSlug} stateColor={story.stateColor} isCancelled={story.isCancelled} />
                <PriorityIndicator priority={story.priority} />
                <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  {taskPoints || '—'}
                </span>
                <button
                  onClick={() => handleRemoveStory(story.id)}
                  className="text-gray-400 hover:text-red-500"
                  title={t('sprintDetail.removeStoryAndTasks')}
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
                      <StatusBadge stateName={task.stateName} stateSlug={task.stateSlug} stateColor={task.stateColor} isCancelled={task.isCancelled} />
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
            <h3 className="mb-2 text-xs font-semibold text-gray-400 uppercase">{t('sprintDetail.standaloneTasks')}</h3>
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
                <StatusBadge stateName={task.stateName} stateSlug={task.stateSlug} stateColor={task.stateColor} isCancelled={task.isCancelled} />
                <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  {task.storyPoints ?? '—'}
                </span>
                <button
                  onClick={() => removeItem.mutate({ sprintId, workItemId: task.id })}
                  className="text-gray-400 hover:text-red-500"
                  title={t('sprintDetail.removeFromSprint')}
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

      {/* Sidebar — editable sprint properties */}
      {sprint && (
        <aside className="w-64 shrink-0 border-l border-gray-200 bg-white p-4 overflow-y-auto">
          <h2 className="mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('sprintDetail.properties')}
          </h2>

          {/* Name */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('sprintDetail.nameLabel')}</label>
            {editName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  if (nameDraft.trim() && nameDraft !== sprint.name) patchSprint({ name: nameDraft.trim() });
                  setEditName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (nameDraft.trim() && nameDraft !== sprint.name) patchSprint({ name: nameDraft.trim() }); setEditName(false); }
                  if (e.key === 'Escape') setEditName(false);
                }}
              />
            ) : (
              <p
                className="cursor-pointer rounded border border-transparent px-2 py-1 text-sm text-gray-900 hover:border-gray-200"
                onClick={() => { setNameDraft(sprint.name); setEditName(true); }}
              >
                {sprint.name}
              </p>
            )}
          </div>

          {/* Goal */}
          <div className="mb-4">
            <div className="mb-1 flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">{t('sprintDetail.goalLabel')}</label>
              {sprintItems.length > 0 && (
                <button
                  onClick={() => guardAI(generateGoal)}
                  disabled={aiGoalLoading}
                  className="rounded bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50 transition-colors"
                >
                  {aiGoalLoading ? (t('common.generating') ?? 'Generating...') : (t('sprintDetail.generateGoal') ?? 'Generate with AI')}
                </button>
              )}
            </div>
            {editGoal ? (
              <div className="space-y-1">
                <Input
                  autoFocus
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { patchSprint({ goal: goalDraft.trim() || null }); setEditGoal(false); }
                    if (e.key === 'Escape') setEditGoal(false);
                  }}
                />
                <div className="flex gap-1">
                  <Button size="xs" onClick={() => { patchSprint({ goal: goalDraft.trim() || null }); setEditGoal(false); }}>{t('common.save')}</Button>
                  <Button size="xs" variant="ghost" onClick={() => setEditGoal(false)}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : (
              <p
                className="cursor-pointer rounded border border-transparent px-2 py-1 text-sm text-gray-600 hover:border-gray-200"
                onClick={() => { setGoalDraft(sprint.goal ?? ''); setEditGoal(true); }}
              >
                {sprint.goal || <span className="italic text-gray-400">{t('sprintDetail.clickToSetGoal')}</span>}
              </p>
            )}
          </div>

          {/* Status */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('sprintDetail.statusLabel')}</label>
            <Select
              value={sprint.status}
              onChange={(e) => patchSprint({ status: e.target.value })}
            >
              <option value="planned">{t('sprintStatus.planned')}</option>
              <option value="active">{t('sprintStatus.active')}</option>
              <option value="completed">{t('sprintStatus.completed')}</option>
              <option value="cancelled">{t('sprintStatus.cancelled')}</option>
            </Select>
          </div>

          {/* Start Date */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('sprintDetail.startDateLabel')}</label>
            <Input
              type="date"
              value={sprint.startDate ? new Date(sprint.startDate).toISOString().slice(0, 10) : ''}
              onChange={(e) => patchSprint({ start_date: e.target.value || null })}
            />
          </div>

          {/* End Date */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('sprintDetail.endDateLabel')}</label>
            <Input
              type="date"
              value={sprint.endDate ? new Date(sprint.endDate).toISOString().slice(0, 10) : ''}
              onChange={(e) => patchSprint({ end_date: e.target.value || null })}
            />
          </div>

          {/* Velocity (for completed sprints) */}
          {sprint.status === 'completed' && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('sprintDetail.velocityLabel')}</label>
              <Input
                type="number"
                min={0}
                value={sprint.velocity ?? ''}
                onChange={(e) => patchSprint({ velocity: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          )}

          {/* Summary stats */}
          <div className="mt-6 border-t border-gray-100 pt-4 space-y-2 text-xs text-gray-400">
            <p>{t('sprintDetail.totalItemCount', { count: sprintItems.length })}</p>
            <p>{t('sprintDetail.totalPointsLabel', { count: totalPoints })}</p>
            {sprint.velocity != null && (
              <p>{t('sprintDetail.velocityStat', { velocity: sprint.velocity })}</p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
