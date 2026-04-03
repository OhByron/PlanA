import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { Button, Input, Textarea, Select, Badge, cn } from '@projecta/ui';
import { useTranslation } from 'react-i18next';
import type { Priority, WorkItemType } from '@projecta/types';
import { useEpic, useUpdateEpic } from '../../hooks/use-epics';
import { useWorkItems, useCreateWorkItem, useUpdateWorkItem } from '../../hooks/use-work-items';
import { useCreateAcceptanceCriterion } from '../../hooks/use-acceptance-criteria';
import { api } from '../../lib/api-client';
import { useProjectMembers } from '../../hooks/use-project-members';
import { TypeIcon } from '../../components/type-icon';
import { StatusBadge } from '../../components/status-badge';
import { PriorityIndicator } from '../../components/priority-indicator';
import { ContextHelp } from '../../components/context-help';

const STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

export function EpicDetailPage() {
  const { t } = useTranslation();
  const { projectId, epicId } = useParams({ strict: false }) as {
    projectId: string;
    epicId: string;
  };

  const { data: epic, isLoading } = useEpic(projectId, epicId);
  const updateEpic = useUpdateEpic(projectId);
  const { data: allItems = [] } = useWorkItems(projectId);
  const epicItems = allItems.filter((i) => i.epicId === epicId);
  // Top-level items: stories/bugs/tasks that don't have a parent within the epic
  const topLevelEpicItems = epicItems.filter(
    (item) => !item.parentId || !epicItems.some((ei) => ei.id === item.parentId),
  );
  const { data: members = [] } = useProjectMembers(projectId);
  const createItem = useCreateWorkItem(projectId);

  const updateItem = useUpdateWorkItem(projectId);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [showAddStory, setShowAddStory] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Items eligible to be added to this epic (not already in it, top-level only)
  const availableItems = useMemo(
    () => allItems.filter((i) => i.epicId !== epicId && !i.parentId),
    [allItems, epicId],
  );

  const filteredAvailable = useMemo(() => {
    if (!searchQuery.trim()) return availableItems.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return availableItems
      .filter((i) => i.title.toLowerCase().includes(q) || i.type.includes(q))
      .slice(0, 20);
  }, [availableItems, searchQuery]);

  useEffect(() => {
    if (showAddExisting) {
      setSearchQuery('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [showAddExisting]);

  if (isLoading || !epic) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const patch = (data: Record<string, unknown>) => {
    updateEpic.mutate({ epicId, data });
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        {/* Back */}
        <Link
          to="/p/$projectId/epics"
          params={{ projectId }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('epicDetail.backToEpics')}
        </Link>

        {/* Title */}
        <div className="mb-4">
          {(epic as unknown as { itemNumber?: number | null }).itemNumber != null && (
            <span className="text-sm text-gray-400 mr-2">#{(epic as unknown as { itemNumber: number }).itemNumber}</span>
          )}
          {editingTitle ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft !== epic.title) patch({ title: titleDraft.trim() });
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { if (titleDraft.trim() && titleDraft !== epic.title) patch({ title: titleDraft.trim() }); setEditingTitle(false); }
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="text-xl font-semibold"
            />
          ) : (
            <h1
              className="cursor-pointer text-xl font-semibold text-gray-900 hover:text-brand-700"
              onClick={() => { setTitleDraft(epic.title); setEditingTitle(true); }}
            >
              {epic.title}
            </h1>
          )}
        </div>

        {/* Description */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('epicDetail.description')}</h2>
          {editingDesc ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                rows={4}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder={t('epicDetail.descPlaceholder')}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { patch({ description: descDraft }); setEditingDesc(false); }}>{t('common.save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : (
            <div
              className="cursor-pointer rounded-md border border-transparent p-2 text-sm text-gray-600 hover:border-gray-200 hover:bg-gray-50"
              onClick={() => { setDescDraft(epic.description ?? ''); setEditingDesc(true); }}
            >
              {epic.description
                ? epic.description.split('\n').map((line, i) => <p key={i} className={line ? '' : 'h-4'}>{line}</p>)
                : <span className="italic text-gray-400">{t('epicDetail.clickToAddDescription')}</span>}
            </div>
          )}
        </section>

        {/* Stories in this epic */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {t('epicDetail.stories', { count: topLevelEpicItems.length })}
              </h2>
              <ContextHelp>
                {t('epicDetail.storiesContextHelp')}
              </ContextHelp>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowAddStory(true)} disabled={showAddStory}>
                {t('epicDetail.addStory')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddExisting(!showAddExisting)}
              >
                {t('epicDetail.addExisting')}
              </Button>
            </div>
          </div>

          {showAddExisting && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  ref={searchRef}
                  placeholder={t('epicDetail.searchExisting')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                <button
                  onClick={() => setShowAddExisting(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={t('common.close')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {filteredAvailable.length === 0 ? (
                <p className="py-3 text-center text-xs text-gray-400">{t('epicDetail.noItemsFound')}</p>
              ) : (
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {filteredAvailable.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        updateItem.mutate(
                          { workItemId: item.id, data: { epicId } },
                          {
                            onSuccess: () => {
                              // Also move child tasks into the same epic
                              const children = allItems.filter((i) => i.parentId === item.id);
                              for (const child of children) {
                                updateItem.mutate({ workItemId: child.id, data: { epicId } });
                              }
                            },
                          },
                        );
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-50"
                    >
                      <TypeIcon type={item.type} />
                      <span className="flex-1 truncate text-sm text-gray-900">{item.title}</span>
                      <StatusBadge status={item.status} />
                      {item.storyPoints != null && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          {item.storyPoints}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-brand-600">{t('epicDetail.addToEpic')}</span>
                    </button>
                  ))}
                </div>
              )}
              {availableItems.length > 20 && !searchQuery && (
                <p className="mt-2 text-center text-[10px] text-gray-400">
                  {t('epicDetail.typeToSearch', { count: availableItems.length })}
                </p>
              )}
            </div>
          )}

          {showAddStory && (
            <AddStoryForm
              projectId={projectId}
              epicId={epicId}
              epicTitle={epic.title}
              epicDescription={epic.description ?? ''}
              members={members}
              onDone={() => setShowAddStory(false)}
            />
          )}

          {topLevelEpicItems.length === 0 && !showAddStory && (
            <p className="text-sm text-gray-400">{t('epicDetail.noStoriesYet')}</p>
          )}

          <div className="space-y-0.5">
            {(() => {
              // Recursively render the full tree
              const rows: React.ReactNode[] = [];
              const childrenOf = new Map<string, typeof epicItems>();
              for (const item of epicItems) {
                if (item.parentId) {
                  const siblings = childrenOf.get(item.parentId) ?? [];
                  siblings.push(item);
                  childrenOf.set(item.parentId, siblings);
                }
              }

              function renderTree(item: typeof epicItems[0], depth: number) {
                const assignee = members.find((m) => m.id === item.assigneeId);
                const children = childrenOf.get(item.id) ?? [];
                const doneChildren = children.filter((c) => c.status === 'done' || c.status === 'cancelled').length;
                // Collect all descendants for removal
                const allDescendants: string[] = [];
                function collectDescendants(id: string) {
                  for (const c of childrenOf.get(id) ?? []) {
                    allDescendants.push(c.id);
                    collectDescendants(c.id);
                  }
                }
                collectDescendants(item.id);

                rows.push(
                  <EpicItemRow
                    key={item.id}
                    item={item}
                    projectId={projectId}
                    assignee={assignee}
                    childInfo={children.length > 0 ? `${doneChildren}/${children.length} subtasks` : undefined}
                    depth={depth}
                    onRemove={depth === 0 ? () => {
                      updateItem.mutate({ workItemId: item.id, data: { epicId: '' } });
                      for (const descId of allDescendants) {
                        updateItem.mutate({ workItemId: descId, data: { epicId: '' } });
                      }
                    } : undefined}
                    removeLabel={t('common.remove')}
                  />,
                );
                for (const child of children) {
                  renderTree(child, depth + 1);
                }
              }

              for (const item of topLevelEpicItems) {
                renderTree(item, 0);
              }
              return rows;
            })()}
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside className="w-64 border-l border-gray-200 bg-white p-4 overflow-y-auto">
        <h2 className="mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('epicDetail.details')}</h2>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.statusLabel')}</label>
          <Select value={epic.status} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`status.${s}`, s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}</option>
            ))}
          </Select>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.priorityLabel')}</label>
          <Select value={epic.priority} onChange={(e) => patch({ priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{t(`priority.${p}`)}</option>
            ))}
          </Select>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.assigneeLabel')}</label>
          <Select
            value={epic.assigneeId ?? ''}
            onChange={(e) => patch({ assignee_id: e.target.value || null })}
          >
            <option value="">{t('workItemDetail.unassigned')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.jobRole.toUpperCase()})
              </option>
            ))}
          </Select>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.startDateLabel')}</label>
          <Input
            type="date"
            value={epic.startDate ? new Date(epic.startDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => patch({ start_date: e.target.value || null })}
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.dueDateLabel')}</label>
          <Input
            type="date"
            value={epic.dueDate ? new Date(epic.dueDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => patch({ due_date: e.target.value || null })}
          />
          {epic.dueDate && new Date(epic.dueDate) < new Date() && epic.status !== 'done' && epic.status !== 'cancelled' && (
            <p className="mt-1 text-xs font-medium text-red-500">{t('epicDetail.overdue')}</p>
          )}
        </div>

        {/* Progress summary */}
        {topLevelEpicItems.length > 0 && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.progress')}</label>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{epicItems.filter((i) => i.status === 'done' || i.status === 'cancelled').length}/{epicItems.length} {t('epicDetail.itemsDone')}</span>
                <span>{epicItems.reduce((s, i) => s + (i.storyPoints ?? 0), 0)} {t('epicDetail.totalPts')}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    epicItems.filter((i) => i.status === 'done' || i.status === 'cancelled').length === epicItems.length
                      ? 'bg-emerald-400'
                      : 'bg-indigo-400',
                  )}
                  style={{
                    width: epicItems.length > 0
                      ? `${(epicItems.filter((i) => i.status === 'done' || i.status === 'cancelled').length / epicItems.length) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4 space-y-2 text-xs text-gray-400">
          <p>{t('workItemDetail.created', { date: new Date(epic.createdAt).toLocaleDateString() })}</p>
          <p>{t('workItemDetail.updated', { date: new Date(epic.updatedAt).toLocaleDateString() })}</p>
        </div>
      </aside>
    </div>
  );
}

// --- Epic item row (story or task) ---

function EpicItemRow({
  item,
  projectId,
  assignee,
  childInfo,
  depth = 0,
  onRemove,
  removeLabel,
}: {
  item: import('@projecta/types').WorkItem;
  projectId: string;
  assignee: { name: string } | undefined;
  childInfo: string | undefined;
  depth: number | undefined;
  onRemove: (() => void) | undefined;
  removeLabel: string | undefined;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 hover:bg-gray-50"
      style={depth > 0 ? { marginLeft: `${depth * 1.5}rem`, borderLeft: '2px solid #e5e7eb' } : undefined}
    >
      <Link
        to="/p/$projectId/items/$workItemId"
        params={{ projectId, workItemId: item.id }}
        className="flex flex-1 items-center gap-3 min-w-0"
      >
        <TypeIcon type={item.type} />
        <div className="flex-1 min-w-0">
          <span className="truncate text-sm font-medium text-gray-900 block">{item.title}</span>
          {childInfo && (
            <span className="text-[10px] text-gray-400">{childInfo}</span>
          )}
        </div>
        {assignee && (
          <span className="text-xs text-gray-500 shrink-0">{assignee.name}</span>
        )}
        <StatusBadge status={item.status} />
        <PriorityIndicator priority={item.priority} />
        {item.storyPoints != null && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">{item.storyPoints}</span>
        )}
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="relative z-10 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          {removeLabel}
        </button>
      )}
    </div>
  );
}

// --- Add story form with AC, point guard, and task decomposition ---

import type { ProjectMember } from '../../hooks/use-project-members';
import { useQueryClient } from '@tanstack/react-query';
import { toWorkItem } from '../../lib/api-transforms';

const STORY_PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

interface ACRow { given: string; when: string; then: string }

const TASK_TEMPLATES: { role: string; labelKey: string; titlePrefix: string }[] = [
  { role: 'ux', labelKey: 'epicDetail.uxDesign', titlePrefix: 'UX: Design' },
  { role: 'qe', labelKey: 'epicDetail.qeTesting', titlePrefix: 'QE: Write test cases for' },
  { role: 'bsa', labelKey: 'epicDetail.bsaAnalysis', titlePrefix: 'BSA: Validate requirements for' },
];

function AddStoryForm({
  projectId,
  epicId,
  epicTitle,
  epicDescription,
  members,
  onDone,
}: {
  projectId: string;
  epicId: string;
  epicTitle: string;
  epicDescription: string;
  members: ProjectMember[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [storyPoints, setStoryPoints] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [acRows, setAcRows] = useState<ACRow[]>([{ given: '', when: '', then: '' }]);
  const [createTasks, setCreateTasks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [aiAcLoading, setAiAcLoading] = useState(false);

  const points = storyPoints ? Number(storyPoints) : 0;
  const isLarge = points >= 8;

  const addAcRow = () => setAcRows([...acRows, { given: '', when: '', then: '' }]);
  const updateAcRow = (idx: number, field: keyof ACRow, value: string) => {
    const next = [...acRows];
    next[idx] = { ...next[idx]!, [field]: value };
    setAcRows(next);
  };
  const removeAcRow = (idx: number) => setAcRows(acRows.filter((_, i) => i !== idx));

  const hasExplicitTasks = Object.values(createTasks).some(Boolean);
  // Points always live on tasks, never on the story directly.
  // If the user sets points + assignee but doesn't check any task boxes,
  // we auto-create a single task for the assignee with those points.
  const willAutoCreateTask = !!storyPoints && !!assigneeId && !hasExplicitTasks;

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);

    try {
      // 1. Create the story (never holds points directly)
      const storyData: Record<string, unknown> = {
        type: 'story',
        title: title.trim(),
        epic_id: epicId,
        priority,
      };
      if (description.trim()) storyData.description = { text: description.trim() };
      // Story gets no points — they live on tasks

      const rawStory = await api.post(`/projects/${projectId}/work-items`, storyData);
      const story = toWorkItem(rawStory);

      // 2. Create acceptance criteria
      const validACs = acRows.filter((ac) => ac.given || ac.when || ac.then);
      for (const ac of validACs) {
        await api.post(`/work-items/${story.id}/acceptance-criteria`, {
          given_clause: ac.given,
          when_clause: ac.when,
          then_clause: ac.then,
        });
      }

      // 3. Create child tasks for selected disciplines
      for (const tmpl of TASK_TEMPLATES) {
        if (!createTasks[tmpl.role]) continue;
        const roleMembers = members.filter((m) => m.jobRole === tmpl.role);
        const taskData: Record<string, unknown> = {
          type: 'task',
          title: `${tmpl.titlePrefix} "${title.trim()}"`,
          epic_id: epicId,
          parent_id: story.id,
          priority,
        };
        if (roleMembers.length === 1) {
          taskData.assignee_id = roleMembers[0]!.id;
        }
        await api.post(`/projects/${projectId}/work-items`, taskData);
      }

      // 4. Auto-create a task for the assignee if points were set but no explicit tasks checked
      if (willAutoCreateTask) {
        const assignee = members.find((m) => m.id === assigneeId);
        const roleLabel = assignee?.jobRole?.toUpperCase() ?? 'DEV';
        await api.post(`/projects/${projectId}/work-items`, {
          type: 'task',
          title: `${roleLabel}: ${title.trim()}`,
          epic_id: epicId,
          parent_id: story.id,
          priority,
          story_points: Number(storyPoints),
          assignee_id: assigneeId,
        });
      }

      // 5. If explicit tasks were checked AND points were set, distribute points to first task
      // (user can adjust per-task points later in the task detail)
      if (hasExplicitTasks && storyPoints) {
        // Points will be set on individual tasks by the user during refinement
        // For now we don't auto-distribute — that's a refinement activity
      }

      qc.invalidateQueries({ queryKey: ['work-items', projectId] });
      onDone();
    } catch (err) {
      console.error('Failed to create story:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50/30 p-4 space-y-4">
      <h3 className="text-sm font-medium text-gray-900">{t('epicDetail.addStoryToEpic')}</h3>

      {/* Title */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          {t('epicDetail.titleRequired')}
          <span className="ml-1 font-normal text-gray-400">
            {t('epicDetail.titleHint')}
          </span>
        </label>
        <Input
          autoFocus
          placeholder={t('epicDetail.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-500">{t('epicDetail.descriptionLabel')}</label>
          <Button
            variant="ghost"
            size="sm"
            disabled={!title.trim() || aiDescLoading}
            onClick={async () => {
              setAiDescLoading(true);
              try {
                const result = await api.post<{ description: string; questions: string[] }>(
                  `/projects/${projectId}/ai/suggest-inline`,
                  { type: 'description', title, description, epic_title: epicTitle, epic_description: epicDescription, story_type: 'story' }
                );
                if (result.description) setDescription(result.description);
              } catch { /* silently fail */ }
              finally { setAiDescLoading(false); }
            }}
          >
            {aiDescLoading ? t('common.thinking') : `✨ ${t('workItemDetail.suggest')}`}
          </Button>
        </div>
        <Textarea
          placeholder={t('epicDetail.descriptionPlaceholder')}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Priority + Points + Assignee */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.priorityLabel')}</label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {STORY_PRIORITIES.map((p) => (
              <option key={p} value={p}>{t(`priority.${p}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500">
            {t('epicDetail.storyPointsLabel')}
            <ContextHelp>
              {t('workItemDetail.taskPointsHelp')}
            </ContextHelp>
          </label>
          <Input
            type="number"
            min={0}
            placeholder="—"
            value={storyPoints}
            onChange={(e) => setStoryPoints(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">{t('epicDetail.assigneeLabel')}</label>
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t('workItemDetail.unassigned')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.jobRole.toUpperCase()})
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Auto-task hint */}
      {willAutoCreateTask && (
        <p className="text-xs text-brand-600">
          {t('epicDetail.autoTaskHint', { points: storyPoints })}
        </p>
      )}

      {/* Story point guard */}
      {isLarge && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('epicDetail.largeStoryWarning', { points })}
        </div>
      )}

      {/* Acceptance Criteria */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-1 text-xs font-medium text-gray-500">
            {t('epicDetail.acceptanceCriteria')}
            <ContextHelp>
              {t('epicDetail.acContextHelp')}
            </ContextHelp>
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!title.trim() || aiAcLoading}
              onClick={async () => {
                setAiAcLoading(true);
                try {
                  const result = await api.post<{ suggestions: Array<{ given: string; when: string; then: string }>; questions: string[] }>(
                    `/projects/${projectId}/ai/suggest-inline`,
                    { type: 'ac', title, description, epic_title: epicTitle, epic_description: epicDescription }
                  );
                  if (result.suggestions?.length) {
                    setAcRows([...acRows.filter(ac => ac.given || ac.when || ac.then), ...result.suggestions.map(s => ({ given: s.given, when: s.when, then: s.then }))]);
                  }
                } catch { /* silently fail */ }
                finally { setAiAcLoading(false); }
              }}
            >
              {aiAcLoading ? t('common.thinking') : `✨ ${t('workItemDetail.suggest')}`}
            </Button>
            <button onClick={addAcRow} className="text-xs text-brand-600 hover:text-brand-800">
              {t('epicDetail.addCriterion')}
            </button>
          </div>
        </div>
        {acRows.map((ac, idx) => (
          <div key={idx} className="mb-2 rounded border border-gray-200 bg-white p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-xs font-medium text-gray-400">{t('acceptanceCriteria.given')}</span>
              <Input
                placeholder={t('epicDetail.givenPlaceholder')}
                value={ac.given}
                onChange={(e) => updateAcRow(idx, 'given', e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-xs font-medium text-gray-400">{t('acceptanceCriteria.when')}</span>
              <Input
                placeholder={t('epicDetail.whenPlaceholder')}
                value={ac.when}
                onChange={(e) => updateAcRow(idx, 'when', e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-right text-xs font-medium text-gray-400">{t('acceptanceCriteria.then')}</span>
              <Input
                placeholder={t('epicDetail.thenPlaceholder')}
                value={ac.then}
                onChange={(e) => updateAcRow(idx, 'then', e.target.value)}
                className="flex-1"
              />
              {acRows.length > 1 && (
                <button
                  onClick={() => removeAcRow(idx)}
                  className="text-gray-400 hover:text-red-500"
                  title={t('common.remove')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Related tasks prompt */}
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-500">
          {t('epicDetail.createRelatedTasks')}
          <span className="ml-1 font-normal text-gray-400">
            {t('epicDetail.autoAssignHint')}
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          {TASK_TEMPLATES.map((tmpl) => {
            const roleMembers = members.filter((m) => m.jobRole === tmpl.role);
            const memberName = roleMembers.length === 1 ? roleMembers[0]!.name : null;
            return (
              <label key={tmpl.role} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!createTasks[tmpl.role]}
                  onChange={(e) => setCreateTasks({ ...createTasks, [tmpl.role]: e.target.checked })}
                  className="rounded border-gray-300"
                />
                {t(tmpl.labelKey)}
                {memberName && (
                  <span className="text-xs text-gray-400">→ {memberName}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={submit} disabled={!title.trim() || submitting}>
          {submitting ? t('epicDetail.creating') : t('epicDetail.createStory')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}
