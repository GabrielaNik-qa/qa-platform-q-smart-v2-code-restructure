// Who is signed in, their companies, and the company of the pages. The company is kept in memory only (plan,
// section 13: the browser keeps only what sign-in and settings need); a reload opens the first company.
import type { Language, Role } from '@qsmart/shared';
import { signOut, type User } from 'firebase/auth';
import { createContext, useContext } from 'react';
import { auth } from './firebase';

/** Admin › Roles & permissions: page → roles, and page → membership → a person's own choice. */
export interface PageRules {
  roles?: Record<string, Role[]>;
  people?: Record<string, Record<string, boolean>>;
}
export interface Company {
  id: string;
  name: string;
  role: Role;
  membershipId: string | null;
  pageRules: PageRules;
}
/** My account › Notifications & Confirmations, saved with the account. */
export interface Prefs {
  info?: boolean;
  confirm?: boolean;
  dismissed?: Record<string, string>;
  /** the columns each table shows (e.g. the Reviews list) */
  columns?: Record<string, string[]>;
  /** Home › Personalize, per company: my home dashboard, my own dashboards, and how the data is counted */
  dashboards?: Record<string, MyDashboards>;
}
export interface MyDashboards {
  home?: string[];
  views?: { id: string; name: string; items: string[] }[];
  base?: 'conversation' | 'review';
  grouping?: 'day' | 'week' | 'month' | 'quarter';
}
export interface Me {
  email: string | null;
  name: string | null;
  /** the language saved with the account (null until chosen) */
  language: Language | null;
  prefs: Prefs;
  platformAdmin: boolean;
  companies: Company[];
}
export interface Session {
  user: User;
  me: Me;
  /** null for the owner of Q-smart when they belong to no company */
  company: Company | null;
  setCompany: (id: string) => void;
  reloadMe: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside a signed-in page');
  return session;
}

/** Signs out and clears what the app kept in this browser for the person (the folded menu sections); the language
 *  and light/dark stay, since the sign-in screen uses them (plan, section 13). */
export async function signOutAndClear(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('qsmart.menu')) localStorage.removeItem(key);
  } catch {
    // private window: nothing was kept
  }
  await signOut(auth);
}
