import { z } from 'zod';

/**
 * The five roles inside a company. Today's app calls the reviewer role "qa";
 * v2 calls it "reviewer" (Gabriela's decision, 5 November 2026).
 */
export const ROLES = ['admin', 'reviewer', 'lead', 'trainer', 'agent'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** Staff roles: their people belong to the Administration team (today's rule). */
export const STAFF_ROLES: readonly Role[] = ['admin', 'reviewer', 'lead', 'trainer'];
export const isStaff = (role: Role): boolean => STAFF_ROLES.includes(role);

/** Every text exists in English, Bulgarian and French. */
export const LANGUAGES = ['en', 'bg', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** The role names people see, in the three languages (as in docs/i18n-glossary.md). */
export const ROLE_LABELS: Record<Language, Record<Role, string>> = {
  en: { admin: 'Admin', reviewer: 'Reviewer', lead: 'Team Lead', trainer: 'Trainer', agent: 'Agent' },
  bg: { admin: 'Администратор', reviewer: 'Оценител', lead: 'Тийм лидер', trainer: 'Обучител', agent: 'Агент' },
  fr: { admin: 'Administrateur', reviewer: 'Évaluateur', lead: "Chef d'équipe", trainer: 'Formateur', agent: 'Agent' },
};

/** A role from today's app's data: "qa" becomes "reviewer", and anything unknown is refused. */
export function roleFromCurrentApp(value: string): Role {
  const parsed = roleSchema.safeParse(value === 'qa' ? 'reviewer' : value);
  if (!parsed.success) throw new Error(`Unknown role in today's data: "${value}"`);
  return parsed.data;
}
