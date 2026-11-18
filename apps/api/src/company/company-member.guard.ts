import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type Db, DEMO_COMPANY, isPlatformAdmin, membershipsFor, platformCompanies } from '@qsmart/db';
import { z } from 'zod';
import type { QsRequest } from '../request.js';
import { DB } from '../tokens.js';
import { badRequest, forbidden, unauthorized } from '../errors.js';

const companyIdSchema = z.uuid();
/** The owner acting in the demo company has no membership there: no person's row is ever pointed at. */
const OWNER_ACTING = '00000000-0000-0000-0000-000000000000';

/**
 * For company pages: the request names its company ("X-Company-Id"). It goes through only when the signed-in
 * person belongs to that company, and the person's role there comes along for the permission checks.
 */
@Injectable()
export class CompanyMemberGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<QsRequest>();
    if (!request.person) throw unauthorized('signIn');
    const companyId = companyIdSchema.safeParse(request.headers['x-company-id']);
    if (!companyId.success) throw badRequest('chooseCompany');
    const memberships = await membershipsFor(this.db, request.person.uid);
    const membership = memberships.find((m) => m.companyId === companyId.data);
    if (membership) {
      request.membership = membership;
      return true;
    }
    // The owner of Q-smart may open Q-smart's own demo company (made-up data) as an administrator, to measure the AI
    // models on its test set (Phase 6). Never a client company: that needs the company's own permission.
    if (await isPlatformAdmin(this.db, request.person.uid)) {
      const demo = (await platformCompanies(this.db, request.person.uid)).find(
        (c) => c.id === companyId.data && c.name === DEMO_COMPANY,
      );
      if (demo) {
        request.membership = {
          companyId: demo.id,
          companyName: demo.name,
          role: 'admin',
          userId: OWNER_ACTING,
          userName: request.person.name ?? 'Q-smart owner',
        };
        return true;
      }
    }
    throw forbidden('notMember');
  }
}
