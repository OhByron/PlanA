const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ShapeConfig {
  table: string;
  where?: string;
  columns?: string[];
}

export function defineShape(config: ShapeConfig): ShapeConfig {
  return config;
}

/** Validate a UUID before embedding it in a shape WHERE clause */
function assertUUID(value: string, param: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid UUID for parameter '${param}': ${JSON.stringify(value)}`);
  }
}

// ---------------------------------------------------------------------------
// Pre-defined shapes for the core domain
// ---------------------------------------------------------------------------

export function workItemsShape(projectId: string): ShapeConfig {
  assertUUID(projectId, 'projectId');
  return { table: 'work_items', where: `project_id = '${projectId}'` };
}

export function epicsShape(projectId: string): ShapeConfig {
  assertUUID(projectId, 'projectId');
  return { table: 'epics', where: `project_id = '${projectId}'` };
}

export function sprintsShape(projectId: string): ShapeConfig {
  assertUUID(projectId, 'projectId');
  return { table: 'sprints', where: `project_id = '${projectId}'` };
}

export function commentsShape(workItemId: string): ShapeConfig {
  assertUUID(workItemId, 'workItemId');
  return { table: 'comments', where: `work_item_id = '${workItemId}'` };
}

export function acceptanceCriteriaShape(workItemId: string): ShapeConfig {
  assertUUID(workItemId, 'workItemId');
  return { table: 'acceptance_criteria', where: `work_item_id = '${workItemId}'` };
}

export function notificationsShape(userId: string): ShapeConfig {
  assertUUID(userId, 'userId');
  return { table: 'notifications', where: `user_id = '${userId}'` };
}
