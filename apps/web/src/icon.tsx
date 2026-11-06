// Today's line icons (current-app/public/js/core.js, IC), drawn from menu-data.ts.
import { ICONS, type IconName } from './menu-data';

/** One of today's line icons. */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // today's icon drawings, from our own code (menu-data.ts): never text typed by anyone
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
