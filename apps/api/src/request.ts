import type { Membership } from '@qsmart/db';
import type { Scope } from '@qsmart/shared';
import type { FastifyRequest } from 'fastify';
import type { VerifiedPerson } from './auth/token-verifier.js';

/** A request after the guards: who is signed in, their membership in the company of the request, and how far
 *  the route's right reaches for them. */
export type QsRequest = FastifyRequest & { person?: VerifiedPerson; membership?: Membership; scope?: Scope };
