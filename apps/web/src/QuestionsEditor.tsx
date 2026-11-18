// The questions of a lesson test or a quiz, written by hand or by the AI question writer: a text, 2 to 6 answers with the
// right one marked, and why it is right. Shared by the Knowledge Base's lesson tests and the Quizzes.
import { useTranslation } from 'react-i18next';
import { dangerButton, field, smallButton } from './ui';

export interface Question {
  q: string;
  opts: string[];
  a: number;
  why: string;
}
export const blankQuestion = (): Question => ({ q: '', opts: ['', '', '', ''], a: 0, why: '' });

export function QuestionsEditor({
  questions,
  onChange,
  name,
  onWrite,
  writing,
}: {
  questions: Question[];
  onChange: (q: Question[]) => void;
  /** a unique name for the radio groups on the page */
  name: string;
  /** the AI question writer's button (none: no button) */
  onWrite?: () => void;
  writing?: boolean;
}) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<Question>) =>
    onChange(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <div className="grid gap-3">
      {questions.map((q, i) => (
        <fieldset key={i} className="grid gap-2 rounded-s border border-bd p-3">
          <legend className="px-1 text-sm font-semibold">{t('kb.question', { n: i + 1 })}</legend>
          <div className="flex gap-2">
            <input
              aria-label={t('kb.question', { n: i + 1 })}
              className={`${field} flex-1`}
              maxLength={400}
              value={q.q}
              onChange={(e) => set(i, { q: e.target.value })}
            />
            <button
              type="button"
              className={dangerButton}
              onClick={() => onChange(questions.filter((_, k) => k !== i))}
            >
              {t('kb.removeQuestion')}
            </button>
          </div>
          {q.opts.map((o, j) => (
            <div key={j} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${name}-correct-${i}`}
                title={t('kb.correct')}
                aria-label={t('kb.correct')}
                className="accent-[var(--brand)]"
                checked={q.a === j}
                onChange={() => set(i, { a: j })}
              />
              <input
                aria-label={t('kb.answer', { n: j + 1 })}
                placeholder={t('kb.answer', { n: j + 1 })}
                className={`${field} flex-1`}
                maxLength={200}
                value={o}
                onChange={(e) => set(i, { opts: q.opts.map((x, k) => (k === j ? e.target.value : x)) })}
              />
            </div>
          ))}
          <input
            aria-label={t('kb.why')}
            placeholder={t('kb.why')}
            className={field}
            maxLength={400}
            value={q.why}
            onChange={(e) => set(i, { why: e.target.value })}
          />
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        {questions.length < 30 && (
          <button type="button" className={smallButton} onClick={() => onChange([...questions, blankQuestion()])}>
            + {t('kb.addQuestion')}
          </button>
        )}
        {onWrite && (
          <button type="button" className={smallButton} disabled={writing} onClick={onWrite}>
            ✨ {writing ? t('kb.ai.writing') : t('kb.ai.write')}
          </button>
        )}
      </div>
      {onWrite && <p className="text-xs text-mu">{t('kb.ai.help')}</p>}
    </div>
  );
}
