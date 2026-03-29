export type Methodology = 'scrum' | 'kanban' | 'shape_up';

export interface Project {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string | null;
  methodology: Methodology;
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
