import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button, Badge, Select, Input } from '@projecta/ui';
import type { WorkItemStatus, Priority, WorkItemType } from '@projecta/types';
import { useWorkItem } from '../../hooks/use-work-item';
import { useUpdateWorkItem, useWorkItems, useCreateWorkItem } from '../../hooks/use-work-items';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useAcceptanceCriteria, useCreateAcceptanceCriterion, useUpdateAcceptanceCriterion, useDeleteAcceptanceCriterion } from '../../hooks/use-acceptance-criteria';
import { useComments, useCreateComment } from '../../hooks/use-comments';
import { TypeIcon } from '../../components/type-icon';
import { PriorityIndicator } from '../../components/priority-indicator';
import { StatusBadge } from '../../components/status-badge';
import { RichTextEditor } from '../../components/rich-text-editor';
import { RichTextDisplay } from '../../components/rich-text-display';
import { ContextHelp } from '../../components/context-help';
import { useDependencies, useCreateDependency, useDeleteDependency } from '../../hooks/use-dependencies';
import { useLinks, useCreateLink, useDeleteLink } from '../../hooks/use-links';
import { useTestSummary, useTestResult } from '../../hooks/use-test-results';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api-client';
import { AcceptanceCriteriaSection } from '../../components/acceptance-criteria-section';
import { CommentsSection } from '../../components/comments-section';
import { TestResultsSection } from '../../components/test-results-section';
import { DependenciesSection } from '../../components/dependencies-section';

const STATUSES: WorkItemStatus[] = ['backlog', 'ready', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];
const TYPES: WorkItemType[] = ['story', 'bug', 'task'];

