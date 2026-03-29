import { useState } from 'react';
import { Button, Input, Select } from '@projecta/ui';
import type { WorkItemType } from '@projecta/types';
import { useCreateWorkItem } from '../hooks/use-work-items';

interface Props {
  projectId: string;
  onClose: () => void;
}

export function QuickCreateWorkItem({ projectId, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkItemType>('story');
  const create = useCreateWorkItem(projectId);

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      { type, title: title.trim() },
      { onSuccess: () => { setTitle(''); onClose(); } },
    );
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/30 p-3">
      <Select
        value={type}
        onChange={(e) => setType(e.target.value as WorkItemType)}
        className="w-24"
      >
        <option value="story">Story</option>
        <option value="bug">Bug</option>
        <option value="task">Task</option>
      </Select>
      <Input
        autoFocus
        placeholder="What needs to be done?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onClose();
        }}
        className="flex-1"
      />
      <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending}>
        Create
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}
