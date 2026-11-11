// The export centre's list: every Excel file made in the app is written here, with what is needed to make it again
// (the reviews' ids, the quick flags' conversations or the report's settings), never a copy of the rows.
import { addExport, type Membership, membershipOfUser, type Tx } from '@qsmart/db';

/** today's limit: an export bigger than this is listed, but not kept to be made again */
const KEEP_ROWS = 5000;

/** Puts an Excel file in the export centre (with what is needed to make it again, unless it is too big). */
export async function logExport(
  tx: Tx,
  membership: Membership,
  x: { kind: 'reviews' | 'flags' | 'report'; name: string; request: Record<string, unknown>; rows: number },
) {
  const me = await membershipOfUser(tx, membership.userId);
  await addExport(tx, {
    kind: x.kind,
    name: x.name.slice(0, 80) || 'Export',
    request: x.rows <= KEEP_ROWS ? x.request : null,
    rows: x.rows,
    byId: me?.id ?? null,
    byName: membership.userName,
  });
}
