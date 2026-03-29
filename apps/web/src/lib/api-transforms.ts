/**
 * Transform layer between the Go API's snake_case JSON and the
 * camelCase types defined in @projecta/types.
 *
 * This is the ONLY file that should know about snake_case field names.
 */

import type {
  Organization,
  Team,
  Project,
  WorkItem,
  Epic,
  Sprint,
  AcceptanceCriterion,
  Comment,
} from '@projecta/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Primitives ---

export function toOrg(w: any): Organization {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function toTeam(w: any): Team {
  return {
    id: w.id,
    organizationId: w.organization_id,
    name: w.name,
    slug: w.slug,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export interface TeamMemberWire {
  user_id: string;
  role: string;
  job_role: string | null;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface TeamMember {
  userId: string;
  role: string;
  jobRole: string | null;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export function toTeamMember(w: TeamMemberWire): TeamMember {
  return {
    userId: w.user_id,
    role: w.role,
    jobRole: w.job_role,
    email: w.email,
    name: w.name,
    avatarUrl: w.avatar_url,
    createdAt: w.created_at,
  };
}

export function toProject(w: any): Project {
  return {
    id: w.id,
    teamId: w.team_id,
    name: w.name,
    slug: w.slug,
    description: w.description,
    methodology: w.methodology,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function toWorkItem(w: any): WorkItem {
  return {
    id: w.id,
    projectId: w.project_id,
    epicId: w.epic_id,
    parentId: w.parent_id,
    type: w.type,
    title: w.title,
    description: w.description,
    status: w.status,
    priority: w.priority,
    assigneeId: w.assignee_id,
    storyPoints: w.story_points,
    labels: w.labels ?? [],
    orderIndex: w.order_index,
    isBlocked: w.is_blocked,
    blockedReason: w.blocked_reason,
    createdBy: w.created_by,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function toEpic(w: any): Epic & { assigneeId?: string | null } {
  return {
    id: w.id,
    projectId: w.project_id,
    title: w.title,
    description: w.description,
    status: w.status,
    priority: w.priority,
    orderIndex: w.order_index,
    assigneeId: w.assignee_id ?? null,
    createdBy: w.created_by,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function toSprint(w: any): Sprint {
  return {
    id: w.id,
    projectId: w.project_id,
    name: w.name,
    goal: w.goal,
    startDate: w.start_date,
    endDate: w.end_date,
    status: w.status,
    velocity: w.velocity,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function toAcceptanceCriterion(w: any): AcceptanceCriterion {
  return {
    id: w.id,
    workItemId: w.work_item_id,
    given: w.given_clause,
    when: w.when_clause,
    then: w.then_clause,
    orderIndex: w.order_index,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

export function toComment(w: any): Comment {
  return {
    id: w.id,
    workItemId: w.work_item_id,
    userId: w.user_id,
    body: w.body,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// --- OrgDetail (full org fields for management UI) ---

export interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toOrgDetail(w: any): OrgDetail {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    contactName: w.contact_name,
    contactEmail: w.contact_email,
    contactPhone: w.contact_phone,
    addressLine1: w.address_line1,
    addressLine2: w.address_line2,
    city: w.city,
    state: w.state,
    postalCode: w.postal_code,
    country: w.country,
    archivedAt: w.archived_at,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

// --- User (from /api/me) ---

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function toMe(w: any): MeResponse {
  return {
    id: w.id,
    email: w.email,
    name: w.name,
    avatarUrl: w.avatar_url,
  };
}
