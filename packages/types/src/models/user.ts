export type UserRole = 'admin' | 'member' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  members?: OrganizationMember[];
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: UserRole;
  user?: User;
  createdAt: string;
}

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  members?: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: UserRole;
  user?: User;
  createdAt: string;
}
