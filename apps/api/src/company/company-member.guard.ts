import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type Db, membershipsFor } from '@qsmart/db';
import { z } from 'zod';
import type { QsRequest } from '../request.js';
import { DB } from '../tokens.js';
import { badRequest, forbidden, unauthorized } from '../errors.js';

const companyIdSchema = z.uuid();

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
    if (!membership) throw forbidden('notMember');
    request.membership = membership;
    return true;
  }
}
