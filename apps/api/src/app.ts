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
import { ConversationsController, FieldsController, TranscriptDaysController } from './conversations.controller.js';
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
import { AI_ENGINE, DB, MASTER_KEY, TOKEN_VERIFIER } from './tokens.js';
import { AiController } from './ai.controller.js';
import { AutoqaController } from './autoqa.controller.js';
import { MAX_RECORDING_BYTES, RECORDING_TYPES, SpeechController } from './speech.controller.js';
import { TasksController } from './tasks.controller.js';
import { AutoqaPageController } from './autoqa-page.controller.js';
import { autoqaQualities, TestSetController } from './test-set.controller.js';
import { storedAccounts } from './ai/accounts.js';
import { realAdapters } from './ai/adapters.js';
import { AiEngine, type AiEngineParts } from './ai/engine.js';

/** The parts the server is built from: the real ones in main.ts, test ones in the tests. */
export interface AppParts {
  db: Db;
  verifier: TokenVerifier;
  /** the master key that encrypts the companies' AI keys (QSMART_MASTER_KEY); without it, no key can be stored */
  masterKey?: Buffer | null;
  /** the AI engine's parts (the tests give a pretend AI company): by default Groq, Cloudflare and the stored keys */
  ai?: Partial<Omit<AiEngineParts, 'db'>>;
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
        AiController,
        FieldsController,
        ConversationsController,
        TranscriptDaysController,
        AutoqaController,
        SpeechController,
        TasksController,
        AutoqaPageController,
        TestSetController,
      ],
      providers: [
        { provide: DB, useValue: parts.db },
        { provide: TOKEN_VERIFIER, useValue: parts.verifier },
        { provide: MASTER_KEY, useValue: parts.masterKey ?? null },
        {
          provide: AI_ENGINE,
          useValue: new AiEngine({
            adapters: realAdapters(),
            accounts: storedAccounts(parts.masterKey ?? null),
            qualities: autoqaQualities,
            ...parts.ai,
            db: parts.db,
          }),
        },
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
  // a call recording (speech-to-text) arrives as raw bytes, up to 25 MB; it is kept in memory only, never on disk
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(RECORDING_TYPES, { parseAs: 'buffer', bodyLimit: MAX_RECORDING_BYTES }, (_req, body, done) =>
      done(null, body),
    );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
