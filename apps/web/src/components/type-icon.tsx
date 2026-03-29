import type { WorkItemType } from '@projecta/types';
import { cn } from '@projecta/ui';

const typeConfig: Record<WorkItemType, { label: string; color: string }> = {
  story: { label: 'Story', color: 'text-green-600 bg-green-50' },
  bug: { label: 'Bug', color: 'text-red-600 bg-red-50' },
  task: { label: 'Task', color: 'text-blue-600 bg-blue-50' },
};

export function TypeIcon({ type }: { type: WorkItemType }) {
  const config = typeConfig[type];
  return (
    <span
      className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold', config.color)}
      title={config.label}
    >
      {type[0]!.toUpperCase()}
    </span>
  );
}
