import type { WorkItemType } from '@projecta/types';
import { cn } from '@projecta/ui';
import { useTranslation } from 'react-i18next';

const typeConfig: Record<WorkItemType, { color: string }> = {
  story: { color: 'text-green-600 bg-green-50' },
  bug: { color: 'text-red-600 bg-red-50' },
  task: { color: 'text-blue-600 bg-blue-50' },
};

export function TypeIcon({ type }: { type: WorkItemType }) {
  const { t } = useTranslation();
  const config = typeConfig[type];
  return (
    <span
      className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold', config.color)}
      title={t(`type.${type}`)}
    >
      {type[0]!.toUpperCase()}
    </span>
  );
}
