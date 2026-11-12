// The PostgreSQL tables (first draft, refined in each phase).
// Every company table has company_id and sits behind the company wall (migrations/0001_company_wall.sql).
// People are the one exception: a person can belong to several companies, so `users` is shared and
// reaches companies through `memberships`; its wall rule shows a person only to the companies they belong to.
import {
  type FieldOption,
  type Labels,
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
  primaryKey,
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
  /** Data protection: transcripts are deleted this many days after the conversation (0: kept until deleted by hand) */
  transcriptDays: integer('transcript_days').notNull().default(90),
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
    /** the conversation it reviewed, when it is in Q-smart (Quality › Conversations) */
    conversationId: uuid('conversation_id'),
    /** who made it: a person (QA Entry) or AutoQA (an AI review, which counts on its own and is marked as AI) */
    source: text('source').notNull().default('human'),
    /** an AI review's proof: the model, the prompt and scorecard versions, a quote for every answer */
    ai: jsonb('ai').$type<AiReviewDetails>(),
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
    /** "Not what I said" (Phase 3b): the answers of an AI review the agent marked, and the person's decision on each */
    marks: jsonb('marks').$type<AnswerMark[]>().notNull().default([]),
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

// ---- Reports (Phase 3, step 7): saved and scheduled reports, and the export centre

/** When a saved report arrives by itself (today's schedule), in the time zone of the person who chose it. */
export interface ReportSchedule {
  freq: 'none' | 'daily' | 'weekly' | 'monthly';
  /** 0 Sunday … 6 Saturday */
  weekday?: number;
  /** 1-28 */
  day?: number;
  /** 0-23 */
  hour?: number;
  timeZone?: string;
  /** also by e-mail (once Q-smart sends e-mails), to these addresses of the company's accounts */
  email?: boolean;
  to?: string;
}

/** A saved report: its settings (the report builder's), whether it is shared, and its schedule. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cfg: jsonb('cfg').$type<Record<string, unknown>>().notNull(),
    shared: boolean('shared').notNull().default(false),
    schedule: jsonb('schedule').$type<ReportSchedule>().notNull().default({ freq: 'none' }),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_company').on(t.companyId, t.createdAt),
    foreignKey({
      name: 'reports_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** One Excel file made in the app (the export centre): what it was, so it can be made again with today's data. */
export const exportsLog = pgTable(
  'exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** the reviews (their ids) or the report's settings; null when it was too big to keep (over 5000 rows) */
    request: jsonb('request').$type<Record<string, unknown>>(),
    rows: integer('rows').notNull(),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('exports_company').on(t.companyId, t.createdAt),
    foreignKey({
      name: 'exports_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** Admin › AI, the company's own rules for the AI engine (one row per company; no row: the defaults). */
export const aiSettings = pgTable('ai_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** the AI switched off for the whole company: every AI feature says so, everything else keeps working */
  enabled: boolean('enabled').notNull().default(true),
  /** clients' data only to AI that runs in the EU */
  euOnly: boolean('eu_only').notNull().default(false),
  /** the AI companies allowed for clients' data (empty: all that pass the engine's rules) */
  allowedProviders: text('allowed_providers').array().notNull().default([]),
  /** paid AI plans allowed (off until the company pays: €0 until the first paying client) */
  allowPaid: boolean('allow_paid').notNull().default(false),
  /** monthly limits: for the company and per team, in US dollars (millionths) and in calls */
  limits: jsonb('limits').$type<AiLimits>().notNull().default({}),
  /** AI reviews (AutoQA): when the agents were told, and the channels they run on (empty: all) */
  reviews: jsonb('reviews').$type<AiReviewRules>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export interface AiLimit {
  /** millionths of a US dollar (AI companies price in dollars) */
  microUsd?: number;
  calls?: number;
}
export interface AiLimits {
  company?: AiLimit;
  teams?: Record<string, AiLimit>;
}

/**
 * Every AI call (and every refusal before one), for the usage figures, the monthly limits and the AI Act's logs. It
 * never keeps what was sent or answered: only who, what for, which model, how much and how it went.
 */
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id'),
    byId: uuid('by_membership_id'),
    /** the job type, e.g. autoqa.score */
    feature: text('feature').notNull(),
    /** test (the demo, the tests) or client (a client's data) */
    dataClass: text('data_class').notNull(),
    provider: text('provider'),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** speech-to-text: the recording's length in seconds (the recording itself is never kept) */
    audioSeconds: integer('audio_seconds').notNull().default(0),
    /** millionths of a US dollar (0 on a free plan) */
    costMicroUsd: integer('cost_micro_usd').notNull().default(0),
    waitMs: integer('wait_ms').notNull().default(0),
    status: text('status').notNull(),
    /** the try number within one job: 1 is the first choice, more means a fallback */
    attempt: integer('attempt').notNull().default(1),
    /** a short error code, never the AI company's message (it could repeat what was sent) */
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_calls_company').on(t.companyId, t.createdAt),
    foreignKey({
      name: 'ai_calls_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'ai_calls_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/**
 * Admin › AI › AI provider: the company's accounts with AI companies. The key is stored encrypted (AES-256-GCM, with
 * the server's master key, bound to this company and AI company); only its last 4 characters are kept readable.
 */
export const aiAccounts = pgTable(
  'ai_accounts',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    plan: text('plan').notNull().default('free'),
    keyCipher: text('key_cipher').notNull(),
    keyHint: text('key_hint').notNull(),
    /** Cloudflare's account id (not a secret) */
    accountId: text('account_id'),
    enabled: boolean('enabled').notNull().default(true),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.provider] }),
    foreignKey({
      name: 'ai_accounts_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/**
 * Admin › Fields: the company's changes to Q-smart's built-in fields (name, order, hidden, options, AI may read) and
 * its own fields (packages/shared/src/fields.ts). One row per field; built-in fields get a row when first changed.
 */
export const fields = pgTable(
  'fields',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    object: text('object').notNull(),
    key: text('key').notNull(),
    labels: jsonb('labels').$type<Labels>().notNull().default({}),
    type: text('type').notNull(),
    options: jsonb('options').$type<FieldOption[]>().notNull().default([]),
    required: boolean('required').notNull().default(false),
    ai: boolean('ai').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    position: integer('position').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.object, t.key] })],
);

/** A customer of the company (the person its agents talk to), with the universal fields and the company's own. */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** the customer's ID in the company's own system */
    externalId: text('external_id').notNull().default(''),
    /** the universal fields and the company's own, each checked against Admin › Fields */
    values: jsonb('values').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('customers_id_company').on(t.id, t.companyId),
    index('customers_company_external').on(t.companyId, t.externalId),
  ],
);

/**
 * Quality › Conversations: a call, chat, e-mail or other conversation of one agent. Its transcript is kept apart
 * (transcripts) and deleted after the company's days; the conversation itself (who, when, the fields) stays.
 * Recordings are never stored, only a link.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull().default('call'),
    /** the "other" channel's name (e.g. WhatsApp) */
    channelName: text('channel_name').notNull().default(''),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    agentId: uuid('agent_membership_id'),
    agentName: text('agent_name').notNull(),
    teamId: uuid('team_id'),
    teamName: text('team_name').notNull().default(''),
    customerId: uuid('customer_id'),
    /** the link to the conversation in the company's own system (never the recording itself) */
    link: text('link').notNull().default(''),
    /** held for a person: AutoQA found what looks like instructions to the AI in it (empty: not held) */
    aiHold: text('ai_hold').notNull().default(''),
    /** the other universal fields (direction, duration, language, outcome …) and the company's own */
    values: jsonb('values').$type<Record<string, unknown>>().notNull().default({}),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('conversations_id_company').on(t.id, t.companyId),
    index('conversations_company_date').on(t.companyId, t.startedAt),
    index('conversations_agent').on(t.agentId),
    foreignKey({
      name: 'conversations_agent_same_company',
      columns: [t.agentId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'conversations_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'conversations_customer_same_company',
      columns: [t.customerId, t.companyId],
      foreignColumns: [customers.id, customers.companyId],
    }),
    foreignKey({
      name: 'conversations_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** A conversation's transcript: only the text, deleted after the company's days (or by hand). */
export const transcripts = pgTable(
  'transcripts',
  {
    conversationId: uuid('conversation_id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'transcripts_conversation_same_company',
      columns: [t.conversationId, t.companyId],
      foreignColumns: [conversations.id, conversations.companyId],
    }).onDelete('cascade'),
  ],
);

export interface AiReviewRules {
  /** when an admin confirmed the agents were told (AI reviews run only after it) */
  announcedAt?: string;
  announcedBy?: string;
  /** the channels AI reviews run on (empty or missing: all) */
  channels?: ('call' | 'chat' | 'email' | 'other')[];
  /** the accuracy bar of the brake, 1-100 (missing: 75) */
  bar?: number;
  /** categories (scorecard id|category name) where an admin paused AI reviews */
  paused?: string[];
  /** categories under the bar the admins were already told about */
  flagged?: string[];
}

/** One AI answer's proof. */
export interface AiAnswerProof {
  /** the exact words of the conversation the answer rests on */
  quote: string;
  /** why: for N/A, why the situation never came up */
  why: string;
  /** for a No: how to do it better */
  tip: string;
}
/**
 * One answer of an AI review the agent marked "not what I said": where it is on the review, its words (so the accuracy
 * score can match it), AutoQA's answer, and the answer the person who resolved the dispute decided (null until then).
 */
export interface AnswerMark {
  ci: number;
  qi: number;
  category: string;
  question: string;
  ai: 'y' | 'n' | 'na';
  right: 'y' | 'n' | 'na' | null;
}

export interface AiReviewDetails {
  provider: string;
  model: string;
  promptVersion: string;
  /** when the scorecard last changed, as it was scored */
  scorecardUpdatedAt: string;
  /** per category, per question */
  proof: AiAnswerProof[][];
  summary: string;
  attempt: number;
  /** the outcome check (when the company's outcomes have a guide) */
  outcome?: OutcomeCheck;
}

/**
 * AutoQA's outcome check: the outcome the agent chose and the one the company's guide asks for (option ids, with the
 * company's names for them; an empty name means Q-smart's own outcome, named by the pages), and AutoQA's proof.
 */
export interface OutcomeCheck {
  chosen: string | null;
  chosenName: string;
  expected: string;
  expectedName: string;
  ok: boolean;
  quote: string;
  why: string;
}

/**
 * Admin › AI › AI usage limits, "Free allowance": the latest figures an AI company sent about its limits (Groq sends
 * them with every answer: requests and tokens, what is left and when it resets), per model. Nothing else is kept.
 */
export const aiLimitsSeen = pgTable(
  'ai_limits_seen',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    limits: jsonb('limits').$type<Record<string, string>>().notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.provider, t.model] })],
);

