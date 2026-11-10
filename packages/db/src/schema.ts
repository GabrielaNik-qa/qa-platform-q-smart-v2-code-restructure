// The PostgreSQL tables (first draft, refined in each phase).
// Every company table has company_id and sits behind the company wall (migrations/0001_company_wall.sql).
// People are the one exception: a person can belong to several companies, so `users` is shared and
// reaches companies through `memberships`; its wall rule shows a person only to the companies they belong to.
import {
  type PlannerSettings,
  ROLES,
  type ScoredCategory,
  type ScorecardCategory,
  type ScorecardQuestion,
} from '@qsmart/shared';
import {
  boolean,
  foreignKey,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
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
  /** Home › Personalize: the dashboards shared with roles, and each role's home dashboard set by an admin */
  dashboards: jsonb('dashboards').$type<CompanyDashboards>().notNull().default({}),
  /** Planning › Review planner: reviews per agent per month (default, per team, per agent) and who reviews whom */
  planner: jsonb('planner').$type<PlannerSettings>().notNull().default({}),
  /** Quality set-up › System settings: a review passes at this score or above (today's default: 85) */
  passRate: integer('pass_rate').notNull().default(85),
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
  /** the columns each table shows (e.g. the Reviews list) */
  columns?: Record<string, string[]>;
  /** Home › Personalize, per company: my home dashboard, my own dashboards, and how the data is counted */
  dashboards?: Record<string, MyDashboards>;
}

