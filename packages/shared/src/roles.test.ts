import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { LANGUAGES, ROLE_LABELS, ROLES, isStaff, roleFromCurrentApp, roleSchema } from './roles.js';

describe('roles', () => {
  it('has the five roles of v2, with "reviewer" instead of "qa"', () => {
    expect(ROLES).toEqual(['admin', 'reviewer', 'lead', 'trainer', 'agent']);
    expect(roleSchema.safeParse('qa').success).toBe(false);
  });

  it('counts every role except agent as staff (the Administration team)', () => {
    expect(ROLES.filter(isStaff)).toEqual(['admin', 'reviewer', 'lead', 'trainer']);
  });

  it('turns "qa" from today\'s data into "reviewer" and refuses unknown roles', () => {
    expect(roleFromCurrentApp('qa')).toBe('reviewer');
    expect(roleFromCurrentApp('agent')).toBe('agent');
    expect(() => roleFromCurrentApp('boss')).toThrow(/Unknown role/);
  });

  it("understands every role in today's demo data", async () => {
    const data = JSON.parse(await readFile(new URL('../../../current-app/data.json', import.meta.url), 'utf8')) as {
      users: { role: string }[];
    };
    expect(data.users.length).toBeGreaterThan(0);
    for (const user of data.users) expect(ROLES).toContain(roleFromCurrentApp(user.role));
  });

  it('names every role in English, Bulgarian and French', () => {
    for (const lang of LANGUAGES) for (const role of ROLES) expect(ROLE_LABELS[lang][role]).toBeTruthy();
    expect(ROLE_LABELS.bg.reviewer).toBe('Оценител');
    expect(ROLE_LABELS.fr.reviewer).toBe('Évaluateur');
  });
});
