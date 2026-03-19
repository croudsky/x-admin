import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AutomationModule } from "../automation/automation.module";
import { WorkerService } from "./worker.service";

@Module({
  imports: [ScheduleModule.forRoot(), AutomationModule, AnalyticsModule],
  providers: [WorkerService],
})
export class WorkerModule {}
