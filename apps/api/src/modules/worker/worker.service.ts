import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AnalyticsService } from "../analytics/analytics.service";
import { AutomationService } from "../automation/automation.service";

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private mentionSyncRunning = false;
  private dispatchRunning = false;
  private analyticsRunning = false;

  constructor(
    private readonly automationService: AutomationService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Cron("*/30 * * * * *")
  async syncMentionsTick() {
    if (this.mentionSyncRunning) {
      return;
    }

    this.mentionSyncRunning = true;
    try {
      const result = await this.automationService.syncMentions();
      if (result.imported > 0) {
        this.logger.log(`Imported ${result.imported} mentions`);
      }
    } catch (error) {
      this.logger.error("Mention sync failed", error instanceof Error ? error.stack : String(error));
    } finally {
      this.mentionSyncRunning = false;
    }
  }

  @Cron("*/15 * * * * *")
  async dispatchContentJobsTick() {
    if (this.dispatchRunning) {
      return;
    }

    this.dispatchRunning = true;
    try {
      const sentJobs = await this.automationService.dispatchDueContentJobs();
      if (sentJobs.length > 0) {
        this.logger.log(`Dispatched ${sentJobs.length} jobs: ${sentJobs.join(", ")}`);
      }
    } catch (error) {
      this.logger.error("Dispatch tick failed", error instanceof Error ? error.stack : String(error));
    } finally {
      this.dispatchRunning = false;
    }
  }

  @Cron("0 */30 * * * *")
  async collectAnalyticsTick() {
    if (this.analyticsRunning) {
      return;
    }

    this.analyticsRunning = true;
    try {
      const result = await this.analyticsService.collectSnapshots();
      if (result.collected > 0) {
        this.logger.log(`Collected analytics for ${result.collected} account(s)`);
      }
    } catch (error) {
      this.logger.error("Analytics collection failed", error instanceof Error ? error.stack : String(error));
    } finally {
      this.analyticsRunning = false;
    }
  }
}
