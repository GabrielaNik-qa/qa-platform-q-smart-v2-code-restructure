// My account › Notifications & Confirmations, as today: welcome messages and tips, routine confirmations, the
// messages switched off with "Don't show me this again", and what is always shown. Saved with the account.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { currentLanguage } from './i18n';
import { when } from './Activity';
import { type Prefs as PrefsData, useSession } from './session';
import { card, Notice, smallButton, useAction } from './ui';

export function Prefs() {
  const { t } = useTranslation();
  const lang = currentLanguage();
  const { me, reloadMe } = useSession();
  const [prefs, setPrefs] = useState<PrefsData>(me.prefs);
  const { message, run } = useAction();
  const info = prefs.info ?? true;
  const confirm = prefs.confirm ?? true;
  const off = Object.entries(prefs.dismissed ?? {});

  const save = (next: PrefsData, done: string) => {
    setPrefs(next);
    void run(() => api('/me/prefs', undefined, { method: 'PUT', body: next }), done, reloadMe);
  };

  const section = 'grid gap-2 border-t border-bd pt-4 first:border-0 first:pt-0';
  const toggle = (on: boolean, label: string, text: string, change: (on: boolean) => void) => (
    <label className="flex gap-3 items-start text-sm">
      <input
        type="checkbox"
        className="mt-1 accent-[var(--brand)]"
        checked={on}
        onChange={(e) => change(e.target.checked)}
      />
      <span>
        <b>{label}</b>
        <br />
        <small className="text-mu">{text}</small>
      </span>
    </label>
  );
  return (
    <section className="grid gap-4 max-w-2xl" aria-labelledby="prefs-title">
      <div>
        <p className="text-sm text-mu">{t('shell.myAccount')}</p>
        <h1 id="prefs-title" className="lane font-display text-3xl font-bold uppercase tracking-wide">
          {t('menu.pages.acnotif')}
        </h1>
      </div>
      <div className={`${card} grid gap-4`}>
        <div className={section}>
          <h2 className="font-semibold">{t('prefs.info')}</h2>
          {toggle(info, t('prefs.infoSwitch'), t('prefs.infoText'), (on) =>
            save({ ...prefs, info: on }, t('account.saved')),
          )}
        </div>
        <div className={section}>
          <h2 className="font-semibold">{t('prefs.confirm')}</h2>
          {toggle(confirm, t('prefs.confirmSwitch'), t('prefs.confirmText'), (on) =>
            save({ ...prefs, confirm: on }, t('account.saved')),
          )}
        </div>
        <div className={section}>
          <h2 className="font-semibold">{t('prefs.off')}</h2>
          {off.length === 0 ? (
            <p className="text-sm text-mu">{t('prefs.offNone')}</p>
          ) : (
            <ul className="text-sm grid gap-1">
              {off.map(([id, at]) => (
                <li key={id}>
                  {id} <small className="text-mu">{when(at, lang)}</small>
                </li>
              ))}
            </ul>
          )}
          <div>
            <button
              type="button"
              className={smallButton}
              disabled={off.length === 0}
              onClick={() => save({ ...prefs, dismissed: {} }, t('prefs.resetDone'))}
            >
              {t('prefs.reset')}
            </button>
          </div>
        </div>
        <div className={section}>
          <h2 className="font-semibold">{t('prefs.always')}</h2>
          <div className="rounded-m border border-bd bg-pn2 p-3 text-sm">
            <b>{t('prefs.alwaysIntro')}</b>
            <ul className="list-disc pl-5 mt-1">
              <li>{t('prefs.always1')}</li>
              <li>{t('prefs.always2')}</li>
              <li>{t('prefs.always3')}</li>
              <li>{t('prefs.always4')}</li>
            </ul>
          </div>
        </div>
        <div className={section}>
          <h2 className="font-semibold">{t('prefs.start')}</h2>
          <p className="text-sm">{t('prefs.startText')}</p>
          <div>
            <button type="button" className={smallButton} onClick={() => save({}, t('prefs.defaultsDone'))}>
              {t('prefs.defaults')}
            </button>
          </div>
        </div>
        <small className="text-mu">{t('prefs.savedWithAccount')}</small>
        <Notice message={message} />
      </div>
    </section>
  );
}
