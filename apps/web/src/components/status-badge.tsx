import { Badge } from '@projecta/ui';
import type { WorkItemStatus } from '@projecta/types';
import { useTranslation } from 'react-i18next';

const statusVariant: Record<WorkItemStatus, 'secondary' | 'default' | 'warning' | 'success' | 'outline'> = {
  backlog: 'secondary',
  ready: 'outline',
  in_progress: 'default',
  in_review: 'warning',
  done: 'success',
  cancelled: 'secondary',
};

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const { t } = useTranslation();
  const variant = statusVariant[status] ?? 'secondary';
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>;
}
