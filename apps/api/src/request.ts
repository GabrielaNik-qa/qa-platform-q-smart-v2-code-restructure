import type { Membership } from '@qsmart/db';
import type { FastifyRequest } from 'fastify';
import type { VerifiedPerson } from './auth/token-verifier.js';

/** A request after the guards: who is signed in, and their membership in the company of the request. */
export type QsRequest = FastifyRequest & { person?: VerifiedPerson; membership?: Membership };
