export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  /** Permission codes granted through the user's roles (see PermissionCode for the catalogue). */
  permissions: ReadonlySet<string>;
}

/** Public user representation returned by /auth/login and /auth/me. */
export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  lastLoginAt: string | null;
}
