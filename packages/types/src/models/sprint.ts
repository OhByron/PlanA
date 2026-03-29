export type SprintStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: string | null; // yyyy-mm-dd
  endDate: string | null;
  status: SprintStatus;
  velocity: number | null; // calculated on close
  createdAt: string;
  updatedAt: string;
}

export interface SprintItem {
  sprintId: string;
  workItemId: string;
  orderIndex: number;
  addedAt: string;
}
