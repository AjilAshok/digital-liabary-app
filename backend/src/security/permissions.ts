/**
 * Canonical permission catalogue. Routes check these codes in backend middleware.
 * The seed synchronises this list into the `permissions` table.
 *
 * Default role → permission assignments below are DEVELOPMENT DEFAULTS derived from
 * docs/PROJECT_REQUIREMENTS.md §2. Libraries can change role permissions in the database;
 * re-seeding only ADDS missing defaults and never removes permissions an admin granted.
 */
export const PERMISSIONS = {
  // Administration
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_LOGS_READ: 'audit_logs.read',
  // Dashboard & catalogue
  DASHBOARD_READ: 'dashboard.read',
  CATALOGUE_READ: 'catalogue.read',
  CATALOGUE_WRITE: 'catalogue.write',
  CATALOGUE_ARCHIVE: 'catalogue.archive',
  COPIES_READ: 'copies.read',
  COPIES_WRITE: 'copies.write',
  COPIES_CHANGE_STATUS: 'copies.change_status',
  LOCATIONS_READ: 'locations.read',
  LOCATIONS_MANAGE: 'locations.manage',
  // Acquisition
  SCANNER_USE: 'scanner.use',
  IMPORTS_READ: 'imports.read',
  IMPORTS_MANAGE: 'imports.manage',
  PURCHASES_READ: 'purchases.read',
  PURCHASES_MANAGE: 'purchases.manage',
  // Members & circulation
  MEMBERS_READ: 'members.read',
  MEMBERS_MANAGE: 'members.manage',
  CIRCULATION_ISSUE_RETURN: 'circulation.issue_return',
  CIRCULATION_RENEW: 'circulation.renew',
  CIRCULATION_RESERVATIONS: 'circulation.reservations',
  FINES_MANAGE: 'fines.manage',
  FINES_WAIVE: 'fines.waive',
  // Stock audit & reports
  STOCK_AUDITS_READ: 'stock_audits.read',
  STOCK_AUDITS_MANAGE: 'stock_audits.manage',
  REPORTS_READ: 'reports.read',
  REPORTS_EXPORT: 'reports.export',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionCode[] = Object.values(PERMISSIONS);

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
  'users.read': 'View user accounts',
  'users.manage': 'Create, update and deactivate user accounts',
  'roles.read': 'View roles and their permissions',
  'roles.manage': 'Change roles and permission assignments',
  'settings.read': 'View library settings',
  'settings.manage': 'Change library settings and policies',
  'audit_logs.read': 'View the audit log',
  'dashboard.read': 'View dashboard metrics and activity',
  'catalogue.read': 'Search and view books, editions, authors, publishers and categories',
  'catalogue.write': 'Create and edit catalogue records',
  'catalogue.archive': 'Archive catalogue records',
  'copies.read': 'View physical copies',
  'copies.write': 'Register and edit physical copies',
  'copies.change_status': 'Mark copies damaged, missing, under repair or discarded',
  'locations.read': 'View buildings, floors, rooms, racks and shelves',
  'locations.manage': 'Manage locations and move copies',
  'scanner.use': 'Use ISBN scanning and cover OCR',
  'imports.read': 'View old-stock import batches',
  'imports.manage': 'Upload, correct and confirm old-stock imports',
  'purchases.read': 'View suppliers and purchases',
  'purchases.manage': 'Manage suppliers, purchases and receiving',
  'members.read': 'View members',
  'members.manage': 'Create and edit members and member types',
  'circulation.issue_return': 'Issue and return copies',
  'circulation.renew': 'Renew loans',
  'circulation.reservations': 'Manage reservations',
  'fines.manage': 'Record fine payments',
  'fines.waive': 'Waive fines',
  'stock_audits.read': 'View stock verification sessions',
  'stock_audits.manage': 'Run and complete stock verification',
  'reports.read': 'View reports',
  'reports.export': 'Export reports to Excel/PDF',
};

export const ROLE_CODES = {
  ADMIN: 'ADMIN',
  LIBRARIAN: 'LIBRARIAN',
  ASSISTANT: 'ASSISTANT',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

const ADMIN_ONLY: readonly PermissionCode[] = [
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.ROLES_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.AUDIT_LOGS_READ,
];

export const DEFAULT_ROLES: Record<
  RoleCode,
  { name: string; description: string; permissions: readonly PermissionCode[] }
> = {
  ADMIN: {
    name: 'Administrator',
    description: 'Users, permissions, settings, all inventory and reports',
    permissions: ALL_PERMISSIONS,
  },
  LIBRARIAN: {
    name: 'Librarian',
    description: 'Catalogue, scanning, migration, purchases, members, circulation and reports',
    permissions: ALL_PERMISSIONS.filter((p) => !ADMIN_ONLY.includes(p)),
  },
  ASSISTANT: {
    name: 'Library Assistant',
    description: 'Limited catalogue and circulation actions',
    permissions: [
      PERMISSIONS.DASHBOARD_READ,
      PERMISSIONS.CATALOGUE_READ,
      PERMISSIONS.COPIES_READ,
      PERMISSIONS.LOCATIONS_READ,
      PERMISSIONS.SCANNER_USE,
      PERMISSIONS.MEMBERS_READ,
      PERMISSIONS.CIRCULATION_ISSUE_RETURN,
      PERMISSIONS.CIRCULATION_RENEW,
      PERMISSIONS.CIRCULATION_RESERVATIONS,
    ],
  },
};

export function permissionGroup(code: PermissionCode): string {
  return code.split('.')[0] ?? code;
}
