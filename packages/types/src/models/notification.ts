export type NotificationType =
  | 'assigned'
  | 'mentioned'
  | 'status_changed'
  | 'comment_added'
  | 'impediment_raised'
  | 'design_stale';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  workItemId: string | null;
  actorId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
