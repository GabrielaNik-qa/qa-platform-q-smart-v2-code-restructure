// Spot checks against today's permission matrix (docs/audit/SECURITY_AUDIT.md).
import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS, scopeOf } from './permissions.js';
import { ROLES } from './roles.js';

describe('permissions', () => {
  it('lets only admins manage people, teams, workspaces and settings', () => {
    expect(ROLES.filter((r) => can(r, 'people.manage'))).toEqual(['admin']);
    expect(ROLES.filter((r) => can(r, 'settings.readAll'))).toEqual(['admin']);
    expect(ROLES.filter((r) => can(r, 'activity.readAll'))).toEqual(['admin']);
  });

  it('shows reviews to everyone, but only within their reach', () => {
    expect(ROLES.map((r) => scopeOf(r, 'reviews.read'))).toEqual(['all', 'workspace', 'workspace', 'workspace', 'own']);
    expect(ROLES.filter((r) => can(r, 'reviews.write'))).toEqual(['admin', 'reviewer']);
  });

  it('lets only agents open a dispute (on their own review), and admins and reviewers resolve it', () => {
    expect(ROLES.filter((r) => can(r, 'disputes.open'))).toEqual(['agent']);
    expect(ROLES.filter((r) => can(r, 'disputes.resolve'))).toEqual(['admin', 'reviewer']);
  });

  it('keeps one-to-ones for team leads and coaching for trainers, as today', () => {
    expect(ROLES.filter((r) => can(r, 'oneToOnes.write'))).toEqual(['admin', 'reviewer', 'lead']);
    expect(ROLES.filter((r) => can(r, 'coaching.write'))).toEqual(['admin', 'reviewer', 'trainer']);
  });

  it('gives admins every right that exists for anyone, always for the whole company', () => {
    for (const [permission, rule] of Object.entries(PERMISSIONS)) {
      const onlyAgents = Object.keys(rule).every((role) => role === 'agent');
      if (!onlyAgents) expect(scopeOf('admin', permission as keyof typeof PERMISSIONS), permission).toBe('all');
    }
  });
});
