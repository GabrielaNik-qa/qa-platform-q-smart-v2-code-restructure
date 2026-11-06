import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { QsRequest } from './request.js';

/** The signed-in person (checked by SignedInGuard). */
export const Person = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const person = context.switchToHttp().getRequest<QsRequest>().person;
  if (!person) throw new UnauthorizedException('Please sign in.');
  return person;
});

/** The person's membership in the company of the request (checked by CompanyMemberGuard). */
export const CurrentMembership = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const membership = context.switchToHttp().getRequest<QsRequest>().membership;
  if (!membership) throw new UnauthorizedException('Choose a company first.');
  return membership;
});
