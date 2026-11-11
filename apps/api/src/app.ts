import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Db } from '@qsmart/db';
import {
  ActivityController,
  MyPrefsController,
  NotificationsController,
  PageRulesController,
} from './activity.controller.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import type { TokenVerifier } from './auth/token-verifier.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { PermissionGuard } from './auth/permission.guard.js';
import { PlatformGuard } from './auth/platform.guard.js';
import { HealthController, MeController, MySkillsController, PlatformController } from './controllers.js';
import { PeopleController } from './people.controller.js';
import {
  LibraryController,
  PassRatesController,
  RootCausesController,
  ScorecardsController,
} from './quality.controller.js';
import { CalibrationsController } from './calibrations.controller.js';
import { DashboardsController } from './dashboards.controller.js';
import { DisputesController } from './disputes.controller.js';
import { FlagsController } from './flags.controller.js';
import { GoalsController, ImprovementPlansController, KudosController } from './performance.controller.js';
import { PinsController } from './pins.controller.js';
import { PlannerController } from './planner.controller.js';
import { ExportsController, JobsController, ReportsController } from './reports.controller.js';
import { TeamAverageController } from './team-average.controller.js';
import { ReviewerChecksController } from './reviewer-checks.controller.js';
import { ReviewsController } from './reviews.controller.js';
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
        ActivityController,
        NotificationsController,
        PageRulesController,
        MyPrefsController,
        ScorecardsController,
        LibraryController,
        RootCausesController,
        PassRatesController,
        ReviewsController,
        DisputesController,
        FlagsController,
        CalibrationsController,
        ReviewerChecksController,
        PinsController,
        DashboardsController,
        TeamAverageController,
        GoalsController,
        ImprovementPlansController,
        KudosController,
        PlannerController,
        ReportsController,
        ExportsController,
        JobsController,
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
