import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea, Select } from '@projecta/ui';
import { useCreateEpic } from '../hooks/use-epics';
import { useProjectMembers } from '../hooks/use-project-members';

interface Props {
  projectId: string;
}

export function CreateEpicDialog({ projectId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const create = useCreateEpic(projectId);
  const { data: members = [] } = useProjectMembers(projectId);

  const submit = () => {
    if (!title.trim()) return;
    const data: Record<string, unknown> = {
      title: title.trim(),
      priority,
    };
    if (description.trim()) data.description = description.trim();
    if (assigneeId) data.assignee_id = assigneeId;
    create.mutate(data, {
      onSuccess: () => {
        setTitle('');
        setDescription('');
        setPriority('medium');
        setAssigneeId('');
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{t('createEpic.button')}</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('createEpic.title')}</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createEpic.titleLabel')}</label>
                <Input
                  autoFocus
                  placeholder={t('createEpic.titlePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createEpic.descriptionLabel')}</label>
                <Textarea
                  placeholder={t('createEpic.descriptionPlaceholder')}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createEpic.priorityLabel')}</label>
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="urgent">{t('priority.urgent')}</option>
                  <option value="high">{t('priority.high')}</option>
                  <option value="medium">{t('priority.medium')}</option>
                  <option value="low">{t('priority.low')}</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">{t('createEpic.assigneeLabel')}</label>
                <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">{t('workItemDetail.unassigned')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.jobRole.toUpperCase()})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={submit} disabled={!title.trim() || create.isPending}>
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