/** A scorecard's answers as given, kept by category name and question text (compared even if the scorecard changes). */
export interface AnsweredCategory {
  name: string;
  questions: { text: string; answer: 'y' | 'n' | 'na' }[];
}

/**
 * AutoQA's test set (V2_PLAN §7, "the quality check"): made-up conversations a QA expert scores once; every AI model
 * runs on them, and a model is used for AI reviews only if it agrees closely enough with the expert.
 */
export const aiTestItems = pgTable(
  'ai_test_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    language: text('language').notNull(),
    industry: text('industry').notNull(),
    title: text('title').notNull(),
    channel: text('channel').notNull(),
    text: text('text').notNull(),
    scorecardId: uuid('scorecard_id').notNull(),
    /** the expert's answers (the yardstick), empty until scored */
    expected: jsonb('expected').$type<AnsweredCategory[]>(),
    expectedScore: numeric('expected_score', { precision: 4, scale: 1, mode: 'number' }),
    expectedBy: text('expected_by'),
    expectedAt: timestamp('expected_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('ai_test_items_key').on(t.companyId, t.key),
    unique('ai_test_items_id_company').on(t.id, t.companyId),
  ],
);

/** One AI model's answers on one test conversation (the latest per model counts). */
export const aiTestRuns = pgTable(
  'ai_test_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull(),
    /** the catalogue's model id, e.g. groq/openai/gpt-oss-120b */
    modelId: text('model_id').notNull(),
    status: text('status').notNull(),
    answers: jsonb('answers').$type<AnsweredCategory[]>(),
    score: numeric('score', { precision: 4, scale: 1, mode: 'number' }),
    waitMs: integer('wait_ms').notNull().default(0),
    problem: text('problem'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_test_runs_item').on(t.companyId, t.itemId, t.modelId, t.createdAt),
    foreignKey({
      name: 'ai_test_runs_item_same_company',
      columns: [t.itemId, t.companyId],
      foreignColumns: [aiTestItems.id, aiTestItems.companyId],
    }).onDelete('cascade'),
  ],
);

