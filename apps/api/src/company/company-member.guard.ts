import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Db, membershipsFor } from '@qsmart/db';
import { z } from 'zod';
import type { QsRequest } from '../request.js';
import { DB } from '../tokens.js';

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
    if (!request.person) throw new UnauthorizedException('Please sign in.');
    const companyId = companyIdSchema.safeParse(request.headers['x-company-id']);
    if (!companyId.success) throw new BadRequestException('Choose a company first.');
    const memberships = await membershipsFor(this.db, request.person.uid);
    const membership = memberships.find((m) => m.companyId === companyId.data);
    if (!membership) throw new ForbiddenException('You are not a member of this company.');
    request.membership = membership;
    return true;
  }
}
