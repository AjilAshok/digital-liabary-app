export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  lastLoginAt: string | null;
}

export interface AuthUserResponse {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Permission codes used by the UI. The backend is the source of truth and enforces every check;
 * the UI only uses them to hide navigation and actions the user cannot perform.
 */
export const Permissions = {
  DASHBOARD_READ: 'dashboard.read',
  ROLES_READ: 'roles.read',
  SETTINGS_MANAGE: 'settings.manage',
  MEMBERS_READ: 'members.read',
  CATALOGUE_READ: 'catalogue.read',
  CATALOGUE_WRITE: 'catalogue.write',
  COPIES_READ: 'copies.read',
  COPIES_WRITE: 'copies.write',
  LOCATIONS_READ: 'locations.read',
  LOCATIONS_MANAGE: 'locations.manage',
  SCANNER_USE: 'scanner.use',
  IMPORTS_READ: 'imports.read',
  IMPORTS_MANAGE: 'imports.manage',
} as const;
