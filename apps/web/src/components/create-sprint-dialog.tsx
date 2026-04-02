import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea } from '@projecta/ui';
import { useCreateSprint } from '../hooks/use-sprints';

interface Props {
  projectId: string;
}

export function CreateSprintDialog({ projectId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const create = useCreateSprint(projectId);

  const submit = () => {
    if (!name.trim()) return;
    const data: Record<string, unknown> = { name: name.trim() };
    if (goal.trim()) data.goal = goal.trim();
    if (startDate) data.start_date = startDate;
    if (endDate) data.end_date = endDate;
    create.mutate(data, {
      onSuccess: () => {
        setName('');
        setGoal('');
        setStartDate('');
        setEndDate('');
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{t('createSprint.button')}</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('createSprint.title')}</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createSprint.nameLabel')}</label>
                <Input
                  autoFocus
                  placeholder={t('createSprint.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createSprint.goalLabel')}</label>
                <Textarea
                  placeholder={t('createSprint.goalPlaceholder')}
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-500">{t('createSprint.startDateLabel')}</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-500">{t('createSprint.endDateLabel')}</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={submit} disabled={!name.trim() || create.isPending}>
                  {t('common.create')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
