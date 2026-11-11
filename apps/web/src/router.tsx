// The addresses of the pages: /<app>/<page> (for example /admin/users), and /owner for the owner of Q-smart.
// The typed router of the plan (TanStack Router); every page is drawn inside the sidebar frame (Shell).
import { createRootRoute, createRoute, createRouter, Navigate } from '@tanstack/react-router';
import { CalibrationView } from './Calibration';
import { firstPage, menuOf } from './menu';
import { PageView, NotFound } from './PageView';
import { Platform } from './Platform';
import { ReviewView } from './ReviewView';
import { useSession } from './session';
import { Shell } from './Shell';

/** The first page after sign-in: Quality's first page (today: the dashboard), or the owner area. */
function Start() {
  const { company, me } = useSession();
  const first = company ? menuOf(company)[0] : undefined;
  if (first) return <Navigate to={firstPage(first)} replace />;
  if (me.platformAdmin) return <Navigate to="/owner" replace />;
  return <NotFound />;
}

function Owner() {
  const { me } = useSession();
  return me.platformAdmin ? <Platform /> : <NotFound />;
}

const root = createRootRoute({ component: Shell, notFoundComponent: NotFound });
const start = createRoute({ getParentRoute: () => root, path: '/', component: Start });
const owner = createRoute({ getParentRoute: () => root, path: '/owner', component: Owner });
/** a page; some take a choice from a link (today's agLink and teamLink: the agent or team to open) */
export interface PageSearch {
  agent?: string;
  team?: string;
  /** a saved report to open in the report builder */
  report?: string;
  /** QA Entry: review this conversation (AutoQA's sample), with this scorecard */
  conversation?: string;
  scorecard?: string;
}
const pick = (v: unknown) => (typeof v === 'string' && v.length <= 64 ? v : undefined);
const page = createRoute({
  getParentRoute: () => root,
  path: '/$app/$page',
  component: PageView,
  validateSearch: (search: Record<string, unknown>): PageSearch => {
    const out: PageSearch = {};
    const agent = pick(search.agent);
    const team = pick(search.team);
    if (agent) out.agent = agent;
    if (team) out.team = team;
    const report = pick(search.report);
    if (report) out.report = report;
    const conversation = pick(search.conversation);
    if (conversation) out.conversation = conversation;
    const scorecard = pick(search.scorecard);
    if (scorecard) out.scorecard = scorecard;
    return out;
  },
});
/** one review: from the bell, the list of reviews and QA Entry */
const review = createRoute({ getParentRoute: () => root, path: '/review/$id', component: ReviewView });

/** one calibration session: from the bell and the Calibration page */
const calibration = createRoute({ getParentRoute: () => root, path: '/calibration/$id', component: CalibrationView });

export const router = createRouter({ routeTree: root.addChildren([start, owner, review, calibration, page]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
