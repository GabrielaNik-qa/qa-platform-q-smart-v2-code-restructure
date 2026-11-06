import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, scopeOf } from '@qsmart/shared';
import type { QsRequest } from '../request.js';

const PERMISSION = 'qsmart:permission';

/** The right a route needs (today's permission matrix, packages/shared/src/permissions.ts). */
export const Allow = (permission: Permission) => SetMetadata(PERMISSION, permission);

/**
 * After CompanyMemberGuard: lets the request through only when the person's role in this company has the route's
 * right, and records how far it reaches (all, workspace, own …) for the route to apply.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) throw new ForbiddenException('This page has no permission rule.'); // never open by mistake
    const request = context.switchToHttp().getRequest<QsRequest>();
    if (!request.membership) throw new UnauthorizedException('Choose a company first.');
    const scope = scopeOf(request.membership.role, permission);
    if (!scope) throw new ForbiddenException('Your role does not allow this.');
    request.scope = scope;
    return true;
  }
}
