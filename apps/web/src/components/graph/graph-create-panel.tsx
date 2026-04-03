import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea, Select } from '@projecta/ui';
import type { Priority, Sprint } from '@projecta/types';

type CreateMode = 'epic' | 'sprint' | null;

interface Props {
  mode: CreateMode;
  onClose: () => void;
  onCreateEpic: (data: Record<string, unknown>) => void;
  onCreateSprint: (data: Record<string, unknown>) => void;
  existingSprints?: Sprint[];
  sprintDurationWeeks?: number;
  epicDurationWeeks?: number;
}

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

export function GraphCreatePanel({ mode, onClose, onCreateEpic, onCreateSprint, existingSprints = [], sprintDurationWeeks = 2, epicDurationWeeks = 6 }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Check for overlapping sprints
  const overlapWarning = useMemo(() => {
    if (mode !== 'sprint' || !startDate || !endDate) return null;
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);
    if (newEnd < newStart) return t('graph.endBeforeStart');

    const overlapping = existingSprints.filter((s) => {
      if (!s.startDate || !s.endDate) return false;
      if (s.status === 'cancelled') return false;
      const sStart = new Date(s.startDate);
      const sEnd = new Date(s.endDate);
      return newStart <= sEnd && newEnd >= sStart;
    });

    if (overlapping.length === 0) return null;
    return t('graph.sprintOverlapWarning', {
      names: overlapping.map((s) => s.name).join(', '),
    });
  }, [mode, startDate, endDate, existingSprints, t]);

  if (!mode) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (mode === 'epic') {
      onCreateEpic({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        start_date: startDate || undefined,
        due_date: endDate || undefined,
      });
    } else {
      onCreateSprint({
        name: title.trim(),
        goal: description.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
    }
    setTitle('');
    setDescription('');
    setPriority('medium');
    setStartDate('');
    setEndDate('');
    onClose();
  };

  return (
    <div className="absolute right-4 top-14 z-50 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {mode === 'epic' ? t('graph.createEpic') : t('graph.createSprint')}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            {mode === 'epic' ? t('graph.epicTitle') : t('graph.sprintName')}
          </label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === 'epic' ? 'Epic title...' : 'Sprint name...'}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            {mode === 'epic' ? t('graph.description') : t('graph.sprintGoal')}
          </label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={mode === 'epic' ? 'Describe the business goal...' : 'What will this sprint deliver?'}
          />
        </div>

        {mode === 'epic' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">{t('graph.priority')}</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`priority.${p}`)}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              {t('graph.startDate')}
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                // Auto-fill end/due date when empty
                if (e.target.value && !endDate) {
                  const start = new Date(e.target.value);
                  const end = new Date(start);
                  if (mode === 'sprint') {
                    end.setDate(end.getDate() + sprintDurationWeeks * 7 - 1);
                  } else {
                    end.setDate(end.getDate() + epicDurationWeeks * 7 - 1);
                  }
                  setEndDate(end.toISOString().slice(0, 10));
                }
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              {mode === 'epic' ? t('graph.dueDate') : t('graph.endDate')}
            </label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <p className="mt-0.5 text-[10px] text-gray-400">
              {mode === 'sprint'
                ? t('graph.sprintDuration', { weeks: sprintDurationWeeks })
                : t('graph.epicDuration', { weeks: epicDurationWeeks })}
            </p>
          </div>
        </div>

        {/* Sprint overlap warning */}
        {overlapWarning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {overlapWarning}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>
            {mode === 'epic' ? t('graph.createEpic') : t('graph.createSprint')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </div>
  );
}
