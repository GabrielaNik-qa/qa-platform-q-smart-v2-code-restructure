// The PostgreSQL tables (first draft, refined in each phase).
// Every company table has company_id and sits behind the company wall (migrations/0001_company_wall.sql).
// People are the one exception: a person can belong to several companies, so `users` is shared and
// reaches companies through `memberships`; its wall rule shows a person only to the companies they belong to.
import { ROLES } from '@qsmart/shared';
import {
  boolean,
  foreignKey,
  index,
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
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Empty for an invitation not yet accepted: it's filled at the first sign-in with the invited, verified e-mail. */
  firebaseUid: text('firebase_uid').unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

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
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('memberships_company_user').on(t.companyId, t.userId),
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
