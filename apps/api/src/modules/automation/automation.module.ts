import { Module } from "@nestjs/common";
import { AIModule } from "../ai/ai.module";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AutomationController } from "./automation.controller";
import { AutomationService } from "./automation.service";
import { XApiService } from "./x-api.service";

@Module({
  imports: [AIModule, AuthModule, NotificationsModule, AuditModule, BillingModule],
  controllers: [AutomationController],
  providers: [AutomationService, XApiService],
  exports: [XApiService],
})
export class AutomationModule {}
