import { BadRequestException, Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import {
  claimInvitation,
  type Db,
  isPlatformAdmin,
  type Membership,
  membershipsFor,
  platformCompanies,
  platformCreateCompany,
  schema,
  withCompany,
} from '@qsmart/db';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { PlatformGuard } from './auth/platform.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, Person } from './decorators.js';
import { DB } from './tokens.js';

/** Is the server up? (No sign-in needed.) */
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

/** Who am I, which companies can I open, and am I the owner of Q-smart? */
@Controller('me')
@UseGuards(SignedInGuard)
export class MeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async me(@Person() person: VerifiedPerson) {
    let memberships = await membershipsFor(this.db, person.uid);
    let platformAdmin = await isPlatformAdmin(this.db, person.uid);
    // a first sign-in: accept the invitation waiting for this e-mail, but only if Firebase has verified it
    if (memberships.length === 0 && !platformAdmin && person.email && person.emailVerified) {
      if (await claimInvitation(this.db, person.uid, person.email)) {
        memberships = await membershipsFor(this.db, person.uid);
        platformAdmin = await isPlatformAdmin(this.db, person.uid);
      }
    }
    return {
      email: person.email,
      name: memberships[0]?.userName ?? null,
      platformAdmin,
      companies: memberships.map((m) => ({ id: m.companyId, name: m.companyName, role: m.role })),
    };
  }
}

/** The teams of the company of the request, read behind the company wall. */
@Controller('teams')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class TeamsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('people.read')
  list(@CurrentMembership() membership: Membership) {
    const { teams } = schema;
    return withCompany(this.db, membership.companyId, (tx) =>
      tx
        .select({ id: teams.id, name: teams.name, isAdministration: teams.isAdministration })
        .from(teams)
        .orderBy(teams.name),
    );
  }
}

const newCompany = z.object({
  name: z.string().trim().min(2).max(120),
  adminEmail: z.email().max(200),
  adminName: z.string().trim().min(2).max(120),
});

/** The platform owner area: all client companies, and a new one with its first admin invited. */
@Controller('platform/companies')
@UseGuards(SignedInGuard, PlatformGuard)
export class PlatformController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  list(@Person() person: VerifiedPerson) {
    return platformCompanies(this.db, person.uid);
  }

  @Post()
  async create(@Person() person: VerifiedPerson, @Body() body: unknown) {
    const parsed = newCompany.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Give the company a name, and its first admin a name and e-mail.');
    return { id: await platformCreateCompany(this.db, person.uid, parsed.data) };
  }
}
