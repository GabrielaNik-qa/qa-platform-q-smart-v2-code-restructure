import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Db } from '@qsmart/db';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { TokenVerifier } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { PermissionGuard } from './auth/permission.guard.js';
import { PlatformGuard } from './auth/platform.guard.js';
import { HealthController, MeController, MySkillsController, PlatformController } from './controllers.js';
import { PeopleController } from './people.controller.js';
import { SkillsController, TeamsController, WorkspacesController } from './setup.controller.js';
import { DB, TOKEN_VERIFIER } from './tokens.js';

/** The parts the server is built from: the real ones in main.ts, test ones in the tests. */
export interface AppParts {
  db: Db;
  verifier: TokenVerifier;
}

@Module({})
export class AppModule {
  static with(parts: AppParts): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        MeController,
        MySkillsController,
        PlatformController,
        PeopleController,
        TeamsController,
        WorkspacesController,
        SkillsController,
      ],
      providers: [
        { provide: DB, useValue: parts.db },
        { provide: TOKEN_VERIFIER, useValue: parts.verifier },
        SignedInGuard,
        CompanyMemberGuard,
        PermissionGuard,
        PlatformGuard,
      ],
    };
  }
}

/** Builds the server, with every route under /api. */
export async function createApp(parts: AppParts): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.with(parts), new FastifyAdapter(), {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