// ---------------------------------------------------------------------------------------------- Phase 4: tasks

export const taskStatus = pgEnum('task_status', ['todo', 'doing', 'review', 'done']);
export const taskPriority = pgEnum('task_priority', ['low', 'med', 'high']);
/** a task, or a target (today's "mission": it earns points) */
export const taskKind = pgEnum('task_kind', ['task', 'target']);

/** One line of a task's checklist, with the minutes it should take (0: not said). */
export interface TaskStep {
  text: string;
  minutes: number;
  done: boolean;
}
/** What happened to a task (today: up to 60, oldest dropped), in the order it happened. */
export interface TaskEvent {
  at: string;
  byName: string;
  action:
    | 'given'
    | 'started'
    | 'todo'
    | 'review'
    | 'approved'
    | 'returned'
    | 'done'
    | 'assigned'
    | 'due'
    | 'archived'
    | 'restored';
  note?: string;
}

/** A checklist line of a template or a sequence's step (ticked only on the cards). */
export interface TemplateStep {
  text: string;
  minutes: number;
}
/** One step of a sequence: a task given a number of days after the start (day 0: the start), for some days. */
export interface SequenceStep {
  title: string;
  description: string;
  day: number;
  days: number;
  kind: 'task' | 'target';
  priority: 'low' | 'med' | 'high';
  points: number;
  needsReview: boolean;
  steps: TemplateStep[];
}

