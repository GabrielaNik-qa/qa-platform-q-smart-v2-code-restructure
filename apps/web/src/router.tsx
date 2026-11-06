// The addresses of the pages: /<app>/<page> (for example /admin/users), and /owner for the owner of Q-smart.
// The typed router of the plan (TanStack Router); every page is drawn inside the sidebar frame (Shell).
import { createRootRoute, createRoute, createRouter, Navigate } from '@tanstack/react-router';
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
const page = createRoute({ getParentRoute: () => root, path: '/$app/$page', component: PageView });
/** one review: from the bell, the list of reviews and QA Entry */
const review = createRoute({ getParentRoute: () => root, path: '/review/$id', component: ReviewView });

export const router = createRouter({ routeTree: root.addChildren([start, owner, review, page]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
