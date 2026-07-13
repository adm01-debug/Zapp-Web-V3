import { describe, it, expect } from 'vitest';
import {
  ROLE_RANK,
  ADMIN_RESOURCES,
  canAccessAdminResource,
  highestRole,
  type CanonicalRole,
  type AdminResource,
} from '../roleMapping';

// ── ROLE_RANK ─────────────────────────────────────────────────────────────────

describe('ROLE_RANK', () => {
  it('has exactly 5 roles', () => {
    expect(Object.keys(ROLE_RANK)).toHaveLength(5);
  });

  it('dev has the highest rank (100)', () => {
    expect(ROLE_RANK.dev).toBe(100);
  });

  it('admin rank is 80', () => {
    expect(ROLE_RANK.admin).toBe(80);
  });

  it('supervisor rank is 60', () => {
    expect(ROLE_RANK.supervisor).toBe(60);
  });

  it('agent rank is 40', () => {
    expect(ROLE_RANK.agent).toBe(40);
  });

  it('viewer has the lowest rank (20)', () => {
    expect(ROLE_RANK.viewer).toBe(20);
  });

  it('ranks are in strictly descending order: dev > admin > supervisor > agent > viewer', () => {
    expect(ROLE_RANK.dev).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.supervisor);
    expect(ROLE_RANK.supervisor).toBeGreaterThan(ROLE_RANK.agent);
    expect(ROLE_RANK.agent).toBeGreaterThan(ROLE_RANK.viewer);
  });
});

// ── ADMIN_RESOURCES ───────────────────────────────────────────────────────────

describe('ADMIN_RESOURCES', () => {
  const EXPECTED_KEYS: AdminResource[] = ['dlq', 'dlqAudit', 'transfersAll', 'rlsDeniedLog'];

  it('has exactly 4 resources', () => {
    expect(Object.keys(ADMIN_RESOURCES)).toHaveLength(4);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(ADMIN_RESOURCES[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" requires minRole = "supervisor"', (key) => {
    expect(ADMIN_RESOURCES[key].minRole).toBe('supervisor');
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(typeof ADMIN_RESOURCES[key].label).toBe('string');
    expect(ADMIN_RESOURCES[key].label.length).toBeGreaterThan(0);
  });
});

// ── canAccessAdminResource — null / undefined role ────────────────────────────

describe('canAccessAdminResource — null / undefined role', () => {
  it('returns false for null role', () => {
    expect(canAccessAdminResource(null, 'dlq')).toBe(false);
  });

  it('returns false for undefined role', () => {
    expect(canAccessAdminResource(undefined, 'dlq')).toBe(false);
  });
});

// ── canAccessAdminResource — roles that CAN access ────────────────────────────

const ALLOWED_ROLES: CanonicalRole[] = ['dev', 'admin', 'supervisor'];
const RESOURCE_KEYS: AdminResource[] = ['dlq', 'dlqAudit', 'transfersAll', 'rlsDeniedLog'];

describe('canAccessAdminResource — roles with sufficient rank', () => {
  it.each(ALLOWED_ROLES)('"%s" can access dlq', (role) => {
    expect(canAccessAdminResource(role, 'dlq')).toBe(true);
  });

  it.each(RESOURCE_KEYS)('supervisor can access "%s"', (resource) => {
    expect(canAccessAdminResource('supervisor', resource)).toBe(true);
  });

  it.each(RESOURCE_KEYS)('admin can access "%s"', (resource) => {
    expect(canAccessAdminResource('admin', resource)).toBe(true);
  });

  it.each(RESOURCE_KEYS)('dev can access "%s"', (resource) => {
    expect(canAccessAdminResource('dev', resource)).toBe(true);
  });
});

// ── canAccessAdminResource — roles that CANNOT access ────────────────────────

const DENIED_ROLES: CanonicalRole[] = ['agent', 'viewer'];

describe('canAccessAdminResource — roles with insufficient rank', () => {
  it.each(DENIED_ROLES)('"%s" cannot access dlq', (role) => {
    expect(canAccessAdminResource(role, 'dlq')).toBe(false);
  });

  it.each(RESOURCE_KEYS)('agent cannot access "%s"', (resource) => {
    expect(canAccessAdminResource('agent', resource)).toBe(false);
  });

  it.each(RESOURCE_KEYS)('viewer cannot access "%s"', (resource) => {
    expect(canAccessAdminResource('viewer', resource)).toBe(false);
  });
});

// ── highestRole ───────────────────────────────────────────────────────────────

describe('highestRole — empty / invalid inputs', () => {
  it('returns null for an empty array', () => {
    expect(highestRole([])).toBeNull();
  });

  it('returns null for an array of only unknown roles', () => {
    expect(highestRole(['unknown', 'fakeRole'])).toBeNull();
  });
});

describe('highestRole — single role', () => {
  const ROLES: CanonicalRole[] = ['dev', 'admin', 'supervisor', 'agent', 'viewer'];

  it.each(ROLES)('returns "%s" when it is the only role', (role) => {
    expect(highestRole([role])).toBe(role);
  });
});

describe('highestRole — multiple roles', () => {
  it('returns "dev" when dev is in the list', () => {
    expect(highestRole(['viewer', 'dev', 'agent'])).toBe('dev');
  });

  it('returns "admin" when dev is absent', () => {
    expect(highestRole(['agent', 'admin', 'supervisor'])).toBe('admin');
  });

  it('returns "supervisor" when only lower roles are combined with it', () => {
    expect(highestRole(['viewer', 'agent', 'supervisor'])).toBe('supervisor');
  });

  it('ignores unknown strings mixed with valid roles', () => {
    expect(highestRole(['unknown', 'agent', 'badRole'])).toBe('agent');
  });

  it('handles duplicate roles', () => {
    expect(highestRole(['viewer', 'viewer', 'agent', 'agent'])).toBe('agent');
  });
});
