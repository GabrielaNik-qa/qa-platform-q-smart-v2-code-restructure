import type { Role } from './roles.js';

/**
 * Who may do what, per role: today's permission matrix (docs/audit/SECURITY_AUDIT.md), the same in v2.
 * The server checks every route against it. "Roles & permissions" in Admin only hides menu items, as today.
 *
 * - all:         every record of the company
 * - workspace:   only the records of people in the person's own workspaces
 * - own:         only the person's own records
 * - participant: only the ones the person takes part in (calibrations)
 */
export type Scope = 'all' | 'workspace' | 'own' | 'participant';
type Rule = Partial<Record<Role, Scope>>;

const STAFF_WS: Rule = { admin: 'all', reviewer: 'workspace', lead: 'workspace', trainer: 'workspace' };
const STAFF_WS_AGENT_OWN: Rule = { ...STAFF_WS, agent: 'own' };
const ADMIN: Rule = { admin: 'all' };
const ADMIN_REVIEWER: Rule = { admin: 'all', reviewer: 'all' };
const STAFF_ALL: Rule = { admin: 'all', reviewer: 'all', lead: 'all', trainer: 'all' };

export const PERMISSIONS = {
  // Quality
  'reviews.read': STAFF_WS_AGENT_OWN,
  'reviews.write': { admin: 'all', reviewer: 'workspace' },
  'disputes.open': { agent: 'own' },
  'disputes.write': { admin: 'all', reviewer: 'workspace', agent: 'own' },
  'disputes.resolve': { admin: 'all', reviewer: 'workspace' },
  'scorecards.read': { ...STAFF_WS, agent: 'workspace' },
  'scorecards.write': ADMIN,
  'rootCauses.write': ADMIN_REVIEWER,
  'flags.read': STAFF_WS_AGENT_OWN,
  'flags.write': STAFF_WS,
  // Reviewer QA: checks of reviews made by others (today: staff read them; admins, reviewers and team leads write them)
  'reviewerQa.read': STAFF_WS,
  'reviewerQa.write': { admin: 'all', reviewer: 'workspace', lead: 'workspace' },
  // Pins: moments of conversations to talk about in coaching (today: staff write them; an agent reads their own)
  'pins.read': STAFF_WS_AGENT_OWN,
  'pins.write': STAFF_WS,
  'calibrations.take': { admin: 'all', reviewer: 'participant', lead: 'participant', trainer: 'participant' },
  'autoqa.read': STAFF_WS_AGENT_OWN,
  'autoqa.write': { admin: 'all', reviewer: 'workspace' },
  // Company, people and settings
  'people.manage': ADMIN, // users, teams, workspaces, skills and languages, sign-in settings
  'people.read': { ...STAFF_WS, agent: 'workspace' },
  // My account (profile, skills and languages): the route only ever changes the person's own account
  'account.edit': { admin: 'all', reviewer: 'own', lead: 'own', trainer: 'own', agent: 'own' },
  'settings.readAll': ADMIN,
  'settings.write': ADMIN, // pass rates and the other company settings // the others read settings without e-mail templates and notification rules
  'activity.readAll': ADMIN,
  // My activity: what I did and what was done to my account
  'activity.readOwn': { admin: 'all', reviewer: 'own', lead: 'own', trainer: 'own', agent: 'own' },
  'dashboards.shareViews': ADMIN_REVIEWER,
  // Planning › Review planner: staff read the plan (the Dashboard shows it too); admins and reviewers change it
  'planner.read': STAFF_ALL,
  'planner.write': ADMIN_REVIEWER,
  // Coaching and tasks
  'tasks.read': STAFF_WS_AGENT_OWN,
  'tasks.write': STAFF_WS,
  'tasks.progress': STAFF_WS_AGENT_OWN,
  'coaching.read': STAFF_WS_AGENT_OWN,
  'oneToOnes.write': { admin: 'all', reviewer: 'workspace', lead: 'workspace' },
  'coaching.write': { admin: 'all', reviewer: 'workspace', trainer: 'workspace' },
  'sessions.sign': { agent: 'own' },
  // Learning (agents read without the quiz answers)
  'learning.read': { ...STAFF_ALL, agent: 'all' },
  'learning.write': STAFF_ALL,
  'learning.progress': STAFF_WS,
  'simulations.read': STAFF_WS_AGENT_OWN,
  'simulations.save': STAFF_WS_AGENT_OWN,
  // Performance, reports and CX
  'reports.read': { admin: 'all', reviewer: 'own', lead: 'own', trainer: 'own' },
  // a saved report: your own (an admin: anyone's); the shared ones are read by the staff too
  'reports.write': { admin: 'all', reviewer: 'own', lead: 'own', trainer: 'own' },
  'goals.read': { ...STAFF_ALL, agent: 'own' },
  'goals.write': { admin: 'all', reviewer: 'all', lead: 'all' },
  'improvementPlans.read': { ...STAFF_ALL, agent: 'own' },
  'improvementPlans.write': STAFF_ALL,
  // everyone reads the kudos wall and the leaderboard (as today)
  'recognition.read': { ...STAFF_ALL, agent: 'all' },
  'recognition.write': { ...STAFF_ALL, agent: 'own' },
  'risks.write': STAFF_ALL,
  'surveys.read': { ...STAFF_ALL, agent: 'own' },
  'surveys.write': { admin: 'all', reviewer: 'all', lead: 'all' },
  'ai.import': STAFF_ALL,
} as const satisfies Record<string, Rule>;

export type Permission = keyof typeof PERMISSIONS;

/** How far a role may go with an action, or null when it may not do it at all. */
export function scopeOf(role: Role, permission: Permission): Scope | null {
  const rule: Rule = PERMISSIONS[permission];
  return rule[role] ?? null;
}

export const can = (role: Role, permission: Permission): boolean => scopeOf(role, permission) !== null;
