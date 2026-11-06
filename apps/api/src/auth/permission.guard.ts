import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, scopeOf } from '@qsmart/shared';
import type { QsRequest } from '../request.js';
import { forbidden, unauthorized } from '../errors.js';

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
    if (!permission) throw forbidden('noRule'); // never open by mistake
    const request = context.switchToHttp().getRequest<QsRequest>();
    if (!request.membership) throw unauthorized('chooseCompany');
    const scope = scopeOf(request.membership.role, permission);
    if (!scope) throw forbidden('notAllowed');
    request.scope = scope;
    return true;
  }
}
