import type { Priority } from '@projecta/types';
import { cn } from '@projecta/ui';

const priorityConfig: Record<Priority, { label: string; color: string; icon: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-600', icon: '\u2B06\u2B06' },
  high: { label: 'High', color: 'text-orange-500', icon: '\u2B06' },
  medium: { label: 'Medium', color: 'text-yellow-500', icon: '\u2014' },
  low: { label: 'Low', color: 'text-blue-400', icon: '\u2B07' },
};

export function PriorityIndicator({ priority, showLabel = false }: { priority: Priority; showLabel?: boolean }) {
  const config = priorityConfig[priority];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', config.color)} title={config.label}>
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
