import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button, Badge, Select, Input, Textarea } from '@projecta/ui';
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
import { useTestSummary } from '../../hooks/use-test-results';
import { TestStatusBadge } from '../../components/test-status-badge';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api-client';

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
  const [commentDraft, setCommentDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [acDraft, setAcDraft] = useState({ given: '', when: '', then: '' });
  const [showACForm, setShowACForm] = useState(false);
  const [editingACId, setEditingACId] = useState<string | null>(null);
  const [editingACData, setEditingACData] = useState({ given: '', when: '', then: '' });
  const [showDepForm, setShowDepForm] = useState(false);
  const [commentKey, setCommentKey] = useState(0);
  const [depTargetId, setDepTargetId] = useState('');
  const [depType, setDepType] = useState<'depends_on' | 'relates_to'>('depends_on');

  const { data: links = [] } = useLinks(workItemId);
  const createLink = useCreateLink(workItemId);
  const deleteLink = useDeleteLink(workItemId);
  const { data: testSummary } = useTestSummary(workItemId);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [fieldError, setFieldError] = useState<string | null>(null);

  // Auto-dismiss field error after 5 seconds
  useEffect(() => {
    if (!fieldError) return;
    const t = setTimeout(() => setFieldError(null), 5000);
    return () => clearTimeout(t);
  }, [fieldError]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{given: string; when: string; then: string}>>([]);
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);

  const submitLink = () => {
    if (linkLabel.trim() && linkUrl.trim()) {
      createLink.mutate({ label: linkLabel.trim(), url: linkUrl.trim() }, {
        onSuccess: () => { setLinkLabel(''); setLinkUrl(''); setShowLinkForm(false); }
      });
    }
  };

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
              {aiDescLoading ? 'Thinking...' : '✨ Suggest'}
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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowACForm(!showACForm)}
              >
                + Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={suggestAC}
                disabled={aiLoading}
              >
                {aiLoading ? 'Thinking...' : '\u2728 Suggest AC'}
              </Button>
            </div>
          </div>

          {criteria.length === 0 && !showACForm && (
            <p className="text-sm text-gray-400">
              No acceptance criteria yet. Define the conditions for "done".
            </p>
          )}

          {criteria.map((ac) =>
            editingACId === ac.id ? (
              <div key={ac.id} className="mb-3 rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-12 text-right text-xs font-medium text-gray-400">Given</span>
                  <Input value={editingACData.given} onChange={(e) => setEditingACData({ ...editingACData, given: e.target.value })} className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-right text-xs font-medium text-gray-400">When</span>
                  <Input value={editingACData.when} onChange={(e) => setEditingACData({ ...editingACData, when: e.target.value })} className="flex-1" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-right text-xs font-medium text-gray-400">Then</span>
                  <Input value={editingACData.then} onChange={(e) => setEditingACData({ ...editingACData, then: e.target.value })} className="flex-1" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => {
                    updateAC.mutate({
                      acId: ac.id,
                      data: { given_clause: editingACData.given, when_clause: editingACData.when, then_clause: editingACData.then },
                    });
                    setEditingACId(null);
                  }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingACId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div
                key={ac.id}
                className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer hover:border-gray-300"
                onClick={() => {
                  setEditingACId(ac.id);
                  setEditingACData({ given: ac.given, when: ac.when, then: ac.then });
                }}
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
                    onClick={(e) => { e.stopPropagation(); deleteAC.mutate(ac.id); }}
                    className="ml-2 self-start text-gray-400 hover:text-red-500"
                    title="Delete"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ),
          )}

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

          {aiSuggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-brand-600">AI Suggestions — click to add:</p>
              {aiSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    createAC.mutate({ given_clause: s.given, when_clause: s.when, then_clause: s.then });
                    setAiSuggestions(aiSuggestions.filter((_, j) => j !== i));
                  }}
                  className="w-full rounded-lg border border-brand-200 bg-brand-50/30 p-3 text-left text-sm hover:bg-brand-50"
                >
                  <p><span className="font-medium text-gray-500">Given </span>{s.given}</p>
                  <p><span className="font-medium text-gray-500">When </span>{s.when}</p>
                  <p><span className="font-medium text-gray-500">Then </span>{s.then}</p>
                </button>
              ))}
            </div>
          )}

          {aiQuestions.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700 mb-1">The AI needs more information:</p>
              {aiQuestions.map((q, i) => (
                <p key={i} className="text-sm text-amber-800">{'\u2022'} {q}</p>
              ))}
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

        {/* Links */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Links</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowLinkForm(!showLinkForm)}>
              + Add Link
            </Button>
          </div>

          {links.length === 0 && !showLinkForm && (
            <p className="text-sm text-gray-400">No links yet.</p>
          )}

          {links.map((link) => (
            <div key={link.id} className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-sm text-brand-600 hover:text-brand-800"
              >
                {link.label}
              </a>
              <span className="text-xs text-gray-400 truncate max-w-[200px]">{link.url}</span>
              <button
                onClick={() => deleteLink.mutate(link.id)}
                className="text-gray-400 hover:text-red-500"
                title="Remove"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {showLinkForm && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Label (e.g. GitHub PR, Figma, Test results, Docs)"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); }}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={submitLink} disabled={!linkLabel.trim() || !linkUrl.trim()}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowLinkForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </section>

        {/* Test Results */}
        {testSummary && testSummary.total > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Test Results
            </h2>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-4">
                <TestStatusBadge status={testSummary.status} total={testSummary.total} pass={testSummary.pass} />
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="text-green-600">{testSummary.pass} passed</span>
                  {testSummary.fail > 0 && <span className="text-red-600">{testSummary.fail} failed</span>}
                  {testSummary.error > 0 && <span className="text-red-600">{testSummary.error} errors</span>}
                  {testSummary.skip > 0 && <span className="text-gray-400">{testSummary.skip} skipped</span>}
                </div>
                {testSummary.lastRun && (
                  <span className="ml-auto text-xs text-gray-400">
                    Last run: {new Date(testSummary.lastRun).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

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
        {fieldError && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{fieldError}</span>
            <button onClick={() => setFieldError(null)} className="ml-2 font-medium hover:text-red-900">×</button>
          </div>
        )}
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