export function WorkItemDetailPage() {
  const { projectId, workItemId } = useParams({ strict: false }) as {
    projectId: string;
    workItemId: string;
  };

  const qc = useQueryClient();
  const { data: item, isLoading } = useWorkItem(projectId, workItemId);
  const updateItem = useUpdateWorkItem(projectId);
  const { data: criteria = [] } = useAcceptanceCriteria(workItemId);
  const createAC = useCreateAcceptanceCriterion(workItemId);
  const updateAC = useUpdateAcceptanceCriterion(workItemId);
  const deleteAC = useDeleteAcceptanceCriterion(workItemId);
  const { data: comments = [] } = useComments(workItemId);
  const createComment = useCreateComment(workItemId);
  const { data: dependencies = [] } = useDependencies(workItemId);
  const createDep = useCreateDependency(workItemId);
  const deleteDep = useDeleteDependency(workItemId);
  const { data: allItems = [] } = useWorkItems(projectId);

  // Project members for assignee dropdown
  const { data: projectMembers = [] } = useProjectMembers(projectId);

  // Calculated points for stories (sum of child task points)
  const childTasksForPoints = allItems.filter((i) => i.parentId === workItemId);
  const calculatedPoints = childTasksForPoints.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  const { data: links = [] } = useLinks(workItemId);
  const createLink = useCreateLink(workItemId);
  const deleteLink = useDeleteLink(workItemId);
  const { data: testSummary } = useTestSummary(workItemId);
  const { data: sourceTestResult } = useTestResult(projectId, item?.sourceTestResultId ?? null);

  const [fieldError, setFieldError] = useState<string | null>(null);

  // Auto-dismiss field error after 5 seconds
  useEffect(() => {
    if (!fieldError) return;
    const t = setTimeout(() => setFieldError(null), 5000);
    return () => clearTimeout(t);
  }, [fieldError]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [aiDefectLoading, setAiDefectLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{given: string; when: string; then: string}>>([]);
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);

  const suggestAC = async () => {
    setAiLoading(true);
    setAiSuggestions([]);
    setAiQuestions([]);
    try {
      const result = await api.post<{ suggestions: Array<{given: string; when: string; then: string}>; questions: string[] }>(
        `/projects/${projectId}/work-items/${workItemId}/suggest-ac`, {}
      );
      setAiSuggestions(result.suggestions ?? []);
      setAiQuestions(result.questions ?? []);
    } catch (err: any) {
      setAiQuestions([err.message ?? 'AI suggestion failed']);
    } finally {
      setAiLoading(false);
    }
  };

  const suggestFromTest = async () => {
    if (!item?.sourceTestResultId) return;
    setAiDefectLoading(true);
    setAiSuggestions([]);
    setAiQuestions([]);
    try {
      const result = await api.post<{
        description: string;
        acceptance_criteria: Array<{given: string; when: string; then: string}>;
        questions: string[];
      }>(`/projects/${projectId}/work-items/${workItemId}/suggest-from-test`, {});

      // Auto-populate description
      if (result.description) {
        patchField({
          description: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: result.description }] }],
          },
        });
      }

      // Show AC suggestions for user to accept/edit
      setAiSuggestions(result.acceptance_criteria ?? []);
      setAiQuestions(result.questions ?? []);
    } catch (err: any) {
      setAiQuestions([err.message ?? 'AI generation failed']);
    } finally {
      setAiDefectLoading(false);
    }
  };

  if (isLoading || !item) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const patchField = (data: Record<string, unknown>) => {
    updateItem.mutate(
      { workItemId: item.id, data },
      {
        onError: (err) => {
          if (err instanceof ApiError) {
            setFieldError(err.message);
          }
        },
        onSuccess: () => setFieldError(null),
      },
    );
  };

  const saveTitle = () => {
    if (titleDraft.trim() && titleDraft !== item.title) {
      patchField({ title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Back link */}
        <Link
          to="/p/$projectId/board"
          params={{ projectId }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to board
        </Link>

        {/* Parent story link for tasks */}
        {item.parentId && (() => {
          const parent = allItems.find((i) => i.id === item.parentId);
          return parent ? (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm">
              <span className="text-gray-400">Part of:</span>
              <Link
                to="/p/$projectId/items/$workItemId"
                params={{ projectId, workItemId: parent.id }}
                className="font-medium text-brand-600 hover:text-brand-800"
              >
                {parent.title}
              </Link>
            </div>
          ) : null;
        })()}

        {/* Title */}
        <div className="mb-6 flex items-start gap-3">
          <TypeIcon type={item.type} />
          {(item as unknown as { itemNumber?: number | null }).itemNumber != null && (
            <span className="text-sm text-gray-400">#{(item as unknown as { itemNumber: number }).itemNumber}</span>
          )}
          {editingTitle ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="text-xl font-semibold"
              aria-label="Work item title"
            />
          ) : (
            <h1
              className="cursor-pointer text-xl font-semibold text-gray-900 hover:text-brand-700"
              onClick={() => {
                setTitleDraft(item.title);
                setEditingTitle(true);
              }}
              title="Click to edit"
            >
              {item.title}
            </h1>
          )}
        </div>

        {/* Description */}
        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Description</h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={aiDescLoading}
              onClick={async () => {
                setAiDescLoading(true);
                try {
                  const result = await api.post<{ description: string; questions: string[] }>(
                    `/projects/${projectId}/work-items/${workItemId}/suggest-desc`, {}
                  );
                  if (result.description) {
                    patchField({ description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: result.description }] }] } });
                  }
                  if (result.questions?.length) {
                    setAiQuestions(result.questions);
                  }
                } catch (err: any) {
                  setAiQuestions([err.message ?? 'AI suggestion failed']);
                } finally {
                  setAiDescLoading(false);
                }
              }}
            >
              {aiDescLoading ? 'Thinking...' : '\u2728 Suggest'}
            </Button>
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <RichTextEditor
                content={item.description as Record<string, unknown> | null}
                placeholder="Describe the requirement, goal, and context..."
                autoFocus
                onChange={(json) => setDescDraft(JSON.stringify(json))}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    patchField({ description: descDraft ? JSON.parse(descDraft) : null });
                    setEditingDesc(false);
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="cursor-pointer rounded-md border border-transparent p-2 hover:border-gray-200 hover:bg-gray-50"
              onClick={() => {
                setDescDraft('');
                setEditingDesc(true);
              }}
            >
              {item.description ? (
                <RichTextDisplay content={item.description as Record<string, unknown>} />
              ) : (
                <span className="text-sm italic text-gray-400">Click to add a description...</span>
              )}
            </div>
          )}
        </section>

        {/* Acceptance Criteria */}
        <AcceptanceCriteriaSection
          criteria={criteria}
          createAC={createAC}
          updateAC={updateAC}
          deleteAC={deleteAC}
          aiLoading={aiLoading}
          aiSuggestions={aiSuggestions}
          aiQuestions={aiQuestions}
          onSuggestAC={suggestAC}
          onSetAiSuggestions={setAiSuggestions}
        />

        {/* Child Tasks */}
        {item.type === 'story' && (
          <ChildTasksSection
            projectId={projectId}
            parentId={workItemId}
            epicId={item.epicId}
            allItems={allItems}
            members={projectMembers}
          />
        )}

        {/* Dependencies & Links */}
        <DependenciesSection
          projectId={projectId}
          workItemId={workItemId}
          dependencies={dependencies}
          createDep={createDep}
          deleteDep={deleteDep}
          links={links}
          createLink={createLink}
          deleteLink={deleteLink}
          allItems={allItems}
        />

        {/* Test Results & Source Test Failure */}
        <TestResultsSection
          testSummary={testSummary}
          sourceTestResult={sourceTestResult}
          aiDefectLoading={aiDefectLoading}
          onSuggestFromTest={suggestFromTest}
          itemType={item.type}
        />

        {/* Comments */}
        <CommentsSection
          comments={comments}
          createComment={createComment}
          projectMembers={projectMembers}
        />
      </div>

      {/* Sidebar panel */}
      <aside className="w-72 border-l border-gray-200 bg-white p-4 overflow-y-auto" aria-label="Work item details">
        {fieldError && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{fieldError}</span>
            <button onClick={() => setFieldError(null)} className="ml-2 font-medium hover:text-red-900" aria-label="Dismiss">×</button>
          </div>
        )}
        <h2 className="mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h2>

        {/* Status */}
        <FieldGroup label="Status">
          <Select
            value={item.status}
            onChange={(e) => patchField({ status: e.target.value })}
            aria-label="Status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>
        </FieldGroup>

        {/* Type */}
        <FieldGroup label="Type">
          <div className="flex items-center gap-2">
            <TypeIcon type={item.type} />
            <Select
              value={item.type}
              onChange={(e) => patchField({ type: e.target.value })}
              aria-label="Type"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        </FieldGroup>

        {/* Priority */}
        <FieldGroup label="Priority">
          <div className="flex items-center gap-2">
            <PriorityIndicator priority={item.priority} />
            <Select
              value={item.priority}
              onChange={(e) => patchField({ priority: e.target.value })}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        </FieldGroup>

        {/* Assignee */}
        <FieldGroup label="Assignee">
          <Select
            value={item.assigneeId ?? ''}
            onChange={(e) => patchField({ assigneeId: e.target.value || null })}
            aria-label="Assignee"
          >
            <option value="">Unassigned</option>
            {projectMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.jobRole.toUpperCase()})
              </option>
            ))}
          </Select>
        </FieldGroup>

        {/* Story Points */}
        <FieldGroup label={
          <span className="flex items-center gap-1">
            {item.type === 'story' ? 'Total Points' : 'Story Points'}
            <ContextHelp>
              {item.type === 'story'
                ? 'For stories, points are the sum of all task points. Add points to individual tasks during refinement.'
                : 'Estimate the relative effort. Common scales: 1, 2, 3, 5, 8, 13. A "1" is the simplest thing your team does.'}
            </ContextHelp>
          </span>
        }>
          {item.type === 'story' && childTasksForPoints.length > 0 ? (
            <div>
              <p className="text-lg font-semibold text-gray-900">{calculatedPoints}</p>
              <p className="text-xs text-gray-400">
                Sum of {childTasksForPoints.length} task{childTasksForPoints.length !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <Input
              type="number"
              min={0}
              value={item.storyPoints ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                patchField({ storyPoints: val });
              }}
              placeholder="—"
              aria-label="Story points"
            />
          )}
        </FieldGroup>

        {/* Blocked status (derived from depends_on dependencies) */}
        <FieldGroup label="Blocked">
          {(() => {
            const blockers = dependencies
              .filter((d) => d.type === 'depends_on' && d.sourceId === workItemId)
              .filter((d) => {
                const target = allItems.find((i) => i.id === d.targetId);
                return target && target.status !== 'done' && target.status !== 'cancelled';
              });

            if (blockers.length > 0) {
              return (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-red-600">Blocked by:</p>
                  {blockers.map((b) => (
                    <Link
                      key={b.id}
                      to="/p/$projectId/items/$workItemId"
                      params={{ projectId, workItemId: b.targetId }}
                      className="block truncate text-xs text-red-500 hover:text-red-700"
                    >
                      {b.targetTitle}
                    </Link>
                  ))}
                </div>
              );
            }

            return <p className="text-sm text-gray-500">Not blocked</p>;
          })()}
        </FieldGroup>

        {/* Labels */}
        {item.labels.length > 0 && (
          <FieldGroup label="Labels">
            <div className="flex flex-wrap gap-1">
              {item.labels.map((l) => (
                <Badge key={l} variant="secondary">{l}</Badge>
              ))}
            </div>
          </FieldGroup>
        )}

        {/* Convert task to story */}
        {item.type === 'task' && item.parentId && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-center"
              onClick={async () => {
                if (!confirm('Convert this task to a story? It will maintain a dependency link to the original story.')) return;
                try {
                  // 1. Change type to story and remove parent link
                  await api.patch(`/projects/${projectId}/work-items/${item.id}`, {
                    type: 'story',
                    parent_id: null,
                  });
                  // 2. Create a "depends_on" link to the original parent story
                  await api.post(`/work-items/${item.id}/dependencies`, {
                    target_id: item.parentId,
                    type: 'depends_on',
                  });
                  // Refresh
                  qc.invalidateQueries({ queryKey: ['work-items', projectId] });
                  qc.invalidateQueries({ queryKey: ['work-item', item.id] });
                  qc.invalidateQueries({ queryKey: ['dependencies', item.id] });
                } catch (err) {
                  console.error('Convert to story failed:', err);
                }
              }}
            >
              Convert to Story
            </Button>
            <p className="mt-1 text-center text-xs text-gray-400">
              Promotes this task to an independent story with a dependency link
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-6 border-t border-gray-100 pt-4 space-y-2 text-xs text-gray-400">
          <p>Created {new Date(item.createdAt).toLocaleDateString()}</p>
          <p>Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
          <p className="font-mono text-[10px]">{item.id}</p>
        </div>
      </aside>
    </div>
  );
}

function FieldGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

// --- Child tasks section for stories ---

function ChildTasksSection({
  projectId,
  parentId,
  epicId,
  allItems,
  members,
}: {
  projectId: string;
  parentId: string;
  epicId: string | null;
  allItems: import('@projecta/types').WorkItem[];
  members: import('../../hooks/use-project-members').ProjectMember[];
}) {
  const childTasks = allItems.filter((i) => i.parentId === parentId);
  const [showAdd, setShowAdd] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const createItem = useCreateWorkItem(projectId);
  const [decompLoading, setDecompLoading] = useState(false);
  const [decompSuggestions, setDecompSuggestions] = useState<Array<{title: string; role: string; points: number; rationale: string}>>([]);
  const [decompQuestions, setDecompQuestions] = useState<string[]>([]);

  const suggestDecompose = async () => {
    setDecompLoading(true);
    setDecompSuggestions([]);
    setDecompQuestions([]);
    try {
      const result = await api.post<{
        tasks: Array<{title: string; role: string; points: number; rationale: string}>;
        questions: string[];
      }>(`/projects/${projectId}/work-items/${parentId}/suggest-decompose`, {});
      setDecompSuggestions(result.tasks ?? []);
      setDecompQuestions(result.questions ?? []);
    } catch (err: any) {
      setDecompQuestions([err.message ?? 'AI decomposition failed']);
    } finally {
      setDecompLoading(false);
    }
  };

  const acceptTask = (task: {title: string; role: string; points: number}) => {
    const matchingMember = members.find((m) => m.jobRole === task.role);
    const data: Record<string, unknown> = {
      type: 'task',
      title: task.title,
      parent_id: parentId,
      story_points: task.points,
    };
    if (epicId) data.epic_id = epicId;
    if (matchingMember) data.assignee_id = matchingMember.id;
    createItem.mutate(data, {
      onSuccess: () => {
        setDecompSuggestions((prev) => prev.filter((t) => t.title !== task.title));
      },
    });
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const data: Record<string, unknown> = {
      type: 'task',
      title: taskTitle.trim(),
      parent_id: parentId,
    };
    if (epicId) data.epic_id = epicId;
    if (taskAssignee) data.assignee_id = taskAssignee;
    createItem.mutate(data, {
      onSuccess: () => {
        setTaskTitle('');
        setTaskAssignee('');
        setShowAdd(false);
      },
    });
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Tasks ({childTasks.length})
          </h2>
          <ContextHelp>
            Tasks break a story into work by discipline — UX design, backend dev,
            frontend dev, QE testing, etc. Each task is assignable to a team member.
          </ContextHelp>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={suggestDecompose} disabled={decompLoading}>
            {decompLoading ? 'Thinking...' : 'Suggest Tasks'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
            + Add Task
          </Button>
        </div>
      </div>

      {childTasks.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400">No tasks yet.</p>
      )}

      {childTasks.map((task) => {
        const assignee = members.find((m) => m.id === task.assigneeId);
        return (
          <Link
            key={task.id}
            to="/p/$projectId/items/$workItemId"
            params={{ projectId, workItemId: task.id }}
            className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
          >
            <TypeIcon type={task.type} />
            <span className="flex-1 truncate text-sm text-gray-900">{task.title}</span>
            {assignee && (
              <span className="text-xs text-gray-500">{assignee.name} ({assignee.jobRole.toUpperCase()})</span>
            )}
            <StatusBadge status={task.status} />
          </Link>
        );
      })}

      {showAdd && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Task title (e.g. 'UX: Design login screen')"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              className="flex-1"
              aria-label="Task title"
            />
            <Select
              value={taskAssignee}
              onChange={(e) => setTaskAssignee(e.target.value)}
              className="w-48"
              aria-label="Task assignee"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.jobRole.toUpperCase()})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addTask} disabled={!taskTitle.trim() || createItem.isPending}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* AI Decomposition Suggestions */}
      {decompSuggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500">Suggested tasks — click to add:</p>
          {decompSuggestions.map((task, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/30 px-3 py-2">
              <div className="flex-1">
                <span className="text-sm text-gray-900">{task.title}</span>
                <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                  <span className="uppercase">{task.role}</span>
                  <span>{task.points} pts</span>
                  {task.rationale && <span className="italic">{task.rationale}</span>}
                </div>
              </div>
              <Button size="sm" onClick={() => acceptTask(task)} disabled={createItem.isPending}>
                Add
              </Button>
              <button
                onClick={() => setDecompSuggestions((prev) => prev.filter((_, j) => j !== i))}
                className="text-xs text-gray-400 hover:text-gray-600"
                aria-label="Dismiss suggestion"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {decompQuestions.length > 0 && (
        <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-xs font-medium text-yellow-700 mb-1">Clarification needed:</p>
          <ul className="text-xs text-yellow-600 list-disc list-inside">
            {decompQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
