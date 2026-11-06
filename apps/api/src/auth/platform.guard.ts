import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Db, isPlatformAdmin } from '@qsmart/db';
import type { QsRequest } from '../request.js';
import { DB } from '../tokens.js';

/** For the platform owner area: only the owner of Q-smart. (The database checks again in every function.) */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<QsRequest>();
    if (!request.person) throw new UnauthorizedException('Please sign in.');
    if (!(await isPlatformAdmin(this.db, request.person.uid)))
      throw new ForbiddenException('Only the owner of Q-smart.');
    return true;
  }
}