/** A dashboard: its name and the widgets on it (today's widget ids, e.g. "kpi_avg"), in today's order on the page. */
export interface DashboardView {
  id: string;
  name: string;
  items: string[];
}
export interface MyDashboards {
  /** my home dashboard, when I chose my own (otherwise my role's) */
  home?: string[];
  views?: DashboardView[];
  /** which date a review counts by: of the conversation (today's default) or when it was reviewed */
  base?: 'conversation' | 'review';
  /** how the charts over time group the dates */
  grouping?: 'day' | 'week' | 'month' | 'quarter';
}
export interface SharedDashboard extends DashboardView {
  /** the roles that see it ("all": everyone) */
  roles: string[];
  byId: string | null;
  byName: string;
}
export interface CompanyDashboards {
  shared?: SharedDashboard[];
  /** a role's home dashboard set by an admin (instead of today's ready-made one for the role) */
  roles?: Record<string, string[]>;
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
    /** the team's own pass rate (empty: the company's) */
    passRate: integer('pass_rate'),
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

// ------------------------------------------------------------------------------------------------ Phase 2: Quality

/** Quality set-up › Scorecards. Reviews keep a copy of the scorecard as it was, so editing one never changes them. */
export const scorecards = pgTable(
  'scorecards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** what it is for (Calls, Chats, B2C …): they only help to find and filter scorecards */
    tags: text('tags').array().notNull().default([]),
    categories: jsonb('categories').$type<ScorecardCategory[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('scorecards_id_company').on(t.id, t.companyId)],
);

/** The scorecards of a workspace: outside admins, people see the scorecards of their own workspaces (as today). */
export const workspaceScorecards = pgTable(
  'workspace_scorecards',
  {
    companyId: uuid('company_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    scorecardId: uuid('scorecard_id').notNull(),
  },
  (t) => [
    uniqueIndex('workspace_scorecards_pair').on(t.workspaceId, t.scorecardId),
    foreignKey({
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [workspaces.id, workspaces.companyId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.scorecardId, t.companyId],
      foreignColumns: [scorecards.id, scorecards.companyId],
    }).onDelete('cascade'),
  ],
);

/** Quality set-up › Categories: the library of reusable categories that scorecards copy. */
export const categoryLibrary = pgTable('category_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  critical: boolean('critical').notNull().default(false),
  questions: jsonb('questions').$type<ScorecardQuestion[]>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** Quality set-up › Root causes: why a question was answered No. */
export const rootCauses = pgTable('root_causes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const channel = pgEnum('review_channel', ['call', 'chat', 'email', 'other']);
export const reviewFlag = pgEnum('review_flag', ['', 'green', 'red']);

/**
 * A review (QA Entry): one conversation of one agent, scored with a scorecard. It keeps its own copy of the scored
 * scorecard, and the names as they were, so it stays readable when the scorecard, the agent or the reviewer change or
 * leave. Call recordings are never stored, only a link to them.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    leadId: text('lead_id').notNull(),
    agentId: uuid('agent_membership_id'),
    agentName: text('agent_name').notNull(),
    teamId: uuid('team_id'),
    teamName: text('team_name').notNull().default(''),
    reviewedOn: date('reviewed_on').notNull(),
    channel: channel('channel').notNull().default('call'),
    /** the "other" channel's name (e.g. WhatsApp) */
    channelName: text('channel_name').notNull().default(''),
    scorecardId: uuid('scorecard_id'),
    scorecardName: text('scorecard_name').notNull(),
    categories: jsonb('categories').$type<ScoredCategory[]>().notNull(),
    /** the percentage with one decimal; empty when not scored */
    score: numeric('score', { precision: 4, scale: 1, mode: 'number' }),
    zero: boolean('zero').notNull().default(false),
    notScored: boolean('not_scored').notNull().default(false),
    status: text('status').notNull().default('ok'),
    flag: reviewFlag('flag').notNull().default(''),
    campaign: text('campaign').notNull().default(''),
    comment: text('comment').notNull().default(''),
    leadLink: text('lead_link').notNull().default(''),
    recordingLink: text('recording_link').notNull().default(''),
    conversationLink: text('conversation_link').notNull().default(''),
    transcript: text('transcript').notNull().default(''),
    emailSubject: text('email_subject').notNull().default(''),
    reviewerId: uuid('reviewer_membership_id'),
    reviewerName: text('reviewer_name').notNull(),
    /** when the agent first opened it */
    seenAt: timestamp('seen_at', { withTimezone: true }),
    /** how long QA Entry took, in seconds (at most 4 hours) */
    reviewSeconds: integer('review_seconds'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('reviews_id_company').on(t.id, t.companyId),
    index('reviews_company_date').on(t.companyId, t.reviewedOn),
    index('reviews_agent').on(t.agentId),
    foreignKey({
      name: 'reviews_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'reviews_reviewer_same_company',
      columns: [t.reviewerId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'reviews_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'reviews_scorecard_same_company',
      columns: [t.scorecardId, t.companyId],
      foreignColumns: [scorecards.id, scorecards.companyId],
    }),
  ],
);

export const disputeOutcome = pgEnum('dispute_outcome', ['kept', 'changed', 'partly']);

/**
 * A dispute (today's rule): the agent disagrees with a review, once per review. The agent and the reviewers talk in its
 * messages, and an admin or reviewer resolves it: score kept, changed, or partly changed. Deleting the review deletes it.
 */
export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id').notNull(),
    /** the agent who disputed it */
    agentId: uuid('agent_membership_id'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    /** empty while it is open */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    outcome: disputeOutcome('outcome'),
    /** the closing note */
    note: text('note').notNull().default(''),
    resolvedById: uuid('resolved_by_membership_id'),
    resolvedByName: text('resolved_by_name').notNull().default(''),
  },
  (t) => [
    unique('disputes_id_company').on(t.id, t.companyId),
    uniqueIndex('disputes_review').on(t.reviewId),
    foreignKey({
      name: 'disputes_review_same_company',
      columns: [t.reviewId, t.companyId],
      foreignColumns: [reviews.id, reviews.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'disputes_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'disputes_resolver_same_company',
      columns: [t.resolvedById, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** The conversation of a dispute. A message is never changed or deleted; "system" ones say how it was resolved. */
export const disputeMessages = pgTable(
  'dispute_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    disputeId: uuid('dispute_id').notNull(),
    authorId: uuid('author_membership_id'),
    /** kept as name and role too, in case the person leaves the company later */
    authorName: text('author_name').notNull(),
    authorRole: text('author_role').notNull(),
    system: boolean('system').notNull().default(false),
    text: text('text').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dispute_messages_of').on(t.disputeId, t.at),
    foreignKey({
      name: 'dispute_messages_dispute_same_company',
      columns: [t.disputeId, t.companyId],
      foreignColumns: [disputes.id, disputes.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'dispute_messages_author_same_company',
      columns: [t.authorId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

export const quickFlagType = pgEnum('quick_flag_type', ['red', 'green']);

/**
 * A quick flag (today's rule): a red or green flag on a conversation, kept apart from QA reviews, so scores never
 * change. Staff give them to the agents of their workspaces; the agent is told. Recordings are never stored, only links.
 */
export const quickFlags = pgTable(
  'quick_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    type: quickFlagType('type').notNull(),
    channel: channel('channel').notNull().default('call'),
    agentId: uuid('agent_membership_id'),
    agentName: text('agent_name').notNull(),
    teamId: uuid('team_id'),
    teamName: text('team_name').notNull().default(''),
    leadId: text('lead_id').notNull(),
    flaggedOn: date('flagged_on').notNull(),
    campaign: text('campaign').notNull().default(''),
    /** the CRM link */
    leadLink: text('lead_link').notNull().default(''),
    /** the recording, chat, e-mail or conversation link */
    conversationLink: text('conversation_link').notNull().default(''),
    comment: text('comment').notNull().default(''),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('quick_flags_company_date').on(t.companyId, t.flaggedOn),
    foreignKey({
      name: 'quick_flags_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'quick_flags_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'quick_flags_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

export const calibrationStatus = pgEnum('calibration_status', ['planned', 'held', 'closed']);

/** A decision or action of a calibration session (today: up to 30). */
export interface CalibrationDecision {
  text: string;
  /** a participant's membership, or empty */
  ownerId: string;
  due: string;
  done: boolean;
}

/**
 * A calibration session (today's rule): reviewers, team leads and trainers compare their impressions, score the same
 * reviews blind, and decide together. Only its participants (and admins) see it.
 */
export const calibrations = pgTable(
  'calibrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    heldOn: date('held_on').notNull(),
    status: calibrationStatus('status').notNull().default('planned'),
    /** the agenda and notes */
    notes: text('notes').notNull().default(''),
    /** the teams discussed */
    teamIds: uuid('team_ids').array().notNull().default([]),
    decisions: jsonb('decisions').$type<CalibrationDecision[]>().notNull().default([]),
    /** the reference score of each review: "review" (the review itself) or a participant's id */
    reference: jsonb('reference').$type<Record<string, string>>().notNull().default({}),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('calibrations_id_company').on(t.id, t.companyId),
    foreignKey({
      name: 'calibrations_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** Who takes part, and their own part: impressions of the team(s) and what they have done. */
export const calibrationParticipants = pgTable(
  'calibration_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    calibrationId: uuid('calibration_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    impression: text('impression').notNull().default(''),
    done: text('done').notNull().default(''),
    wroteAt: timestamp('wrote_at', { withTimezone: true }),
  },
  (t) => [
    unique('calibration_participants_id_company').on(t.id, t.companyId),
    uniqueIndex('calibration_participants_pair').on(t.calibrationId, t.membershipId),
    foreignKey({
      name: 'calibration_participants_calibration',
      columns: [t.calibrationId, t.companyId],
      foreignColumns: [calibrations.id, calibrations.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'calibration_participants_member',
      columns: [t.membershipId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }).onDelete('cascade'),
  ],
);

/** The reviews a session discusses (today: up to 30). */
export const calibrationReviews = pgTable(
  'calibration_reviews',
  {
    companyId: uuid('company_id').notNull(),
    calibrationId: uuid('calibration_id').notNull(),
    reviewId: uuid('review_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('calibration_reviews_pair').on(t.calibrationId, t.reviewId),
    foreignKey({
      name: 'calibration_reviews_calibration',
      columns: [t.calibrationId, t.companyId],
      foreignColumns: [calibrations.id, calibrations.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'calibration_reviews_review',
      columns: [t.reviewId, t.companyId],
      foreignColumns: [reviews.id, reviews.companyId],
    }).onDelete('cascade'),
  ],
);

/** Blind scoring: each participant's own score of a review, hidden from the others until they score it too. */
export const calibrationScores = pgTable(
  'calibration_scores',
  {
    companyId: uuid('company_id').notNull(),
    calibrationId: uuid('calibration_id').notNull(),
    reviewId: uuid('review_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    score: integer('score').notNull(),
    note: text('note').notNull().default(''),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('calibration_scores_one').on(t.calibrationId, t.reviewId, t.participantId),
    foreignKey({
      name: 'calibration_scores_calibration',
      columns: [t.calibrationId, t.companyId],
      foreignColumns: [calibrations.id, calibrations.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'calibration_scores_review',
      columns: [t.reviewId, t.companyId],
      foreignColumns: [reviews.id, reviews.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'calibration_scores_participant',
      columns: [t.participantId, t.companyId],
      foreignColumns: [calibrationParticipants.id, calibrationParticipants.companyId],
    }).onDelete('cascade'),
  ],
);

/**
 * Reviewer QA (today's rule): a check of a review made by someone else, with four yes/no questions. A reviewer's score
 * is the share of "yes". The check stays when the review, its agent or its reviewer go (the names are kept).
 */
export const reviewerChecks = pgTable(
  'reviewer_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id'),
    leadId: text('lead_id').notNull(),
    reviewedOn: date('reviewed_on').notNull(),
    agentId: uuid('agent_membership_id'),
    agentName: text('agent_name').notNull(),
    teamId: uuid('team_id'),
    reviewerId: uuid('reviewer_membership_id'),
    reviewerName: text('reviewer_name').notNull(),
    /** the score is fair */
    fair: boolean('fair').notNull(),
    /** it follows the scorecard */
    follows: boolean('follows').notNull(),
    /** the critical items are right */
    critical: boolean('critical').notNull(),
    /** the comment helps the agent */
    useful: boolean('useful').notNull(),
    note: text('note').notNull().default(''),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reviewer_checks_company').on(t.companyId, t.createdAt),
    foreignKey({
      name: 'reviewer_checks_review_same_company',
      columns: [t.reviewId, t.companyId],
      foreignColumns: [reviews.id, reviews.companyId],
    }),
    foreignKey({
      name: 'reviewer_checks_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'reviewer_checks_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'reviewer_checks_reviewer_same_company',
      columns: [t.reviewerId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'reviewer_checks_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

export const pinStatus = pgEnum('pin_status', ['todo', 'done']);

/**
 * Pins (today's rule): a moment of a reviewed conversation, saved to talk about with the agent in a coaching session.
 * Staff pin the conversations of their workspaces' agents; the agent sees their own. A pin keeps the lead ID and the
 * names when its review, agent or team go.
 */
export const pins = pgTable(
  'pins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id'),
    leadId: text('lead_id').notNull(),
    reviewedOn: date('reviewed_on').notNull(),
    agentId: uuid('agent_membership_id'),
    agentName: text('agent_name').notNull(),
    teamId: uuid('team_id'),
    /** the moment in the conversation (mm:ss), or empty */
    moment: text('moment').notNull().default(''),
    /** what to talk about */
    note: text('note').notNull(),
    status: pinStatus('status').notNull().default('todo'),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pins_company').on(t.companyId, t.createdAt),
    index('pins_agent').on(t.agentId),
    foreignKey({
      name: 'pins_review_same_company',
      columns: [t.reviewId, t.companyId],
      foreignColumns: [reviews.id, reviews.companyId],
    }),
    foreignKey({
      name: 'pins_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'pins_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'pins_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

// ---- Performance (Phase 3, step 5): goals & KPIs, improvement plans, recognition

/** Who a goal is for: the whole company, a team or one agent. */
export const goalScope = pgEnum('goal_scope', ['all', 'team', 'agent']);
/** What a goal measures (tasks and CSAT count once Tasks and Surveys exist). */
export const goalMetric = pgEnum('goal_metric', ['avg', 'pass', 'reviews', 'tasks', 'csat', 'kudos']);

/** A monthly target (today's Goals & KPIs): its progress is counted from the real data, never typed in. */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    scope: goalScope('scope').notNull(),
    teamId: uuid('team_id'),
    agentId: uuid('agent_membership_id'),
    /** the team's or agent's name, kept when they go */
    targetName: text('target_name').notNull().default(''),
    metric: goalMetric('metric').notNull(),
    value: doublePrecision('value').notNull(),
    /** a review type, or empty for all */
    channel: text('channel').notNull().default(''),
    /** YYYY-MM */
    month: text('month').notNull(),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_company_month').on(t.companyId, t.month),
    foreignKey({
      name: 'goals_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'goals_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'goals_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

export const planStatus = pgEnum('plan_status', ['active', 'extended', 'passed', 'failed', 'cancelled']);
export interface PlanGoal {
  text: string;
  done: boolean;
}
export interface PlanCheckIn {
  date: string;
  note: string;
  byName: string;
}

/** An improvement plan for an agent below target (today's PIPs): goals, check-ins, the outcome and the agent's signature. */
export const improvementPlans = pgTable(
  'improvement_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_membership_id'),
    agentName: text('agent_name').notNull(),
    title: text('title').notNull(),
    reason: text('reason').notNull().default(''),
    startOn: date('start_on').notNull(),
    endOn: date('end_on').notNull(),
    goals: jsonb('goals').$type<PlanGoal[]>().notNull().default([]),
    checkIns: jsonb('check_ins').$type<PlanCheckIn[]>().notNull().default([]),
    status: planStatus('status').notNull().default('active'),
    /** when the agent signed that they read and agree */
    signedAt: timestamp('signed_at', { withTimezone: true }),
    agentNote: text('agent_note').notNull().default(''),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('improvement_plans_company').on(t.companyId, t.createdAt),
    index('improvement_plans_agent').on(t.agentId),
    foreignKey({
      name: 'improvement_plans_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'improvement_plans_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** A thank-you to a colleague (today's kudos), with a badge. */
export const kudos = pgTable(
  'kudos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    toId: uuid('to_membership_id'),
    toName: text('to_name').notNull(),
    badge: text('badge').notNull(),
    text: text('text').notNull(),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('kudos_company').on(t.companyId, t.createdAt),
    foreignKey({
      name: 'kudos_to_same_company',
      columns: [t.toId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'kudos_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);
