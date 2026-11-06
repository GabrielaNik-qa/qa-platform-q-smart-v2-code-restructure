// Small building blocks shared by the company pages: the shapes the server sends, form styles, tags, checkbox lists,
// and the message shown after an action.
import type { Role } from '@qsmart/shared';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from './api';

export interface CompanyRef {
  id: string;
  name: string;
  role: Role;
}
export interface TeamRow {
  id: string;
  name: string;
  isAdministration: boolean;
  description: string;
  color: string;
  leadId: string | null;
  leadName: string | null;
  members: number;
  skillIds: string[];
}
export interface WorkspaceRow {
  id: string;
  name: string;
  description: string;
  color: string;
  teamIds: string[];
  staffIds: string[];
}
export interface SkillRow {
  id: string;
  kind: 'skill' | 'language';
  name: string;
  people: number;
  teams: number;
}
export interface PersonRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  active: boolean;
  accepted: boolean;
  skillIds: string[];
  workspaceIds: string[];
}

export const field = 'rounded-s border border-bd2 bg-pn px-2 py-1.5 text-tx focus:border-brand';
export const smallButton = 'rounded-s border border-bd px-2 py-1 text-xs font-semibold hover:border-tx';
export const dangerButton = 'rounded-s border border-bd px-2 py-1 text-xs font-semibold text-bad hover:border-bad';
export const primaryButton = 'rounded-m bg-brand text-on-brand font-semibold px-4 py-2 disabled:opacity-60';
export const card = 'bg-pn border border-bd rounded-m p-5';

/**
 * Runs an action, then shows what happened (the server's reason in the person's language when refused) and, when it
 * worked, reloads the page's data.
 */
export function useAction() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(
    async (action: () => Promise<unknown>, done: string, reload?: () => void): Promise<boolean> => {
      setMessage(null);
      try {
        await action();
        setMessage({ ok: true, text: done });
        reload?.();
        return true;
      } catch (e) {
        setMessage({ ok: false, text: errorText(t, e) });
        return false;
      }
    },
    [t],
  );
  const fail = useCallback((e: unknown) => setMessage({ ok: false, text: errorText(t, e) }), [t]);
  return { message, run, fail };
}

export function Notice({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-ok' : 'text-bad'}`}>
      {message.text}
    </p>
  );
}

export function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-bd bg-pn2 px-2 py-0.5 text-xs">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A list of checkboxes (skills, teams, staff …) inside a named group. */
export function CheckList({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-sm font-medium mb-1">{legend}</legend>
      {options.length === 0 && <p className="text-sm text-mu">{t('common.none')}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.id} className="inline-flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--brand)]"
              checked={value.includes(o.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((id) => id !== o.id))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Names for a list of ids, in the list's order (unknown ids are skipped). */
export const namesOf = (ids: string[], rows: { id: string; name: string }[]) =>
  rows.filter((r) => ids.includes(r.id)).map((r) => r.name);
