import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
} from '../../src/security/permissions.js';

describe('permission catalogue', () => {
  it('has unique, well-formed codes with descriptions', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const code of ALL_PERMISSIONS) {
      expect(code).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(PERMISSION_DESCRIPTIONS[code]).toBeTruthy();
    }
  });

  it('gives ADMIN every permission', () => {
    expect([...DEFAULT_ROLES.ADMIN.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('keeps role defaults nested: ASSISTANT ⊂ LIBRARIAN ⊂ ADMIN', () => {
    const librarian = new Set(DEFAULT_ROLES.LIBRARIAN.permissions);
    const admin = new Set(DEFAULT_ROLES.ADMIN.permissions);
    for (const p of DEFAULT_ROLES.ASSISTANT.permissions) expect(librarian.has(p)).toBe(true);
    for (const p of DEFAULT_ROLES.LIBRARIAN.permissions) expect(admin.has(p)).toBe(true);
  });

  it('does not let LIBRARIAN manage users, roles or settings by default', () => {
    const librarian = DEFAULT_ROLES.LIBRARIAN.permissions;
    expect(librarian).not.toContain(PERMISSIONS.USERS_MANAGE);
    expect(librarian).not.toContain(PERMISSIONS.ROLES_MANAGE);
    expect(librarian).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
  });

  it('does not let ASSISTANT change catalogue or copy status by default', () => {
    const assistant = DEFAULT_ROLES.ASSISTANT.permissions;
    expect(assistant).not.toContain(PERMISSIONS.CATALOGUE_WRITE);
    expect(assistant).not.toContain(PERMISSIONS.COPIES_CHANGE_STATUS);
    expect(assistant).not.toContain(PERMISSIONS.ROLES_READ);
  });
});
