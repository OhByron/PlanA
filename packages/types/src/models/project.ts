export type Methodology = 'scrum' | 'kanban' | 'shape_up';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface Project {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string | null;
  methodology: Methodology;
  status: ProjectStatus | null;
  dueDate: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sprintDurationWeeks: number;
  defaultProjectMonths: number;
  defaultEpicWeeks: number;
  archivedAt: string | null;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface DodItem {
  id: string;
  projectId: string;
  text: string;
  orderIndex: number;
  createdAt: string;
}
