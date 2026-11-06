// The notification bell, as today: the number of unread notifications on it; a click shows the list (newest first),
// marks them read, and each one opens its page. Each person sees only their own; new ones show up by themselves.
import { ROLE_LABELS, type Role, ROLES } from '@qsmart/shared';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { when } from './Activity';
import { currentLanguage } from './i18n';
import { Icon } from './icon';
import type { Company } from './session';

interface Note {
  id: string;
  at: string;
  kind: string;
  details: Record<string, string>;
  link: string | null;
  read: boolean;
}

const EVERY = 30_000; // today: every 20 s and when you come back to the tab

export function Bell({ company }: { company: Company }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<Note[]>('/notifications', company.id).then(setNotes, () => undefined);
  }, [company.id]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, EVERY);
    const back = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const unread = notes.filter((n) => !n.read).length;
  const kindOf = (n: Note) => {
    if ((n.kind === 'reviewNew' || n.kind === 'reviewUpdated') && !n.details['score']) return `${n.kind}NotScored`;
    if (n.kind === 'flagGiven')
      return `flag${n.details['type'] === 'green' ? 'Green' : 'Red'}${n.details['comment'] ? 'Comment' : ''}`;
    if (n.kind === 'disputeResolved') {
      const outcome = n.details['outcome'] ?? 'kept';
      return `disputeResolved${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`;
    }
    return n.kind;
  };
  const text = (n: Note) =>
    t(`bell.kinds.${kindOf(n)}`, {
      ...n.details,
      role: ROLES.includes(n.details['role'] as Role) ? ROLE_LABELS[lang][n.details['role'] as Role] : '',
      channel: n.details['channel'] ? t(`reviews.channelNouns.${n.details['channel']}`) : '',
      defaultValue: n.kind,
    });

  const show = () => {
    // the ones unread when the list opens stay highlighted while it's open (as today)
    setFresh(notes.filter((n) => !n.read).map((n) => n.id));
    setOpen(true);
    if (unread)
      void api('/notifications/read', company.id, { method: 'POST', body: {} }).then(() =>
        setNotes((list) => list.map((n) => ({ ...n, read: true }))),
      );
  };
  const remove = (id: string) => {
    // the question before deleting anything is always asked (today's rule)
    if (!window.confirm(t('bell.delete') + '?')) return;
    setNotes((list) => list.filter((n) => n.id !== id));
    void api(`/notifications/${id}`, company.id, { method: 'DELETE' }).catch(load);
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className="relative inline-grid place-items-center size-10 rounded-full border border-bd bg-pn text-tx hover:border-tx"
        aria-label={`${t('bell.title')}${unread ? ` (${t('bell.unread', { count: unread })})` : ''}`}
        aria-expanded={open}
        title={t('bell.title')}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <sup className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-brand text-on-brand text-[11px] font-bold grid place-items-center">
            {unread}
          </sup>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-[min(380px,90vw)] max-h-[70vh] overflow-auto rounded-l border border-bd bg-pn shadow-card"
          role="dialog"
          aria-label={t('bell.title')}
        >
          <div className="flex items-center justify-between gap-2 border-b border-bd px-4 py-3">
            <h2 className="font-display text-lg font-bold">{t('bell.title')}</h2>
            {fresh.length > 0 && (
              <span className="rounded-full bg-yellow px-2 text-xs font-semibold text-ink">
                {t('bell.unread', { count: fresh.length })}
              </span>
            )}
          </div>
          {notes.length === 0 && <p className="px-4 py-6 text-sm text-mu">{t('bell.none')}</p>}
          <ul>
            {notes.map((n) => (
              <li
                key={n.id}
                className={`flex gap-3 border-b border-bd px-4 py-3 last:border-0 ${fresh.includes(n.id) ? 'bg-pn2' : ''}`}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => {
                    setOpen(false);
                    if (n.link) void navigate({ to: n.link });
                  }}
                >
                  <div className="text-sm">{text(n)}</div>
                  <small className="font-mono text-xs text-mu">{when(n.at, lang)}</small>
                </button>
                <button
                  type="button"
                  className="self-start text-mu hover:text-bad"
                  aria-label={t('bell.delete')}
                  title={t('bell.delete')}
                  onClick={() => remove(n.id)}
                >
                  <Icon name="bin" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
