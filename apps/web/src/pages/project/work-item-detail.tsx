import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button, Badge, Select, Input, Textarea } from '@projecta/ui';
import type { WorkItemStatus, Priority, WorkItemType } from '@projecta/types';
import { useWorkItem } from '../../hooks/use-work-item';
import { useUpdateWorkItem, useWorkItems, useCreateWorkItem } from '../../hooks/use-work-items';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useAcceptanceCriteria, useCreateAcceptanceCriterion, useDeleteAcceptanceCriterion } from '../../hooks/use-acceptance-criteria';
import { useComments, useCreateComment } from '../../hooks/use-comments';
import { TypeIcon } from '../../components/type-icon';
import { PriorityIndicator } from '../../components/priority-indicator';
import { StatusBadge } from '../../components/status-badge';
import { RichTextEditor } from '../../components/rich-text-editor';
import { RichTextDisplay } from '../../components/rich-text-display';
import { ContextHelp } from '../../components/context-help';
import { useDependencies, useCreateDependency, useDeleteDependency } from '../../hooks/use-dependencies';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

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
  const [commentDraft, setCommentDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [acDraft, setAcDraft] = useState({ given: '', when: '', then: '' });
  const [showACForm, setShowACForm] = useState(false);
  const [showDepForm, setShowDepForm] = useState(false);
  const [commentKey, setCommentKey] = useState(0);
  const [depTargetId, setDepTargetId] = useState('');
  const [depType, setDepType] = useState<'depends_on' | 'relates_to'>('depends_on');

  if (isLoading || !item) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const patchField = (data: Record<string, unknown>) => {
    updateItem.mutate({ workItemId: item.id, data });
  };

  const saveTitle = () => {
    if (titleDraft.trim() && titleDraft !== item.title) {
      patchField({ title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const submitAC = () => {
    if (acDraft.given || acDraft.when || acDraft.then) {
      createAC.mutate({
        given_clause: acDraft.given,
        when_clause: acDraft.when,
        then_clause: acDraft.then,
      });
      setAcDraft({ given: '', when: '', then: '' });
      setShowACForm(false);
    }
  };

  const submitComment = () => {
    if (commentDraft) {
      createComment.mutate(JSON.parse(commentDraft));
      setCommentDraft('');
      setCommentKey((k) => k + 1);
    }
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
          <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Description</h2>
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
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Acceptance Criteria
              </h2>
              <ContextHelp>
                Acceptance Criteria define when this item is truly "done." Written in
                <strong> Given / When / Then</strong> format (BDD), they make expectations
                explicit and testable. Each criterion is a specific, verifiable condition —
                not a vague wish.
              </ContextHelp>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowACForm(!showACForm)}
            >
              + Add
            </Button>
          </div>

          {criteria.length === 0 && !showACForm && (
            <p className="text-sm text-gray-400">
              No acceptance criteria yet. Define the conditions for "done".
            </p>
          )}

          {criteria.map((ac) => (
            <div
              key={ac.id}
              className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <div className="flex justify-between">
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium text-gray-500">Given </span>
                    <span className="text-gray-900">{ac.given}</span>
                  </p>
                  <p>
                    <span className="font-medium text-gray-500">When </span>
                    <span className="text-gray-900">{ac.when}</span>
                  </p>
                  <p>
                    <span className="font-medium text-gray-500">Then </span>
                    <span className="text-gray-900">{ac.then}</span>
                  </p>
                </div>
                <button
                  onClick={() => deleteAC.mutate(ac.id)}
                  className="ml-2 self-start text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {showACForm && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
              <Input
                placeholder="Given..."
                value={acDraft.given}
                onChange={(e) => setAcDraft({ ...acDraft, given: e.target.value })}
              />
              <Input
                placeholder="When..."
                value={acDraft.when}
                onChange={(e) => setAcDraft({ ...acDraft, when: e.target.value })}
              />
              <Input
                placeholder="Then..."
                value={acDraft.then}
                onChange={(e) => setAcDraft({ ...acDraft, then: e.target.value })}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={submitAC}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowACForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </section>

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

        {/* Dependencies */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Dependencies
              </h2>
              <ContextHelp>
                Dependencies track relationships between items.
                <strong> "Depends on"</strong> means this item can't proceed until the
                target is complete. <strong>"Relates to"</strong> is an informational link.
              </ContextHelp>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowDepForm(!showDepForm)}>
              + Add
            </Button>
          </div>

          {dependencies.length === 0 && !showDepForm && (
            <p className="text-sm text-gray-400">No dependencies.</p>
          )}

          {dependencies.map((dep) => {
            const isSource = dep.sourceId === workItemId;
            const linkedId = isSource ? dep.targetId : dep.sourceId;
            const label = isSource
              ? dep.type === 'depends_on' ? 'Depends on' : 'Relates to'
              : dep.type === 'depends_on' ? 'Depended on by' : 'Relates to';

            return (
              <div key={dep.id} className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-xs font-medium text-gray-500 w-28 shrink-0">{label}</span>
                <Link
                  to="/p/$projectId/items/$workItemId"
                  params={{ projectId, workItemId: linkedId }}
                  className="flex-1 truncate text-sm font-medium text-brand-600 hover:text-brand-800"
                >
                  {dep.targetTitle}
                </Link>
                <button
                  onClick={() => deleteDep.mutate(dep.id)}
                  className="text-gray-400 hover:text-red-500"
                  title="Remove"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          {showDepForm && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
              <div className="flex gap-2">
                <Select
                  value={depType}
                  onChange={(e) => setDepType(e.target.value as 'depends_on' | 'relates_to')}
                  className="w-36"
                >
                  <option value="depends_on">Depends on</option>
                  <option value="relates_to">Relates to</option>
                </Select>
                <Select
                  value={depTargetId}
                  onChange={(e) => setDepTargetId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Select an item...</option>
                  {allItems
                    .filter((i) => i.id !== workItemId)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        [{i.type[0]!.toUpperCase()}] {i.title}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!depTargetId}
                  onClick={() => {
                    createDep.mutate(
                      { target_id: depTargetId, type: depType },
                      { onSuccess: () => { setDepTargetId(''); setShowDepForm(false); } },
                    );
                  }}
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDepForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Comments */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Comments
          </h2>

          {comments.length === 0 && (
            <p className="mb-3 text-sm text-gray-400">No comments yet.</p>
          )}

          {comments.map((c) => {
            const member = projectMembers.find((m) => m.id === c.userId) ??
              projectMembers.find((m) => m.userId === c.userId);
            return (
              <div key={c.id} className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {member?.name ?? c.userId.slice(0, 8)}
                  </span>
                  <span>·</span>
                  <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <RichTextDisplay content={c.body as Record<string, unknown>} />
              </div>
            );
          })}

          <div className="space-y-2">
            <RichTextEditor
              key={commentKey}
              placeholder="Add a comment..."
              onChange={(json) => setCommentDraft(JSON.stringify(json))}
            />
            <Button
              size="sm"
              onClick={submitComment}
              disabled={!commentDraft}
            >
              Send
            </Button>
          </div>
        </section>
      </div>

      {/* Sidebar panel */}
      <aside className="w-72 border-l border-gray-200 bg-white p-4 overflow-y-auto">
        <h2 className="mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h2>

        {/* Status */}
        <FieldGroup label="Status">
          <Select
            value={item.status}
            onChange={(e) => patchField({ status: e.target.value })}
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
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          + Add Task
        </Button>
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
            />
            <Select
              value={taskAssignee}
              onChange={(e) => setTaskAssignee(e.target.value)}
              className="w-48"
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
    </section>
  );
}
