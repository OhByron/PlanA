import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select } from '@projecta/ui';
import type { WorkItemType } from '@projecta/types';
import { useCreateWorkItem } from '../hooks/use-work-items';
import { useEpics } from '../hooks/use-epics';

interface Props {
  projectId: string;
  onClose: () => void;
}

export function QuickCreateWorkItem({ projectId, onClose }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkItemType>('story');
  const [epicId, setEpicId] = useState('');
  const create = useCreateWorkItem(projectId);
  const { data: epics = [] } = useEpics(projectId);

  const submit = () => {
    if (!title.trim()) return;
    const data: Record<string, unknown> = { type, title: title.trim() };
    if (epicId) data.epic_id = epicId;
    create.mutate(
      data,
      { onSuccess: () => { setTitle(''); onClose(); } },
    );
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/30 p-3">
      <Select
        value={type}
        onChange={(e) => setType(e.target.value as WorkItemType)}
        className="w-24"
        aria-label="Item type"
      >
        <option value="story">{t('type.story')}</option>
        <option value="bug">{t('type.bug')}</option>
        <option value="task">{t('type.task')}</option>
      </Select>
      <Select
        value={epicId}
        onChange={(e) => setEpicId(e.target.value)}
        className="w-40"
        aria-label="Epic"
      >
        <option value="">{epics.length === 1 ? epics[0]!.title : t('quickCreate.selectEpic')}</option>
        {epics.length > 1 && epics.map((e) => (
          <option key={e.id} value={e.id}>{e.title}</option>
        ))}
      </Select>
      <Input
        autoFocus
        placeholder={t('quickCreate.placeholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onClose();
        }}
        className="flex-1"
        aria-label="Item title"
      />
      <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending}>
        {t('common.create')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
