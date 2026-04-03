import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea, Select } from '@projecta/ui';
import type { Epic, Priority, Sprint } from '@projecta/types';

type EditTarget =
  | { type: 'epic'; epic: Epic & { itemNumber?: number | null } }
  | { type: 'sprint'; sprint: Sprint }
  | null;

interface Props {
  target: EditTarget;
  onClose: () => void;
  onUpdateEpic: (epicId: string, data: Record<string, unknown>) => void;
  onUpdateSprint: (sprintId: string, data: Record<string, unknown>) => void;
  onDeleteEpic: (epicId: string) => void;
  onDeleteSprint: (sprintId: string) => void;
  members?: Array<{ id: string; name: string; jobRole: string }>;
}

const EPIC_STATUSES = ['open', 'in_progress', 'done', 'cancelled'];
const SPRINT_STATUSES = ['planned', 'active', 'completed', 'cancelled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

export function GraphEditPanel({
  target,
  onClose,
  onUpdateEpic,
  onUpdateSprint,
  onDeleteEpic,
  onDeleteSprint,
  members = [],
}: Props) {
  const { t } = useTranslation();

  // Epic fields
  const [epicTitle, setEpicTitle] = useState('');
  const [epicDesc, setEpicDesc] = useState('');
  const [epicStatus, setEpicStatus] = useState('open');
  const [epicPriority, setEpicPriority] = useState<Priority>('medium');
  const [epicStartDate, setEpicStartDate] = useState('');
  const [epicDueDate, setEpicDueDate] = useState('');
  const [epicAssignee, setEpicAssignee] = useState('');

  // Sprint fields
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [sprintStatus, setSprintStatus] = useState('planned');
  const [sprintStartDate, setSprintStartDate] = useState('');
  const [sprintEndDate, setSprintEndDate] = useState('');

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Populate fields when target changes
  useEffect(() => {
    setConfirmDelete(false);
    if (!target) return;
    if (target.type === 'epic') {
      const e = target.epic;
      setEpicTitle(e.title);
      setEpicDesc(e.description ?? '');
      setEpicStatus(e.status);
      setEpicPriority(e.priority);
      setEpicStartDate(e.startDate ? new Date(e.startDate).toISOString().slice(0, 10) : '');
      setEpicDueDate(e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : '');
      setEpicAssignee(e.assigneeId ?? '');
    } else {
      const s = target.sprint;
      setSprintName(s.name);
      setSprintGoal(s.goal ?? '');
      setSprintStatus(s.status);
      setSprintStartDate(s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : '');
      setSprintEndDate(s.endDate ? new Date(s.endDate).toISOString().slice(0, 10) : '');
    }
  }, [target]);

  if (!target) return null;

  const saveEpic = () => {
    if (target.type !== 'epic') return;
    onUpdateEpic(target.epic.id, {
      title: epicTitle.trim(),
      description: epicDesc.trim() || null,
      status: epicStatus,
      priority: epicPriority,
      start_date: epicStartDate || null,
      due_date: epicDueDate || null,
      assignee_id: epicAssignee || null,
    });
    onClose();
  };

  const saveSprint = () => {
    if (target.type !== 'sprint') return;
    onUpdateSprint(target.sprint.id, {
      name: sprintName.trim(),
      goal: sprintGoal.trim() || null,
      status: sprintStatus,
      start_date: sprintStartDate || null,
      end_date: sprintEndDate || null,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (target.type === 'epic') onDeleteEpic(target.epic.id);
    else onDeleteSprint(target.sprint.id);
    onClose();
  };

  return (
    <div className="absolute right-4 top-14 z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
              target.type === 'epic'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-sky-100 text-sky-700'
            }`}
          >
            {target.type === 'epic' ? t('graph.epic') : t('graph.sprint')}
          </span>
          <h3 className="text-sm font-semibold text-gray-900">
            {target.type === 'epic' && target.epic.itemNumber != null && `#${target.epic.itemNumber} `}
            {t('graphEdit.edit')}
          </h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-4 space-y-3">
        {target.type === 'epic' ? (
          <>
            <Field label={t('graphEdit.title')}>
              <Input value={epicTitle} onChange={(e) => setEpicTitle(e.target.value)} />
            </Field>
            <Field label={t('graphEdit.description')}>
              <Textarea rows={2} value={epicDesc} onChange={(e) => setEpicDesc(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('graphEdit.status')}>
                <Select value={epicStatus} onChange={(e) => setEpicStatus(e.target.value)}>
                  {EPIC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`, s.replace(/_/g, ' '))}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('graphEdit.priority')}>
                <Select value={epicPriority} onChange={(e) => setEpicPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{t(`priority.${p}`)}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('graphEdit.assignee')}>
              <Select value={epicAssignee} onChange={(e) => setEpicAssignee(e.target.value)}>
                <option value="">{t('workItemDetail.unassigned')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.jobRole.toUpperCase()})</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('graphEdit.startDate')}>
                <Input type="date" value={epicStartDate} onChange={(e) => setEpicStartDate(e.target.value)} />
              </Field>
              <Field label={t('graphEdit.dueDate')}>
                <Input type="date" value={epicDueDate} onChange={(e) => setEpicDueDate(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" onClick={saveEpic} disabled={!epicTitle.trim()}>
                {t('common.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <div className="flex-1" />
              <button
                onClick={handleDelete}
                className={`text-xs font-medium ${confirmDelete ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
              >
                {confirmDelete ? t('graphEdit.confirmDelete') : t('common.delete')}
              </button>
            </div>
          </>
        ) : (
          <>
            <Field label={t('graphEdit.name')}>
              <Input value={sprintName} onChange={(e) => setSprintName(e.target.value)} />
            </Field>
            <Field label={t('graphEdit.goal')}>
              <Textarea rows={2} value={sprintGoal} onChange={(e) => setSprintGoal(e.target.value)} />
            </Field>
            <Field label={t('graphEdit.status')}>
              <Select value={sprintStatus} onChange={(e) => setSprintStatus(e.target.value)}>
                {SPRINT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`, s.replace(/_/g, ' '))}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('graphEdit.startDate')}>
                <Input type="date" value={sprintStartDate} onChange={(e) => setSprintStartDate(e.target.value)} />
              </Field>
              <Field label={t('graphEdit.endDate')}>
                <Input type="date" value={sprintEndDate} onChange={(e) => setSprintEndDate(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" onClick={saveSprint} disabled={!sprintName.trim()}>
                {t('common.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <div className="flex-1" />
              <button
                onClick={handleDelete}
                className={`text-xs font-medium ${confirmDelete ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
              >
                {confirmDelete ? t('graphEdit.confirmDelete') : t('common.delete')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}
