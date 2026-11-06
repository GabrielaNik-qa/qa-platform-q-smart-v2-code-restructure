import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { QsRequest } from './request.js';
import { unauthorized } from './errors.js';

/** The signed-in person (checked by SignedInGuard). */
export const Person = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const person = context.switchToHttp().getRequest<QsRequest>().person;
  if (!person) throw unauthorized('signIn');
  return person;
});

/** The person's membership in the company of the request (checked by CompanyMemberGuard). */
export const CurrentMembership = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const membership = context.switchToHttp().getRequest<QsRequest>().membership;
  if (!membership) throw unauthorized('chooseCompany');
  return membership;
});

/** How far the route's right reaches for this person: all, workspace, own … (set by PermissionGuard). */
export const CurrentScope = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const scope = context.switchToHttp().getRequest<QsRequest>().scope;
  if (!scope) throw unauthorized('notAllowed');
  return scope;
});
