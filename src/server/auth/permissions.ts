export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

/**
 * Capability model. Routes and server actions ask for a capability, never for a
 * role directly, so the matrix below is the single place permissions change.
 */
export type Capability =
  | 'org:read'
  | 'org:manage'
  | 'billing:manage'
  | 'team:manage'
  | 'brand:write'
  | 'brand:delete'
  | 'product:write'
  | 'product:delete'
  | 'campaign:write'
  | 'campaign:generate'
  | 'campaign:approve'
  | 'campaign:schedule'
  | 'campaign:publish'
  | 'campaign:delete'
  | 'media:write'
  | 'social:connect'
  | 'analytics:read';

const VIEWER: Capability[] = ['org:read', 'analytics:read'];

const EDITOR: Capability[] = [
  ...VIEWER,
  'brand:write',
  'product:write',
  'campaign:write',
  'campaign:generate',
  'campaign:schedule',
  'media:write',
];

const ADMIN: Capability[] = [
  ...EDITOR,
  'team:manage',
  'brand:delete',
  'product:delete',
  'campaign:approve',
  'campaign:publish',
  'campaign:delete',
  'social:connect',
];

const OWNER: Capability[] = [...ADMIN, 'org:manage', 'billing:manage'];

const MATRIX: Record<MemberRole, ReadonlySet<Capability>> = {
  viewer: new Set(VIEWER),
  editor: new Set(EDITOR),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

export function can(role: MemberRole, capability: Capability): boolean {
  return MATRIX[role].has(capability);
}

export function capabilitiesFor(role: MemberRole): Capability[] {
  return [...MATRIX[role]];
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Full access including billing and organization settings.',
  admin: 'Manage brands, campaigns, publishing, social accounts and team members.',
  editor: 'Create and edit brands, products and campaigns. Cannot approve or publish.',
  viewer: 'Read-only access to campaigns and analytics.',
};
