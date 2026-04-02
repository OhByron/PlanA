import type { Priority } from '@projecta/types';
import { cn } from '@projecta/ui';
import { useTranslation } from 'react-i18next';

const priorityConfig: Record<Priority, { color: string; icon: string }> = {
  urgent: { color: 'text-red-600', icon: '⬆⬆' },
  high: { color: 'text-orange-500', icon: '⬆' },
  medium: { color: 'text-yellow-500', icon: '—' },
  low: { color: 'text-blue-400', icon: '⬇' },
};

export function PriorityIndicator({ priority, showLabel = false }: { priority: Priority; showLabel?: boolean }) {
  const { t } = useTranslation();
  const config = priorityConfig[priority];
  const label = t(`priority.${priority}`);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', config.color)} title={label}>
      <span>{config.icon}</span>
      {showLabel && <span>{label}</span>}
    </span>
  );
}
