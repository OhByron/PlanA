import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Badge, Select, Input, cn } from '@projecta/ui';
import type { WorkItemStatus, Priority, WorkItemType } from '@projecta/types';
import { useWorkItem } from '../../hooks/use-work-item';
import { useUpdateWorkItem, useWorkItems, useCreateWorkItem } from '../../hooks/use-work-items';
import { useProjectMembers } from '../../hooks/use-project-members';
import { useEpics } from '../../hooks/use-epics';
import { useAcceptanceCriteria, useCreateAcceptanceCriterion, useUpdateAcceptanceCriterion, useDeleteAcceptanceCriterion } from '../../hooks/use-acceptance-criteria';
import { useComments, useCreateComment } from '../../hooks/use-comments';
import { TypeIcon } from '../../components/type-icon';
import { PriorityIndicator } from '../../components/priority-indicator';
import { StatusBadge } from '../../components/status-badge';
import { RichTextEditor } from '../../components/rich-text-editor';
import { RichTextDisplay } from '../../components/rich-text-display';
import { ContextHelp } from '../../components/context-help';
import { useDependencies, useCreateDependency, useDeleteDependency } from '../../hooks/use-dependencies';
import { EstimationVotes } from '../../components/estimation-votes';
import { useLinks, useCreateLink, useDeleteLink } from '../../hooks/use-links';
import { useTestSummary, useTestResult } from '../../hooks/use-test-results';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api-client';
import { AcceptanceCriteriaSection } from '../../components/acceptance-criteria-section';
import { CommentsSection } from '../../components/comments-section';
import { TestResultsSection } from '../../components/test-results-section';
import { VCSSection } from '../../components/vcs-section';
import { DependenciesSection } from '../../components/dependencies-section';

const STATUSES: WorkItemStatus[] = ['backlog', 'ready', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];
const TYPES: WorkItemType[] = ['story', 'bug', 'task'];

