import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type Db, isPlatformAdmin } from '@qsmart/db';
import type { QsRequest } from '../request.js';
import { DB } from '../tokens.js';
import { forbidden, unauthorized } from '../errors.js';

/** For the platform owner area: only the owner of Q-smart. (The database checks again in every function.) */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<QsRequest>();
    if (!request.person) throw unauthorized('signIn');
    if (!(await isPlatformAdmin(this.db, request.person.uid))) throw forbidden('ownerOnly');
    return true;
  }
}
