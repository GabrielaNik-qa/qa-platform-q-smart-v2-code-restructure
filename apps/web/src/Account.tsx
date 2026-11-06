// My account (Admin or Settings › Account › My account), as today: Profile, Password, Appearance and Language.
// Notifications & Confirmations come with the notification bell, the next step of Phase 1.
import { LANGUAGES, type Language, ROLE_LABELS } from '@qsmart/shared';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { type ThemeMode, useThemeMode } from './chrome';
import { currentLanguage, setLanguage } from './i18n';
import { useSession } from './session';
import { MIN_PASSWORD } from './SignIn';
import {
  card,
  CheckList,
  type CompanyRef,
  field,
  Notice,
  type PersonRow,
  primaryButton,
  type SkillRow,
  type TeamRow,
  useAction,
} from './ui';

type Tab = 'profile' | 'password' | 'appearance' | 'language';
const TITLE: Record<Tab, string> = { profile: 'acprof', password: 'acpw', appearance: 'acapp', language: 'aclang' };
const NAMES: Record<Language, string> = { en: 'English', bg: 'Български', fr: 'Français' };

export function Account({ tab, company }: { tab: Tab; company: CompanyRef }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-4 max-w-2xl" aria-labelledby="account-title">
      <div>
        <p className="text-sm text-mu">{t('shell.myAccount')}</p>
        <h1 id="account-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t(`menu.pages.${TITLE[tab]}`)}
        </h1>
      </div>
      {tab === 'profile' && <Profile company={company} />}
      {tab === 'password' && <Password />}
      {tab === 'appearance' && <Appearance />}
      {tab === 'language' && <LanguageChoice />}
    </section>
  );
}

function Profile({ company }: { company: CompanyRef }) {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { me, reloadMe } = useSession();
  const [name, setName] = useState(me.name ?? '');
  const [mine, setMine] = useState<PersonRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const { message, run, fail } = useAction();

  const load = useCallback(() => {
    void Promise.all([
      api<PersonRow[]>('/people', company.id),
      api<TeamRow[]>('/teams', company.id),
      api<SkillRow[]>('/skills', company.id),
    ]).then(([people, teamRows, skillRows]) => {
      const me_ = people.find((p) => p.email === me.email?.toLowerCase()) ?? null;
      setMine(me_);
      setChosen(me_?.skillIds ?? []);
      setTeams(teamRows);
      setSkills(skillRows);
    }, fail);
  }, [company.id, me.email, fail]);
  useEffect(load, [load]);

  const team = teams.find((x) => x.id === mine?.teamId);
  const options = (kind: SkillRow['kind']) =>
    skills.filter((s) => s.kind === kind).map((s) => ({ id: s.id, label: s.name }));

  async function save(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (name.trim() !== (me.name ?? ''))
        await api('/me', undefined, { method: 'PATCH', body: { name: name.trim() } });
      await api('/me/skills', company.id, { method: 'PUT', body: { skillIds: chosen } });
    }, t('account.saved'));
    reloadMe();
  }

  return (
    <form onSubmit={save} className={`${card} grid gap-4`}>
      <label className="grid gap-1 text-sm font-medium">
        {t('people.name')}
        <input
          className={field}
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-mu">{t('signIn.email')}</dt>
          <dd className="font-semibold">{me.email}</dd>
        </div>
        <div>
          <dt className="text-mu">{t('shell.company')}</dt>
          <dd className="font-semibold">{company.name}</dd>
        </div>
        <div>
          <dt className="text-mu">{t('people.role')}</dt>
          <dd className="font-semibold">{ROLE_LABELS[lang][company.role]}</dd>
        </div>
        <div>
          <dt className="text-mu">{t('people.team')}</dt>
          <dd className="font-semibold">{mine?.teamName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-mu">{t('teams.lead')}</dt>
          <dd className="font-semibold">{team?.leadName ?? '—'}</dd>
        </div>
      </dl>
      <CheckList legend={t('fields.skills')} options={options('skill')} value={chosen} onChange={setChosen} />
      <CheckList legend={t('fields.languages')} options={options('language')} value={chosen} onChange={setChosen} />
      <div>
        <button type="submit" className={primaryButton}>
          {t('common.save')}
        </button>
      </div>
      <Notice message={message} />
    </form>
  );
}

function Password() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const usesPassword = user.providerData.some((p) => p.providerId === 'password');

  if (!usesPassword) return <p className={`${card} text-sm`}>{t('account.withGoogle')}</p>;

  async function change(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (form.next.length < MIN_PASSWORD)
      return setMessage({ ok: false, text: t('signIn.passwordRule', { count: MIN_PASSWORD }) });
    if (form.next !== form.again) return setMessage({ ok: false, text: t('account.mismatch') });
    try {
      // Firebase asks for the current password again before a new one is set
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', form.current));
      await updatePassword(user, form.next);
      setForm({ current: '', next: '', again: '' });
      setMessage({ ok: true, text: t('account.passwordChanged') });
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setMessage({
        ok: false,
        text:
          code === 'auth/wrong-password' || code === 'auth/invalid-credential'
            ? t('account.wrongCurrent')
            : code === 'auth/weak-password'
              ? t('signIn.passwordRule', { count: MIN_PASSWORD })
              : t('signIn.failed'),
      });
    }
  }

  const input = (key: keyof typeof form, label: string, autoComplete: string) => (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input
        className={field}
        type="password"
        required
        autoComplete={autoComplete}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form onSubmit={change} className={`${card} grid gap-3`}>
      {input('current', t('account.current'), 'current-password')}
      {input('next', t('account.new'), 'new-password')}
      {input('again', t('account.again'), 'new-password')}
      <p className="text-xs text-mu">{t('signIn.passwordRule', { count: MIN_PASSWORD })}</p>
      <div>
        <button type="submit" className={primaryButton}>
          {t('account.update')}
        </button>
      </div>
      <Notice message={message} />
    </form>
  );
}

function Appearance() {
  const { t } = useTranslation();
  const { mode, choose } = useThemeMode();
  const modes: [ThemeMode, string][] = [
    ['light', t('account.light')],
    ['dark', t('account.dark')],
    ['system', t('account.system')],
  ];
  return (
    <div className={`${card} grid gap-3`}>
      <b>{t('account.mode')}</b>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('common.lightDark')}>
        {modes.map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => choose(m)}
            className={`rounded-s border px-4 py-2 text-sm font-semibold ${
              mode === m ? 'border-brand bg-pn2' : 'border-bd hover:border-tx'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-mu">{t('account.themesLater')}</p>
    </div>
  );
}

function LanguageChoice() {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<Language>(currentLanguage);
  const { message, run } = useAction();
  return (
    <div className={`${card} grid gap-3`}>
      <label className="grid gap-1 text-sm font-medium max-w-xs">
        {t('account.languageOfApp')}
        <select
          className={field}
          value={lang}
          onChange={(e) => {
            const next = e.target.value as Language;
            setLanguage(next);
            setLang(next);
            // saved with the account: the same on every browser and device (docs/i18n-glossary.md)
            void run(
              () => api('/me', undefined, { method: 'PATCH', body: { language: next } }),
              i18n.getFixedT(next)('account.saved'),
            );
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-mu">{t('account.languageNote')}</p>
      <Notice message={message} />
    </div>
  );
}
