export type WorkItemType = 'story' | 'bug' | 'task';

/** @deprecated Use WorkflowState instead. Kept for backwards compatibility during transition. */
export type WorkItemStatus = string;

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export interface WorkflowState {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  color: string;
  position: number;
  isInitial: boolean;
  isTerminal: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DesignAttachmentStatus = 'linked' | 'stale' | 'approved' | 'in_review';

export type DesignAttachmentType = 'figma' | 'url' | 'image';

export interface Epic {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  priority: Priority;
  orderIndex: number;
  startDate: string | null;
  dueDate: string | null;
  targetDate: string | null;
  initiativeId: string | null;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  projectId: string;
  epicId: string | null;
  parentId: string | null; // tasks nested under stories
  type: WorkItemType;
  title: string;
  description: Record<string, unknown> | null; // Tiptap JSON
  workflowStateId: string;
  isCancelled: boolean;
  // Embedded state info from API JOIN
  stateName: string;
  stateSlug: string;
  stateColor: string;
  statePosition: number;
  stateIsTerminal: boolean;
  stateIsInitial: boolean;
  priority: Priority;
  assigneeId: string | null;
  storyPoints: number | null;
  pointsUsed: number | null;
  labels: string[];
  orderIndex: number;
  startDate: string | null;
  dueDate: string | null;
  targetDate: string | null;
  preConditions: Record<string, unknown> | null;
  postConditions: Record<string, unknown> | null;
  designReady: boolean;
  designLink: string | null;
  isBlocked: boolean;
  blockedReason: string | null;
  sourceTestResultId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** BDD-style acceptance criterion: Given / When / Then */
export interface AcceptanceCriterion {
  id: string;
  workItemId: string;
  given: string;
  when: string;
  then: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemDod {
  workItemId: string;
  dodItemId: string;
  checked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
}

export interface Comment {
  id: string;
  workItemId: string;
  userId: string;
  body: Record<string, unknown>; // Tiptap JSON
  createdAt: string;
  updatedAt: string;
}

export interface DesignAttachment {
  id: string;
  workItemId: string;
  type: DesignAttachmentType;
  url: string;
  title: string | null;
  figmaFileKey: string | null;
  figmaNodeId: string | null;
  figmaLockedVersion: string | null;
  figmaCurrentVersion: string | null;
  figmaStatus: DesignAttachmentStatus | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Impediment {
  id: string;
  workItemId: string;
  raisedBy: string;
  description: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export type DependencyType = 'depends_on' | 'relates_to';
export type DependencyStrength = 'hard' | 'soft';

export interface WorkItemDependency {
  id: string;
  sourceId: string;
  targetId: string;
  type: DependencyType;
  strength: DependencyStrength;
  createdBy: string;
  createdAt: string;
  targetTitle: string;
  targetType: string;
}
