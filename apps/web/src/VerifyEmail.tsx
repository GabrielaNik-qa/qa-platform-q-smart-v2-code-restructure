import { sendEmailVerification, type User } from 'firebase/auth';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Shown to a person whose e-mail Firebase hasn't confirmed yet: invitations wait until it's confirmed. */
export function VerifyEmail({ user, onConfirmed }: { user: User; onConfirmed: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  async function check() {
    await user.reload();
    if (user.emailVerified) {
      await user.getIdToken(true); // a fresh proof of sign-in that says "verified"
      onConfirmed();
    } else setNote(t('verify.notYet'));
  }

  return (
    <section className="bg-pn border border-brand rounded-m p-5 grid gap-3" aria-labelledby="verify-title">
      <h2 id="verify-title" className="font-display text-xl font-bold">
        {t('verify.title')}
      </h2>
      <p>{t('verify.text', { email: user.email ?? '' })}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-m bg-brand text-on-brand font-semibold px-4 py-2"
          onClick={() => void check()}
        >
          {t('verify.done')}
        </button>
        <button
          type="button"
          className="rounded-m border border-bd2 font-semibold px-4 py-2 hover:border-tx"
          onClick={() =>
            void sendEmailVerification(user).then(
              () => setNote(t('verify.resent')),
              () => setNote(t('verify.wait')),
            )
          }
        >
          {t('verify.resend')}
        </button>
      </div>
      {note && (
        <p role="status" className="text-sm text-mu">
          {note}
        </p>
      )}
    </section>
  );
}