export function WorkItemDetailPage() {
  const { t } = useTranslation();
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
  const { data: epics = [] } = useEpics(projectId);

  // Calculated points for stories (sum of child task points)
  const childTasksForPoints = allItems.filter((i) => i.parentId === workItemId);
  const calculatedPoints = childTasksForPoints.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [copiedBranch, setCopiedBranch] = useState(false);
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
    const timer = setTimeout(() => setFieldError(null), 5000);
    return () => clearTimeout(timer);
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
        <button
          onClick={() => window.history.back()}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('common.back')}
        </button>

        {/* Parent story link for tasks */}
        {item.parentId && (() => {
          const parent = allItems.find((i) => i.id === item.parentId);
          return parent ? (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-sm">
              <span className="text-gray-400">{t('workItemDetail.partOf')}</span>
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
          {(item as unknown as { itemNumber?: number | null }).itemNumber != null && (
            <button
              onClick={() => {
                const num = (item as unknown as { itemNumber: number }).itemNumber;
                const slug = item.title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .slice(0, 40);
                navigator.clipboard.writeText(`feature/#${num}-${slug}`);
                setCopiedBranch(true);
                setTimeout(() => setCopiedBranch(false), 2000);
              }}
              className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              title={t('vcs.copyBranch') ?? 'Copy branch name'}
            >
              {copiedBranch ? (t('vcs.copied') ?? 'Copied!') : (t('vcs.copyBranch') ?? 'Copy branch name')}
            </button>
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
              title={t('workItemDetail.clickToEdit')}
            >
              {item.title}
            </h1>
          )}
        </div>

        {/* Description */}
        <section className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('workItemDetail.description')}</h2>
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
                    await new Promise<void>((resolve, reject) => {
                      updateItem.mutate(
                        { workItemId: item.id, data: { description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: result.description }] }] } } },
                        { onSuccess: () => resolve(), onError: (err) => reject(err) },
                      );
                    });
                  }
                  if (result.questions?.length) {
                    setAiQuestions(result.questions);
                  }
                  if (!result.description && !result.questions?.length) {
                    setAiQuestions([t('common.error', { message: 'Empty AI response' })]);
                  }
                } catch (err: any) {
                  setAiQuestions([err.message ?? 'AI suggestion failed']);
                } finally {
                  setAiDescLoading(false);
                }
              }}
            >
              {aiDescLoading ? t('common.thinking') : '\u2728 ' + t('workItemDetail.suggest')}
            </Button>
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <RichTextEditor
                content={item.description as Record<string, unknown> | null}
                placeholder={t('workItemDetail.descPlaceholder')}
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
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>
                  {t('common.cancel')}
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
                <span className="text-sm italic text-gray-400">{t('workItemDetail.clickToAddDescription')}</span>
              )}
            </div>
          )}
        </section>

        {/* Definition of Ready (stories only) */}
        {item.type === 'story' && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {t('workItemDetail.definitionOfReady')}
            </h2>
            <div className="space-y-1.5">
              {(() => {
                const childTasks = allItems.filter((i) => i.parentId === item.id);
                const hasDescription = item.description != null;
                const hasAC = criteria.length > 0;
                const hasTasks = childTasks.length > 0;
                const hasEstimates = childTasks.length > 0 && childTasks.every((t) => t.storyPoints != null && t.storyPoints > 0);
                const designOk = item.designReady;
                const checks = [
                  { label: t('workItemDetail.dorDescription'), ok: hasDescription },
                  { label: t('workItemDetail.dorAC'), ok: hasAC },
                  { label: t('workItemDetail.dorTasks'), ok: hasTasks },
                  { label: t('workItemDetail.dorEstimates'), ok: hasEstimates },
                  { label: t('workItemDetail.dorDesign'), ok: designOk },
                ];
                const passCount = checks.filter((c) => c.ok).length;
                const allPass = passCount === checks.length;

                return (
                  <>
                    {checks.map((check) => (
                      <div key={check.label} className="flex items-center gap-2 text-xs">
                        <span className={check.ok ? 'text-emerald-500' : 'text-gray-300'}>
                          {check.ok ? '✓' : '○'}
                        </span>
                        <span className={check.ok ? 'text-gray-700' : 'text-gray-400'}>{check.label}</span>
                      </div>
                    ))}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div
                          className={cn('h-full rounded-full transition-all',
                            allPass ? 'bg-emerald-400' : passCount >= 3 ? 'bg-amber-400' : 'bg-gray-300')}
                          style={{ width: `${(passCount / checks.length) * 100}%` }}
                        />
                      </div>
                      <span className={cn('text-xs font-medium',
                        allPass ? 'text-emerald-600' : passCount >= 3 ? 'text-amber-600' : 'text-gray-400')}>
                        {allPass ? t('workItemDetail.dorReady') : `${passCount}/${checks.length}`}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </section>
        )}

        {/* Design readiness */}
        <section className="mb-6">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={item.designReady}
                onChange={(e) => patchField({ designReady: e.target.checked })}
                className="rounded border-gray-300"
              />
              {t('workItemDetail.designComplete')}
            </label>
          </div>
          {item.designReady && (
            <div className="mt-2">
              <Input
                value={item.designLink ?? ''}
                onChange={(e) => patchField({ designLink: e.target.value || null })}
                placeholder={t('workItemDetail.designLinkPlaceholder')}
                aria-label="Design link"
              />
              {item.designReady && !item.designLink && (
                <p className="mt-1 text-xs text-amber-500">{t('workItemDetail.designLinkRequired')}</p>
              )}
            </div>
          )}
          {item.designLink && (
            <a href={item.designLink} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800">
              {t('workItemDetail.viewDesign')} ↗
            </a>
          )}
        </section>

        {/* Estimation votes (tasks/bugs in backlog only — once work starts, estimation is done) */}
        {item.type !== 'story' && item.status === 'backlog' && (
          <EstimationVotes workItemId={workItemId} projectId={projectId} currentPoints={item.storyPoints} />
        )}

        {/* Pre-conditions */}
        <ConditionsSection
          label={t('workItemDetail.preConditions')}
          help={t('workItemDetail.preConditionsHelp')}
          content={item.preConditions}
          onSave={(val) => patchField({ preConditions: val })}
          placeholder={t('workItemDetail.preConditionsPlaceholder')}
        />

        {/* Post-conditions */}
        <ConditionsSection
          label={t('workItemDetail.postConditions')}
          help={t('workItemDetail.postConditionsHelp')}
          content={item.postConditions}
          onSave={(val) => patchField({ postConditions: val })}
          placeholder={t('workItemDetail.postConditionsPlaceholder')}
        />

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

        {/* VCS Activity (branches, PRs, commits) */}
        <VCSSection workItemId={workItemId} />

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
            <button onClick={() => setFieldError(null)} className="ml-2 font-medium hover:text-red-900" aria-label={t('common.dismiss')}>×</button>
          </div>
        )}
        <h2 className="mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('workItemDetail.details')}</h2>

        {/* Status */}
        <FieldGroup label={t('workItemDetail.statusLabel')}>
          <Select
            value={item.status}
            onChange={(e) => patchField({ status: e.target.value })}
            aria-label="Status"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </FieldGroup>

        {/* Type */}
        <FieldGroup label={t('workItemDetail.typeLabel')}>
          <div className="flex items-center gap-2">
            <TypeIcon type={item.type} />
            <Select
              value={item.type}
              onChange={(e) => patchField({ type: e.target.value })}
              aria-label="Type"
            >
              {TYPES.map((typeVal) => (
                <option key={typeVal} value={typeVal}>
                  {t(`type.${typeVal}`)}
                </option>
              ))}
            </Select>
          </div>
        </FieldGroup>

        {/* Priority */}
        <FieldGroup label={t('workItemDetail.priorityLabel')}>
          <div className="flex items-center gap-2">
            <PriorityIndicator priority={item.priority} />
            <Select
              value={item.priority}
              onChange={(e) => patchField({ priority: e.target.value })}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </div>
        </FieldGroup>

        {/* Assignee */}
        <FieldGroup label={t('workItemDetail.assigneeLabel')}>
          <Select
            value={item.assigneeId ?? ''}
            onChange={(e) => patchField({ assigneeId: e.target.value || null })}
            aria-label="Assignee"
          >
            <option value="">{t('workItemDetail.unassigned')}</option>
            {projectMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.jobRole.toUpperCase()})
              </option>
            ))}
          </Select>
        </FieldGroup>

        {/* Epic */}
        <FieldGroup label={t('workItemDetail.epicLabel')}>
          <Select
            value={item.epicId ?? ''}
            onChange={(e) => {
              const val = e.target.value || '';
              patchField({ epicId: val });
              // Also move child tasks to the same epic
              const children = allItems.filter((i) => i.parentId === item.id);
              for (const child of children) {
                updateItem.mutate({ workItemId: child.id, data: { epicId: val } });
              }
            }}
            aria-label="Epic"
          >
            <option value="">{t('workItemDetail.noEpic')}</option>
            {epics.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </Select>
        </FieldGroup>

        {/* Dates */}
        <FieldGroup label={t('workItemDetail.startDate')}>
          <Input
            type="date"
            value={item.startDate ? new Date(item.startDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => patchField({ startDate: e.target.value || '' })}
            aria-label="Start date"
          />
        </FieldGroup>
        <FieldGroup label={t('workItemDetail.dueDate')}>
          <Input
            type="date"
            value={item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => patchField({ dueDate: e.target.value || '' })}
            aria-label="Due date"
          />
          {item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'done' && item.status !== 'cancelled' && (
            <p className="mt-1 text-xs font-medium text-red-500">{t('workItemDetail.overdue')}</p>
          )}
        </FieldGroup>
        <FieldGroup label={t('workItemDetail.targetDate')}>
          <Input
            type="date"
            value={item.targetDate ? new Date(item.targetDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => patchField({ targetDate: e.target.value || '' })}
            aria-label="Target date"
          />
          {item.targetDate && item.dueDate && new Date(item.dueDate) > new Date(item.targetDate) && (
            <p className="mt-1 text-xs font-medium text-amber-500">{t('workItemDetail.pastTarget')}</p>
          )}
        </FieldGroup>

        {/* Story Points */}
        <FieldGroup label={
          <span className="flex items-center gap-1">
            {item.type === 'story' ? t('workItemDetail.totalPoints') : t('workItemDetail.storyPoints')}
            <ContextHelp>
              {item.type === 'story'
                ? t('workItemDetail.storyPointsHelp')
                : t('workItemDetail.taskPointsHelp')}
            </ContextHelp>
          </span>
        }>
          {item.type === 'story' && childTasksForPoints.length > 0 ? (
            <div>
              <p className={`text-lg font-semibold ${calculatedPoints >= 8 ? 'text-amber-600' : 'text-gray-900'}`}>{calculatedPoints}</p>
              <p className="text-xs text-gray-400">
                {t('workItemDetail.sumOfTasks', { count: childTasksForPoints.length })}
              </p>
              {calculatedPoints >= 8 && (
                <p className="mt-1 text-xs text-amber-600">
                  {t('workItemDetail.largeStoryWarning', { points: calculatedPoints })}
                </p>
              )}
            </div>
          ) : (
            <Select
              value={item.storyPoints != null ? String(item.storyPoints) : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                patchField({ storyPoints: val });
              }}
              aria-label="Story points"
            >
              <option value="">—</option>
              {[0, 1, 2, 3, 5, 8, 13, 21].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          )}
        </FieldGroup>

        {/* Points used (actual effort on completion) */}
        <FieldGroup label={
          <span className="flex items-center gap-1">
            {t('workItemDetail.pointsUsed')}
            <ContextHelp>{t('workItemDetail.pointsUsedHelp')}</ContextHelp>
          </span>
        }>
          <Input
            type="number"
            min={0}
            value={item.pointsUsed ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : Number(e.target.value);
              patchField({ pointsUsed: val });
            }}
            placeholder={item.storyPoints != null ? String(item.storyPoints) : '—'}
            aria-label="Points used"
          />
          {item.pointsUsed != null && item.storyPoints != null && item.pointsUsed !== item.storyPoints && (
            <p className={`mt-1 text-xs ${item.pointsUsed < item.storyPoints ? 'text-emerald-600' : 'text-amber-600'}`}>
              {item.pointsUsed < item.storyPoints
                ? t('workItemDetail.underEstimate', { diff: item.storyPoints - item.pointsUsed })
                : t('workItemDetail.overEstimate', { diff: item.pointsUsed - item.storyPoints })}
            </p>
          )}
        </FieldGroup>

        {/* Blocked status (derived from depends_on dependencies) */}
        <FieldGroup label={t('workItemDetail.blocked')}>
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
                  <p className="text-sm font-medium text-red-600">{t('workItemDetail.blockedBy')}</p>
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

            return <p className="text-sm text-gray-500">{t('workItemDetail.notBlocked')}</p>;
          })()}
        </FieldGroup>

        {/* Labels */}
        {item.labels.length > 0 && (
          <FieldGroup label={t('workItemDetail.labels')}>
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
                if (!confirm(t('workItemDetail.convertToStoryConfirm'))) return;
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
              {t('workItemDetail.convertToStory')}
            </Button>
            <p className="mt-1 text-center text-xs text-gray-400">
              {t('workItemDetail.convertToStoryHelp')}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-6 border-t border-gray-100 pt-4 space-y-2 text-xs text-gray-400">
          <p>{t('workItemDetail.created', { date: new Date(item.createdAt).toLocaleDateString() })}</p>
          <p>{t('workItemDetail.updated', { date: new Date(item.updatedAt).toLocaleDateString() })}</p>
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

// --- Pre/Post conditions section ---

function ConditionsSection({
  label,
  help,
  content,
  onSave,
  placeholder,
}: {
  label: string;
  help: string;
  content: Record<string, unknown> | null;
  onSave: (val: Record<string, unknown> | null) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{label}</h2>
          <ContextHelp>{help}</ContextHelp>
        </div>
        {!editing && (
          <button
            onClick={() => {
              setDraft(content ? JSON.stringify(content) : '');
              setEditing(true);
            }}
            className="text-xs text-brand-600 hover:text-brand-800"
          >
            {content ? t('common.edit') : t('common.add')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <RichTextEditor
            content={draft ? JSON.parse(draft) : null}
            onChange={(val) => setDraft(JSON.stringify(val))}
            placeholder={placeholder}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onSave(draft ? JSON.parse(draft) : null);
                setEditing(false);
              }}
            >
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : content ? (
        <div
          className="cursor-pointer rounded-md border border-transparent p-2 text-sm text-gray-600 hover:border-gray-200 hover:bg-gray-50"
          onClick={() => {
            setDraft(JSON.stringify(content));
            setEditing(true);
          }}
        >
          <RichTextDisplay content={content} />
        </div>
      ) : (
        <p
          className="cursor-pointer rounded-md border border-transparent p-2 text-sm italic text-gray-400 hover:border-gray-200 hover:bg-gray-50"
          onClick={() => {
            setDraft('');
            setEditing(true);
          }}
        >
          {placeholder}
        </p>
      )}
    </section>
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
  const { t } = useTranslation();
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
        setDecompSuggestions((prev) => prev.filter((s) => s.title !== task.title));
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
            {t('childTasks.title', { count: childTasks.length })}
          </h2>
          <ContextHelp>
            {t('childTasks.contextHelp')}
          </ContextHelp>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={suggestDecompose} disabled={decompLoading}>
            {decompLoading ? t('common.thinking') : t('childTasks.suggestTasks')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
            {t('childTasks.addTask')}
          </Button>
        </div>
      </div>

      {childTasks.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400">{t('childTasks.noTasksYet')}</p>
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
            <span className="w-8 text-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {task.storyPoints ?? '—'}
            </span>
          </Link>
        );
      })}

      {showAdd && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder={t('childTasks.taskTitlePlaceholder')}
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
              <option value="">{t('workItemDetail.unassigned')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.jobRole.toUpperCase()})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addTask} disabled={!taskTitle.trim() || createItem.isPending}>
              {t('common.add')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}

      {/* AI Decomposition Suggestions */}
      {decompSuggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500">{t('childTasks.suggestedTasks')}</p>
          {decompSuggestions.map((task, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/30 px-3 py-2">
              <div className="flex-1">
                <span className="text-sm text-gray-900">{task.title}</span>
                <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                  <span className="uppercase">{task.role}</span>
                  <span>{t('childTasks.pts', { count: task.points })}</span>
                  {task.rationale && <span className="italic">{task.rationale}</span>}
                </div>
              </div>
              <Button size="sm" onClick={() => acceptTask(task)} disabled={createItem.isPending}>
                {t('common.add')}
              </Button>
              <button
                onClick={() => setDecompSuggestions((prev) => prev.filter((_, j) => j !== i))}
                className="text-xs text-gray-400 hover:text-gray-600"
                aria-label="Dismiss suggestion"
              >
                {t('common.dismiss')}
              </button>
            </div>
          ))}
        </div>
      )}

      {decompQuestions.length > 0 && (
        <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-xs font-medium text-yellow-700 mb-1">{t('childTasks.clarificationNeeded')}</p>
          <ul className="text-xs text-yellow-600 list-disc list-inside">
            {decompQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
