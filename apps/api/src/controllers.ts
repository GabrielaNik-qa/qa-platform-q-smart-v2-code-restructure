import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  claimInvitation,
  type Db,
  isPlatformAdmin,
  type Membership,
  membershipOfUser,
  membershipsFor,
  myProfile,
  platformCompanies,
  platformCreateCompany,
  setPersonSkills,
  updateMyProfile,
  withCompany,
} from '@qsmart/db';
import { LANGUAGES } from '@qsmart/shared';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { PlatformGuard } from './auth/platform.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, Person } from './decorators.js';
import { knownSkills } from './setup.controller.js';
import { DB } from './tokens.js';
import { badRequest } from './errors.js';

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
    const profile = await myProfile(this.db, person.uid);
    return {
      email: person.email,
      name: profile?.name ?? memberships[0]?.userName ?? person.name ?? null,
      /** the language saved with the account (null until chosen) */
      language: profile?.language ?? null,
      platformAdmin,
      companies: memberships.map((m) => ({ id: m.companyId, name: m.companyName, role: m.role })),
    };
  }

  /** My account: my own name and the language of the app (saved with the account, for every browser). */
  @Patch()
  @HttpCode(204)
  async change(@Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = myChange.safeParse(body);
    if (!input.success) throw badRequest('profileInvalid');
    await updateMyProfile(this.db, person.uid, input.data);
  }
}

const myChange = z
  .object({ name: z.string().trim().min(2).max(120).optional(), language: z.enum(LANGUAGES).optional() })
  .refine((c) => c.name !== undefined || c.language !== undefined);

/** My account › Profile: my own skills and languages in the company of the request (today: everyone picks theirs). */
@Controller('me/skills')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class MySkillsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Put()
  @Allow('account.edit')
  async set(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z.object({ skillIds: z.array(z.uuid()).max(200) }).safeParse(body);
    if (!input.success) throw badRequest('nothingToChange');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      if (!me) throw badRequest('personNotFound');
      const skillIds = await knownSkills(tx, input.data.skillIds);
      await setPersonSkills(tx, me.id, skillIds);
      return { skillIds };
    });
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
    if (!parsed.success) throw badRequest('companyInvalid');
    return { id: await platformCreateCompany(this.db, person.uid, parsed.data) };
  }
}
