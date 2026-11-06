// Today's loading animation "Heartbeat" (current-app/public/js/loader.js): it plays from "Sign in" until the first
// page is ready, and when the app opens already signed in. It always shows long enough not to flicker.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './loader.css';

const LEFT = ['M182,42 Q172,62 182,82', 'M166,32 Q152,62 166,92', 'M150,24 Q132,62 150,100'];
const RIGHT = ['M298,42 Q308,62 298,82', 'M314,32 Q328,62 314,92', 'M330,24 Q348,62 330,100'];

export function QLoader({ on }: { on: boolean }) {
  const { t } = useTranslation();
  return (
    <div id="qload" role="status" className={on ? 'on' : 'off'} aria-hidden={!on}>
      <svg viewBox="0 0 480 130" aria-hidden="true" style={{ overflow: 'visible' }}>
        <path className="qlecg" d="M4,62 L70,62 L82,62 L90,40 L98,86 L106,30 L114,62 L140,62" stroke="#FF5C8A" />
        <path className="qlecg" d="M340,62 L366,62 L374,30 L382,86 L390,40 L398,62 L410,62 L476,62" stroke="#FF6B00" />
        <g className="qlbeat" fill="none" strokeLinecap="round" strokeWidth="6">
          {LEFT.map((d, i) => (
            <path key={d} d={d} stroke={['#FFD447', '#FF9A1F', '#FF5C8A'][i]} />
          ))}
        </g>
        <g className="qlbeat" fill="none" strokeLinecap="round" strokeWidth="6">
          {RIGHT.map((d, i) => (
            <path key={d} d={d} stroke={['#FFD447', '#FF9A1F', '#FF6B00'][i]} />
          ))}
        </g>
        <circle cx="240" cy="62" r="40" fill="none" stroke="#FF6B00" strokeWidth="10" />
        <path d="M266,90 L286,110" stroke="#FF5C8A" strokeWidth="10" strokeLinecap="round" />
        <text className="qlt" x="240" y="75" textAnchor="middle">
          Q
        </text>
      </svg>
      <div className="qldots">
        <i />
        <i />
        <i />
      </div>
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

/** True while `busy`, and for at least `ms` after the page part appeared (today: a full heartbeat, 1.6 s). */
export function useAtLeast(busy: boolean, ms: number): boolean {
  const [since] = useState(() => Date.now());
  const [shown, setShown] = useState(busy);
  useEffect(() => {
    if (busy) {
      setShown(true);
      return;
    }
    const timer = setTimeout(() => setShown(false), Math.max(0, ms - (Date.now() - since)));
    return () => clearTimeout(timer);
  }, [busy, ms, since]);
  return shown;
}
