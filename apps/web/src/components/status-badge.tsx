import { Badge } from '@projecta/ui';
import type { WorkItemStatus } from '@projecta/types';

const statusConfig: Record<WorkItemStatus, { label: string; variant: 'secondary' | 'default' | 'warning' | 'success' | 'outline' }> = {
  backlog: { label: 'Backlog', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'default' },
  in_review: { label: 'In Review', variant: 'warning' },
  done: { label: 'Done', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const config = statusConfig[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
