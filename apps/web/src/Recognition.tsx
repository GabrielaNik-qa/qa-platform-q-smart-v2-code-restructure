// Quality › Performance › Recognition (today's perf.js `PG.kudos`): say thank you with a badge, the kudos wall, and this
// month's leaderboard (counted by the server: kudos ×5, green flags ×3, task points, +10 at the team's target, the
// average ÷ 10 from 3 reviews). Everyone gives kudos (never to themselves) and reads the wall and the leaderboard;
// the person who gave kudos, or an admin, deletes them.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { AgentLink, BAND_TEXT, band, Table } from './bits';
import { monthName } from './Goals';
import type { PassRates } from './QAEntry';
import { useSession } from './session';
import { card, type CompanyRef, field, Notice, type PersonRow, primaryButton, smallButton, useAction } from './ui';

export interface Kudos {
  id: string;
  toId: string | null;
  toName: string;
  badge: string;
  text: string;
  byId: string | null;
  byName: string;
  createdAt: string;
}
interface Row {
  membershipId: string;
  name: string;
  teamId: string | null;
  teamName: string;
  reviews: number;
  kudos: number;
  green: number;
  taskPoints: number;
  average: number | null;
  points: number;
}
const BADGES = ['⭐', '🏆', '🎯', '💚', '🚀', '🔥', '👏', '🧠', '💬', '🤝'];
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function Recognition({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const { company: session } = useSession();
  const { message, run, fail } = useAction();
  const agentView = company.role === 'agent';
  const [kudos, setKudos] = useState<Kudos[] | null>(null);
  const [board, setBoard] = useState<Row[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [rates, setRates] = useState<PassRates | null>(null);
  const [form, setForm] = useState({ toId: '', badge: '⭐', text: '' });

  const load = useCallback(() => {
    void Promise.all([
      api<Kudos[]>('/kudos', company.id),
      api<Row[]>(`/kudos/board?month=${thisMonth()}`, company.id),
    ]).then(([k, b]) => {
      setKudos(k);
      setBoard(b);
    }, fail);
  }, [company.id, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    void Promise.all([
      api<PersonRow[]>('/people', company.id).catch(() => []),
      api<PassRates>('/pass-rates', company.id).catch(() => null),
    ]).then(([ppl, pr]) => {
      setPeople(
        ppl
          .filter((p) => p.active && p.membershipId !== session?.membershipId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setRates(pr);
    });
  }, [company.id, session?.membershipId]);

  const send = () =>
    void run(
      () => api('/kudos', company.id, { method: 'POST', body: form }),
      t('kudos.sent'),
      () => {
        setForm({ toId: '', badge: '⭐', text: '' });
        load();
      },
    );
  const best = board.filter((r) => r.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0];
  const most = [...board].sort((a, b) => b.kudos - a.kudos)[0];
  const greenest = [...board].sort((a, b) => b.green - a.green)[0];
  const highlight = (title: string, name: string, sub: string) => (
    <div className={`${card} !p-4 grid content-start gap-1`}>
      <span className="text-sm">{title}</span>
      <b className="text-lg">{name}</b>
      <small className="text-xs text-mu">{sub}</small>
    </div>
  );
  const name = (id: string | null, n: string) => (agentView ? n : <AgentLink id={id} name={n} />);

  return (
    <section className="grid gap-4" aria-labelledby="kudos-title">
      <div className="grid gap-1">
        <h1 id="kudos-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('menu.pages.kudos')}
        </h1>
        <p className="text-sm text-mu">{t('kudos.intro')}</p>
      </div>
      <Notice message={message} />
      <div className="grid gap-3 sm:grid-cols-3">
        {best &&
          highlight(
            `🏆 ${t('kudos.best')}`,
            best.name,
            t('kudos.bestDetail', { value: (best.average ?? 0).toFixed(1), count: best.reviews }),
          )}
        {most &&
          most.kudos > 0 &&
          highlight(`⭐ ${t('kudos.most')}`, most.name, t('kudos.count', { count: most.kudos }))}
        {greenest &&
          greenest.green > 0 &&
          highlight(`💚 ${t('kudos.greenest')}`, greenest.name, t('kudos.greenCount', { count: greenest.green }))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <div className={`${card} grid gap-3`}>
            <h2 className="font-semibold">{t('kudos.give')}</h2>
            <label className="grid gap-1 text-sm font-medium">
              {t('kudos.to')}
              <select className={field} value={form.toId} onChange={(e) => setForm({ ...form, toId: e.target.value })}>
                <option value="">{t('kudos.choose')}</option>
                {people.map((p) => (
                  <option key={p.membershipId} value={p.membershipId}>
                    {p.name}
                    {p.teamName ? ` · ${p.teamName}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-sm font-medium">
              {t('kudos.badge')}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('kudos.badge')}>
                {BADGES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={form.badge === b}
                    className={`rounded-full border px-2.5 py-1 text-lg ${form.badge === b ? 'border-brand bg-pn2' : 'border-bd'}`}
                    onClick={() => setForm({ ...form, badge: b })}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              {t('kudos.message')}
              <textarea
                className={field}
                rows={3}
                maxLength={500}
                placeholder={t('kudos.placeholder')}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </label>
            <div>
              <button type="button" className={primaryButton} disabled={!form.toId || !form.text.trim()} onClick={send}>
                {t('kudos.send')}
              </button>
            </div>
          </div>
          <div className={`${card} grid gap-2`}>
            <h2 className="flex items-center gap-2 font-semibold">
              {t('kudos.wall')}
              <span className="rounded-full bg-bd/60 px-2 text-xs font-normal">{kudos?.length ?? 0}</span>
            </h2>
            {!kudos ? (
              <p className="text-mu">{t('common.loading')}</p>
            ) : kudos.length ? (
              kudos.slice(0, 40).map((k) => (
                <div key={k.id} className="flex items-start gap-3 border-t border-bd py-2 first:border-t-0">
                  <span className="text-2xl" aria-hidden="true">
                    {k.badge}
                  </span>
                  <div className="grid flex-1 gap-0.5 text-sm">
                    <span>
                      <b>{k.byName}</b> → <b>{name(k.toId, k.toName)}</b>
                    </span>
                    <span className="whitespace-pre-wrap">{k.text}</span>
                    <small className="text-mu">{k.createdAt.slice(0, 10)}</small>
                  </div>
                  {(k.byId === session?.membershipId || company.role === 'admin') && (
                    <button
                      type="button"
                      className={`${smallButton} text-bad`}
                      onClick={() => {
                        if (!window.confirm(t('kudos.confirmDelete'))) return;
                        void run(
                          () => api(`/kudos/${k.id}`, company.id, { method: 'DELETE' }),
                          t('goals.deleted'),
                          load,
                        );
                      }}
                    >
                      {t('goals.delete')}
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-mu">{t('kudos.none')}</p>
            )}
          </div>
        </div>
        <div className={`${card} grid gap-2`}>
          <h2 className="font-semibold">{t('kudos.board', { month: monthName(thisMonth()) })}</h2>
          <Table
            head={[
              '#',
              t('cats.agent'),
              t('kudos.cols.points'),
              t('kudos.cols.kudos'),
              t('kudos.cols.green'),
              t('kudos.cols.xp'),
              t('cats.average'),
            ]}
            rows={board.slice(0, 15).map((r, i) => [
              ['🥇', '🥈', '🥉'][i] ?? i + 1,
              name(r.membershipId, r.name),
              <b key="p">{r.points}</b>,
              r.kudos,
              r.green,
              r.taskPoints,
              r.average === null ? (
                <small key="a" className="text-mu">
                  -
                </small>
              ) : (
                <span key="a" className={`font-mono ${BAND_TEXT[band(r.average, rates, r.teamId)]}`}>
                  {r.average.toFixed(1)}%
                </span>
              ),
            ])}
          />
          <p className="text-xs text-mu">{t('kudos.pointsHelp')}</p>
        </div>
      </div>
    </section>
  );
}