/**
 * A saved task (today's Library › Templates): used by hand ("Use template"), or repeating by itself every day, week,
 * month or quarter for chosen people and teams, until a date if chosen.
 */
export const taskTemplates = pgTable(
  'task_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    /** a one-time task, a checklist (a task with steps), or a target */
    kind: text('kind').notNull().default('checklist'),
    priority: taskPriority('priority').notNull().default('med'),
    points: integer('points').notNull().default(0),
    steps: jsonb('steps').$type<TemplateStep[]>().notNull().default([]),
    labels: jsonb('labels').$type<string[]>().notNull().default([]),
    colour: text('colour').notNull().default(''),
    category: text('category').notNull().default(''),
    needsReview: boolean('needs_review').notNull().default(false),
    /** none: used by hand; daily, weekly, monthly, quarterly: a card comes by itself */
    freq: text('freq').notNull().default('none'),
    /** weekly: the day (0 Sunday … 6 Saturday) */
    weekday: integer('weekday').notNull().default(1),
    /** monthly and quarterly: the day of the month (1-28) */
    monthday: integer('monthday').notNull().default(1),
    untilOn: date('until_on'),
    /** who gets the repeating cards: people (memberships) and whole teams (their active agents) */
    userIds: jsonb('user_ids').$type<string[]>().notNull().default([]),
    teamIds: jsonb('team_ids').$type<string[]>().notNull().default([]),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('task_templates_id_company').on(t.id, t.companyId),
    index('task_templates_company').on(t.companyId),
    foreignKey({
      name: 'task_templates_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** A sequence (today's Library › Sequences): steps given together, each a number of days after the start. */
export const taskSequences = pgTable(
  'task_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    steps: jsonb('steps').$type<SequenceStep[]>().notNull().default([]),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('task_sequences_id_company').on(t.id, t.companyId),
    index('task_sequences_company').on(t.companyId),
    foreignKey({
      name: 'task_sequences_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** A sequence given to people and teams from a start date, once or again every month or quarter. */
export const taskSequenceRuns = pgTable(
  'task_sequence_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sequenceId: uuid('sequence_id').notNull(),
    startOn: date('start_on').notNull(),
    /** none, monthly or quarterly */
    repeat: text('repeat').notNull().default('none'),
    untilOn: date('until_on'),
    userIds: jsonb('user_ids').$type<string[]>().notNull().default([]),
    teamIds: jsonb('team_ids').$type<string[]>().notNull().default([]),
    /** the start dates of the rounds already given (the last 50) */
    cycles: jsonb('cycles').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('task_sequence_runs_id_company').on(t.id, t.companyId),
    index('task_sequence_runs_sequence').on(t.sequenceId),
    foreignKey({
      name: 'task_sequence_runs_sequence_same_company',
      columns: [t.sequenceId, t.companyId],
      foreignColumns: [taskSequences.id, taskSequences.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_sequence_runs_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/**
 * A task or target given to one person (today's Tasks): its checklist, dates, status and history. A task given to
 * several people at once is one row per person, sharing a group id. Its person's team is kept for the workspace reach.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** the tasks given together (to several people at once) */
    groupId: uuid('group_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    kind: taskKind('kind').notNull().default('task'),
    priority: taskPriority('priority').notNull().default('med'),
    points: integer('points').notNull().default(0),
    startOn: date('start_on'),
    dueOn: date('due_on'),
    status: taskStatus('status').notNull().default('todo'),
    /** "needs review": the person's "done" waits in In review until someone checks it */
    needsReview: boolean('needs_review').notNull().default(false),
    assigneeId: uuid('assignee_membership_id'),
    assigneeName: text('assignee_name').notNull(),
    teamId: uuid('team_id'),
    teamName: text('team_name').notNull().default(''),
    steps: jsonb('steps').$type<TaskStep[]>().notNull().default([]),
    labels: jsonb('labels').$type<string[]>().notNull().default([]),
    /** #rrggbb, or empty */
    colour: text('colour').notNull().default(''),
    category: text('category').notNull().default(''),
    pinned: boolean('pinned').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** when it was last sent for review */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    history: jsonb('history').$type<TaskEvent[]>().notNull().default([]),
    /** a repeating template's card: the template, and "template:period:person", so each comes once */
    templateId: uuid('template_id'),
    recurKey: text('recur_key'),
    /** a sequence's card: the round it belongs to, its step number of how many, and the sequence's name */
    runId: uuid('run_id'),
    stepNo: integer('step_no'),
    stepCount: integer('step_count'),
    sequenceName: text('sequence_name').notNull().default(''),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tasks_recur_key').on(t.companyId, t.recurKey),
    index('tasks_company_due').on(t.companyId, t.dueOn),
    index('tasks_assignee').on(t.assigneeId),
    index('tasks_group').on(t.groupId),
    foreignKey({
      name: 'tasks_assignee_same_company',
      columns: [t.assigneeId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'tasks_team_same_company',
      columns: [t.teamId, t.companyId],
      foreignColumns: [teams.id, teams.companyId],
    }),
    foreignKey({
      name: 'tasks_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
    foreignKey({
      name: 'tasks_template_same_company',
      columns: [t.templateId, t.companyId],
      foreignColumns: [taskTemplates.id, taskTemplates.companyId],
    }),
    foreignKey({
      name: 'tasks_run_same_company',
      columns: [t.runId, t.companyId],
      foreignColumns: [taskSequenceRuns.id, taskSequenceRuns.companyId],
    }),
  ],
);

// ---------------------------------------------------------------------------------------------- Phase 4: coaching

export const sessionKind = pgEnum('session_kind', ['coaching', 'group', 'training', 'o2o']);
export const sessionStatus = pgEnum('session_status', ['planned', 'done']);
/** An agent of a session, kept with their name and team (for the workspace reach, and if they leave). */
export interface SessionAgent {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string;
}
/** An action agreed in a session: what should happen, who does it, by when; with its task when one was made. */
export interface SessionAction {
  text: string;
  ownerId: string;
  ownerName: string;
  dueOn: string | null;
  done: boolean;
  taskId: string | null;
}
/** An agent's signature: "I have read it and I agree", with an optional comment (by membership). */
export interface SessionSignature {
  at: string;
  comment: string;
  /** a one-to-one signed on the team lead's screen, with the agent there */
  inPerson?: boolean;
}

/** One section of a one-to-one form: 8 kinds, as today (its answers are kept by its id). */
export interface OneToOneSection {
  id: string;
  type: 'text' | 'check' | 'yesno' | 'objectives' | 'rating' | 'metrics' | 'table' | 'agree';
  title: string;
  /** the lines: checklist items, yes/no items, items to rate, numbers, table rows or statements to agree to */
  items: string[];
  /** a table's columns */
  cols: string[];
  /** a number's unit, by line */
  units: string[];
}
/** The team lead's signature of a one-to-one (given when it is sent or completed). */
export interface LeadSignature {
  at: string;
  id: string | null;
  name: string;
}

/** A one-to-one form template (today's Form templates): its name, the teams that use it, and its sections. */
export const oneToOneTemplates = pgTable(
  'one_to_one_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    teamIds: jsonb('team_ids').$type<string[]>().notNull().default([]),
    sections: jsonb('sections').$type<OneToOneSection[]>().notNull().default([]),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('one_to_one_templates_id_company').on(t.id, t.companyId),
    index('one_to_one_templates_company').on(t.companyId),
    foreignKey({
      name: 'one_to_one_templates_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);

/** How many one-to-ones each person should have per month: one number, and a different one for chosen teams. */
export const oneToOneTargets = pgTable('one_to_one_targets', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: integer('target').notNull().default(1),
  teams: jsonb('teams').$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A documented session (today's Coaching and One-to-One): individual or group coaching, a training, or a one-to-one
 * (its own parts come with step 5). Its agents read it and sign it.
 */
export const coachingSessions = pgTable(
  'coaching_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: sessionKind('kind').notNull(),
    heldOn: date('held_on').notNull(),
    title: text('title').notNull(),
    status: sessionStatus('status').notNull().default('done'),
    agents: jsonb('agents').$type<SessionAgent[]>().notNull().default([]),
    /** the scorecard categories worked on */
    focus: jsonb('focus').$type<string[]>().notNull().default([]),
    topics: jsonb('topics').$type<string[]>().notNull().default([]),
    goals: text('goals').notNull().default(''),
    notes: text('notes').notNull().default(''),
    followUpOn: date('follow_up_on'),
    actions: jsonb('actions').$type<SessionAction[]>().notNull().default([]),
    signatures: jsonb('signatures').$type<Record<string, SessionSignature>>().notNull().default({}),
    // ---- a one-to-one's own parts (step 5)
    templateId: uuid('template_id'),
    /** the period it looks at: week, month, year, or custom (from - to) */
    period: text('period').notNull().default('month'),
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    /** the form's sections as they were when it was written, and the answers by section id */
    sections: jsonb('sections').$type<OneToOneSection[]>().notNull().default([]),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    /** draft, sent (waiting for the agent's signature) or signed; empty for coaching sessions */
    state: text('state').notNull().default(''),
    leadSignature: jsonb('lead_signature').$type<LeadSignature>(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    byId: uuid('by_membership_id'),
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coaching_sessions_company').on(t.companyId, t.heldOn),
    foreignKey({
      name: 'coaching_sessions_by_same_company',
      columns: [t.byId, t.companyId],
      foreignColumns: [memberships.id, memberships.companyId],
    }),
  ],
);
