// Guided tours (Phase 6, piece 4; today's tour bar): a tour opens the real pages one after the other, with a bar at the
// bottom (Back, Next, close). Only the running tour is kept, in this browser tab, so a reload carries on where it was.
import { useNavigate } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

export interface TourStep {
  title: string;
  text: string;
  page: string;
}
interface Running {
  name: string;
  steps: TourStep[];
  at: number;
}

const KEY = 'qsmart.tour';
let running: Running | null = readSaved();
const listeners = new Set<() => void>();

function readSaved(): Running | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Running | null;
    return saved && Array.isArray(saved.steps) && saved.steps[saved.at] ? saved : null;
  } catch {
    return null;
  }
}
function set(next: Running | null) {
  running = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // a private window keeps nothing: the tour still runs
  }
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Starts a tour at its first step (the page itself is opened by the caller with `goTo`). */
export function startTour(name: string, steps: TourStep[]): TourStep | undefined {
  if (!steps.length) return undefined;
  set({ name, steps, at: 0 });
  return steps[0];
}
export const stopTour = () => set(null);

/** The bar at the bottom of the pages while a tour runs. */
export function TourBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tour = useSyncExternalStore(subscribe, () => running);
  if (!tour) return null;
  const step = tour.steps[tour.at];
  if (!step) return null;
  const go = (at: number) => {
    const next = tour.steps[at];
    if (!next) return stopTour();
    set({ ...tour, at });
    const [app, page] = next.page.split('/');
    if (app && page) void navigate({ to: '/$app/$page', params: { app, page } });
  };
  const last = tour.at + 1 >= tour.steps.length;
  return (
    <div
      role="dialog"
      aria-label={tour.name}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-2xl gap-2 rounded-m border border-bd2 bg-pn p-4 shadow-lg"
    >
      <small className="text-mu">
        {tour.name} · {t('help.tourStep', { n: tour.at + 1, total: tour.steps.length })}
      </small>
      <b>{step.title}</b>
      {step.text && <p className="text-sm">{step.text}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-s border border-bd px-3 py-1 text-sm font-semibold disabled:opacity-50"
          disabled={tour.at === 0}
          onClick={() => go(tour.at - 1)}
        >
          {t('help.back')}
        </button>
        <button
          type="button"
          className="rounded-s bg-brand px-3 py-1 text-sm font-semibold text-on-brand"
          onClick={() => (last ? stopTour() : go(tour.at + 1))}
        >
          {last ? t('help.finish') : t('help.next')}
        </button>
        <button
          type="button"
          className="rounded-s border border-bd px-2 py-1 text-sm"
          aria-label={t('help.closeTour')}
          onClick={stopTour}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
