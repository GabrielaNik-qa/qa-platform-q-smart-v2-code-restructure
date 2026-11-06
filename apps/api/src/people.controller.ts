// The people of a company (Admin › Users): everyone reads, only admins invite and change. Today's rules apply:
// staff (admin, reviewer, team lead, trainer) always sit in the Administration team, every agent needs a team,
// and a company always keeps at least one active admin.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  administrationTeam,
  type Db,
  getPerson,
  invitePerson,
  isAgentTeam,
  listPeople,
  type Membership,
  otherActiveAdmins,
  removeMembership,
  type Tx,
  updateMembership,
  withCompany,
} from '@qsmart/db';
import { isStaff, type Role, roleSchema } from '@qsmart/shared';
import { z } from 'zod';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { VerifiedPerson } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership, Person } from './decorators.js';
import { DB } from './tokens.js';

const invitation = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  role: roleSchema,
  teamId: z.uuid().optional(),
});
const change = z
  .object({ role: roleSchema.optional(), teamId: z.uuid().optional(), active: z.boolean().optional() })
  .refine((c) => Object.keys(c).length > 0);
const idParam = z.uuid();

/** The team a person with this role sits in: Administration for staff, the chosen agent team for agents. */
async function teamFor(tx: Tx, role: Role, teamId: string | undefined | null): Promise<string> {
  if (isStaff(role)) {
    const admin = await administrationTeam(tx);
    if (!admin) throw new BadRequestException('The company has no Administration team.');
    return admin;
  }
  if (!teamId || !(await isAgentTeam(tx, teamId)))
    throw new BadRequestException('Choose a team. Every agent must belong to a team.');
  return teamId;
}

const pgCode = (error: unknown) =>
  (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;

@Controller('people')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class PeopleController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @Allow('people.read')
  list(@CurrentMembership() membership: Membership) {
    return withCompany(this.db, membership.companyId, (tx) => listPeople(tx));
  }

  @Post()
  @Allow('people.manage')
  async invite(@CurrentMembership() membership: Membership, @Person() person: VerifiedPerson, @Body() body: unknown) {
    const input = invitation.safeParse(body);
    if (!input.success) throw new BadRequestException('Enter the name, a valid e-mail and the role.');
    try {
      const id = await withCompany(this.db, membership.companyId, async (tx) =>
        invitePerson(tx, person.uid, { ...input.data, teamId: await teamFor(tx, input.data.role, input.data.teamId) }),
      );
      return { id };
    } catch (error) {
      if (pgCode(error) === '23505') throw new ConflictException('This person is already in the company.');
      if (pgCode(error) === '42501') throw new ForbiddenException('Only an admin of this company can invite people.');
      throw error;
    }
  }

  @Patch(':id')
  @Allow('people.manage')
  async change(@CurrentMembership() membership: Membership, @Param('id') id: string, @Body() body: unknown) {
    const target = idParam.safeParse(id);
    const input = change.safeParse(body);
    if (!target.success || !input.success) throw new BadRequestException('Nothing to change.');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const current = await getPerson(tx, target.data);
      if (!current) throw new NotFoundException('This person is not in the company.');
      const role = input.data.role ?? current.role;
      const active = input.data.active ?? current.active;
      if (current.userId === membership.userId && (!active || role !== current.role)) {
        throw new BadRequestException('You cannot switch off your own account or change your own role.');
      }
      if (current.role === 'admin' && current.active && (role !== 'admin' || !active)) {
        if ((await otherActiveAdmins(tx, current.membershipId)) === 0)
          throw new BadRequestException('The company must keep at least one active admin.');
      }
      const teamId = await teamFor(tx, role, input.data.teamId ?? current.teamId);
      await updateMembership(tx, current.membershipId, { role, teamId, active });
      return getPerson(tx, current.membershipId);
    });
  }

  @Delete(':id')
  @Allow('people.manage')
  @HttpCode(204)
  async remove(@CurrentMembership() membership: Membership, @Param('id') id: string) {
    const target = idParam.safeParse(id);
    if (!target.success) throw new BadRequestException('Nothing to remove.');
    await withCompany(this.db, membership.companyId, async (tx) => {
      const current = await getPerson(tx, target.data);
      if (!current) throw new NotFoundException('This person is not in the company.');
      if (current.userId === membership.userId) throw new BadRequestException('You cannot remove yourself.');
      if (current.role === 'admin' && current.active && (await otherActiveAdmins(tx, current.membershipId)) === 0)
        throw new BadRequestException('The company must keep at least one active admin.');
      await removeMembership(tx, current.membershipId);
    });
  }
}
