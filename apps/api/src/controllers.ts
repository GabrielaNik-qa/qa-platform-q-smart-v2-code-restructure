import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { type Db, type Membership, membershipsFor, schema, withCompany } from '@qsmart/db';
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

/** Who am I, and which companies can I open? */
@Controller('me')
@UseGuards(SignedInGuard)
export class MeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async me(@Person() person: VerifiedPerson) {
    const memberships = await membershipsFor(this.db, person.uid);
    return {
      email: person.email,
      name: memberships[0]?.userName ?? null,
      companies: memberships.map((m) => ({ id: m.companyId, name: m.companyName, role: m.role })),
    };
  }
}

/** The teams of the company of the request, read behind the company wall. */
@Controller('teams')
@UseGuards(SignedInGuard, CompanyMemberGuard)
export class TeamsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
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
