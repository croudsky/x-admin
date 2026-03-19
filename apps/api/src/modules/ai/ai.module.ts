import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AIController } from "./ai.controller";
import { AIService } from "./ai.service";

@Module({
  imports: [BillingModule],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
