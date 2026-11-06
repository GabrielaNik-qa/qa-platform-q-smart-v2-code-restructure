// The PostgreSQL tables (first draft, refined in each phase).
// Every company table has company_id and sits behind the company wall (migrations/0001_company_wall.sql).
// People are the one exception: a person can belong to several companies, so `users` is shared and
// reaches companies through `memberships`; its wall rule shows a person only to the companies they belong to.
import { ROLES } from '@qsmart/shared';
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const memberRole = pgEnum('member_role', ROLES);

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  pageRules: jsonb('page_rules').$type<PageRules>().notNull().default({}),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Empty for an invitation not yet accepted: it's filled at the first sign-in with the invited, verified e-mail. */
  firebaseUid: text('firebase_uid').unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** the owner of Q-smart (you): creates and manages client companies; belongs to no company because of it */
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  /** the language of the app, saved with the account: the same on every browser and device (empty until chosen) */
  language: text('language'),
  /** My account › Notifications & Confirmations: welcome messages and tips, routine confirmations, dismissed messages */
  prefs: jsonb('prefs').$type<Prefs>().notNull().default({}),
  createdAt: createdAt(),
});

export interface Prefs {
  info?: boolean;
  confirm?: boolean;
  /** "Don't show me this again": message id → when */
  dismissed?: Record<string, string>;
}

/** Admin › Roles & permissions: who sees which page in the menu (it only changes the menu; the server's rules stay). */
export interface PageRules {
  /** page → the roles that see it (instead of today's default) */
  roles?: Record<string, string[]>;
  /** page → membership → a person's own choice, which comes before their role's */
  people?: Record<string, Record<string, boolean>>;
}

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Staff (admins, reviewers, team leads, trainers) are in the Administration team, as today. */
    isAdministration: boolean('is_administration').notNull().default(false),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#2563eb'),
    /** the team lead: a staff membership of the same company (foreign key in migrations/0009_teams_workspaces.sql) */
    leadId: uuid('lead_membership_id'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('teams_company_name').on(t.companyId, t.name),
    // lets other tables point at a team *of the same company* (see memberships)
    unique('teams_id_company').on(t.id, t.companyId),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    teamId: uuid('team_id'),
    /** switched off by an admin: the person keeps their history but can't open this company */
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('memberships_company_user').on(t.companyId, t.userId),
    unique('memberships_id_company').on(t.id, t.companyId),
    index('memberships_user').on(t.userId),
    // the team must belong to the same company: a membership can never point into another company.
    // A team with people in it can't be deleted until they move (today's rule: everyone is in a team).
    foreignKey({
      name: 'memberships_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
  ],
);

/** Workspaces group teams and staff: outside admins, people see only the teams of their own workspaces (as today). */
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#2563eb'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('workspaces_company_name').on(t.companyId, t.name),
    unique('workspaces_id_company').on(t.id, t.companyId),
  ],
);

/** The working teams of a workspace (never Administration). */
export const workspaceTeams = pgTable(
  'workspace_teams',
  {
    companyId: uuid('company_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    teamId: uuid('team_id').notNull(),
  },
  (t) => [
    uniqueIndex('workspace_teams_pair').on(t.workspaceId, t.teamId),
    foreignKey({
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [workspaces.id, workspaces.companyId],
    }).onDelete('cascade'),
    foreignKey({ columns: [t.teamId, t.companyId], foreignColumns: [teams.id, teams.companyId] }).onDelete('cascade'),
  ],
);

/** The staff of a workspace (reviewers, team leads, trainers; admins see everything anyway, agents come with their team). */
export const workspaceStaff = pgTable(
  'workspace_staff',
  {
    companyId: uuid('company_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
  },
  (t) => [
    uniqueIndex('workspace_staff_pair').on(t.workspaceId, t.membershipId),
    foreignKey({
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [workspaces.id, workspaces.companyId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.membershipId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }).onDelete('cascade'),
  ],
);

export const skillKind = pgEnum('skill_kind', ['skill', 'language']);

/** The company's lists of skills and languages: people and teams pick from them. */
export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: skillKind('kind').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    uniqueIndex('skills_company_kind_name').on(t.companyId, t.kind, t.name),
    unique('skills_id_company').on(t.id, t.companyId),
  ],
);

export const membershipSkills = pgTable(
  'membership_skills',
  {
    companyId: uuid('company_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    skillId: uuid('skill_id').notNull(),
  },
  (t) => [
    uniqueIndex('membership_skills_pair').on(t.membershipId, t.skillId),
    foreignKey({
      columns: [t.membershipId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }).onDelete('cascade'),
    foreignKey({ columns: [t.skillId, t.companyId], foreignColumns: [skills.id, skills.companyId] }).onDelete(
      'cascade',
    ),
  ],
);

export const teamSkills = pgTable(
  'team_skills',
  {
    companyId: uuid('company_id').notNull(),
    teamId: uuid('team_id').notNull(),
    skillId: uuid('skill_id').notNull(),
  },
  (t) => [
    uniqueIndex('team_skills_pair').on(t.teamId, t.skillId),
    foreignKey({ columns: [t.teamId, t.companyId], foreignColumns: [teams.id, teams.companyId] }).onDelete('cascade'),
    foreignKey({ columns: [t.skillId, t.companyId], foreignColumns: [skills.id, skills.companyId] }).onDelete(
      'cascade',
    ),
  ],
);

/**
 * The activity log (Admin › Activity Log): every change and sign-in, newest first. Nobody can change or delete an
 * entry (migrations/0013_activity_notifications.sql). Passwords are never recorded.
 */
export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** who did it (kept as name and role too, in case the person leaves the company later) */
    actorId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull().default(''),
    actorRole: text('actor_role'),
    /** what happened: a code the pages show in the person's language, e.g. "teamAdded" */
    action: text('action').notNull(),
    /** whom or what it was about */
    targetId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetName: text('target_name').notNull().default(''),
    details: jsonb('details').$type<Record<string, string>>().notNull().default({}),
    /** sign-ins: the address they came from, as today */
    ip: text('ip'),
    /** a sign-in is written once per sign-in session */
    sessionKey: text('session_key'),
  },
  (t) => [
    index('activity_company_at').on(t.companyId, t.at),
    uniqueIndex('activity_one_sign_in').on(t.companyId, t.sessionKey),
  ],
);

/** The notification bell: each person sees only their own. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** what it is about: a code the pages show in the person's language, e.g. "roleChanged" */
    kind: text('kind').notNull(),
    details: jsonb('details').$type<Record<string, string>>().notNull().default({}),
    /** the page it opens, e.g. /admin/profile */
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    index('notifications_for').on(t.membershipId, t.at),
    foreignKey({
      columns: [t.membershipId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }).onDelete('cascade'),
  ],
);
