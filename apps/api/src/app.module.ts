import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AIModule } from "./modules/ai/ai.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./modules/database/database.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AutomationModule } from "./modules/automation/automation.module";
import { AuditModule } from "./modules/audit/audit.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SecurityModule } from "./modules/security/security.module";
import { WorkerModule } from "./modules/worker/worker.module";
import { SessionAuthGuard } from "./modules/auth/session-auth.guard";
import { BillingModule } from "./modules/billing/billing.module";

const workerImports = process.env.RUN_WORKER === "true" ? [WorkerModule] : [];

@Module({
  imports: [
    DatabaseModule,
    SecurityModule,
    AuthModule,
    AIModule,
    AutomationModule,
    AnalyticsModule,
    NotificationsModule,
    AuditModule,
    BillingModule,
    ...workerImports,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
  ],
})
export class AppModule {}
