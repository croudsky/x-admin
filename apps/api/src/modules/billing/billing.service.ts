import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  UpdateWorkspaceBillingInput,
  WorkspaceBillingSettings,
  WorkspaceBillingSummary,
  WorkspacePlanTier,
  WorkspaceUsageSnapshot,
} from "@oku/shared/index";
import { WorkspacePlanTier as PrismaWorkspacePlanTier } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

type UsageMetric = "content_jobs" | "ai_generations" | "mention_sync_runs";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(workspaceId: string): Promise<WorkspaceBillingSummary> {
    const settings = await this.ensureSettings(workspaceId);
    const usage = await this.ensureUsageSnapshot(workspaceId, settings.currentPeriodStart, settings.currentPeriodEnd);
    const [xAccountsConnected, postsPublished] = await Promise.all([
      this.prisma.xAccount.count({
        where: {
          workspaceId,
          status: "CONNECTED",
        },
      }),
      this.prisma.contentJob.count({
        where: {
          workspaceId,
          status: "PUBLISHED",
          publishedAt: {
            gte: settings.currentPeriodStart,
            lte: settings.currentPeriodEnd,
          },
        },
      }),
    ]);

    return {
      settings: this.mapSettings(settings),
      usage: {
        ...this.mapUsage(workspaceId, usage),
        xAccountsConnected,
        postsPublished,
      },
      remaining: {
        xAccounts: Math.max(0, settings.maxXAccounts - xAccountsConnected),
        contentJobs: Math.max(0, settings.maxMonthlyContentJobs - usage.contentJobsCreated),
        aiGenerations: Math.max(0, settings.maxMonthlyAiGenerations - usage.aiGenerations),
        mentionSyncRuns: Math.max(0, settings.maxMonthlyMentionSyncs - usage.mentionSyncRuns),
      },
    };
  }

  async updateSettings(workspaceId: string, input: UpdateWorkspaceBillingInput): Promise<WorkspaceBillingSettings> {
    const existing = await this.ensureSettings(workspaceId);
    const saved = await this.prisma.workspaceBilling.update({
      where: { workspaceId },
      data: {
        planTier: this.parsePlanTier(input.planTier),
        isBillingActive: input.isBillingActive,
        monthlyPriceJpy: Math.max(0, input.monthlyPriceJpy),
        maxXAccounts: Math.max(1, input.maxXAccounts),
        maxMonthlyContentJobs: Math.max(1, input.maxMonthlyContentJobs),
        maxMonthlyAiGenerations: Math.max(1, input.maxMonthlyAiGenerations),
        maxMonthlyMentionSyncs: Math.max(1, input.maxMonthlyMentionSyncs),
        currentPeriodStart: existing.currentPeriodStart,
        currentPeriodEnd: existing.currentPeriodEnd,
      },
    });

    return this.mapSettings(saved);
  }

  async assertWithinLimit(workspaceId: string, metric: UsageMetric) {
    const summary = await this.getSummary(workspaceId);
    const map = {
      content_jobs: {
        remaining: summary.remaining.contentJobs,
        message: "今月の投稿ジョブ上限に達しています",
      },
      ai_generations: {
        remaining: summary.remaining.aiGenerations,
        message: "今月のAI生成上限に達しています",
      },
      mention_sync_runs: {
        remaining: summary.remaining.mentionSyncRuns,
        message: "今月のmention同期上限に達しています",
      },
    } satisfies Record<UsageMetric, { remaining: number; message: string }>;

    if (map[metric].remaining <= 0) {
      throw new BadRequestException(map[metric].message);
    }
  }

  async recordContentJobCreated(workspaceId: string) {
    await this.bumpUsage(workspaceId, { contentJobsCreated: 1 });
  }

  async recordAIGeneration(workspaceId: string) {
    await this.bumpUsage(workspaceId, { aiGenerations: 1 });
  }

  async recordMentionSync(workspaceId: string, importedMentions: number) {
    await this.bumpUsage(workspaceId, {
      mentionSyncRuns: 1,
      importedMentions: Math.max(0, importedMentions),
    });
  }

  private async bumpUsage(
    workspaceId: string,
    increments: Partial<{
      contentJobsCreated: number;
      aiGenerations: number;
      mentionSyncRuns: number;
      importedMentions: number;
    }>,
  ) {
    const settings = await this.ensureSettings(workspaceId);
    const usage = await this.ensureUsageSnapshot(workspaceId, settings.currentPeriodStart, settings.currentPeriodEnd);

    await this.prisma.workspaceUsageSnapshot.update({
      where: { id: usage.id },
      data: {
        contentJobsCreated: { increment: increments.contentJobsCreated ?? 0 },
        aiGenerations: { increment: increments.aiGenerations ?? 0 },
        mentionSyncRuns: { increment: increments.mentionSyncRuns ?? 0 },
        importedMentions: { increment: increments.importedMentions ?? 0 },
      },
    });
  }

  private async ensureSettings(workspaceId: string) {
    const [periodStart, periodEnd] = this.currentBillingPeriod();
    return (
      (await this.prisma.workspaceBilling.findUnique({
        where: { workspaceId },
      })) ??
      this.prisma.workspaceBilling.create({
        data: {
          workspaceId,
          planTier: PrismaWorkspacePlanTier.FREE,
          isBillingActive: true,
          monthlyPriceJpy: 0,
          maxXAccounts: 1,
          maxMonthlyContentJobs: 100,
          maxMonthlyAiGenerations: 120,
          maxMonthlyMentionSyncs: 200,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      })
    );
  }

  private async ensureUsageSnapshot(workspaceId: string, periodStart: Date, periodEnd: Date) {
    return (
      (await this.prisma.workspaceUsageSnapshot.findUnique({
        where: {
          workspaceId_periodStart_periodEnd: {
            workspaceId,
            periodStart,
            periodEnd,
          },
        },
      })) ??
      this.prisma.workspaceUsageSnapshot.create({
        data: {
          workspaceId,
          periodStart,
          periodEnd,
        },
      })
    );
  }

  private currentBillingPeriod() {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return [periodStart, periodEnd] as const;
  }

  private mapSettings(settings: {
    workspaceId: string;
    planTier: PrismaWorkspacePlanTier;
    isBillingActive: boolean;
    monthlyPriceJpy: number;
    maxXAccounts: number;
    maxMonthlyContentJobs: number;
    maxMonthlyAiGenerations: number;
    maxMonthlyMentionSyncs: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }): WorkspaceBillingSettings {
    return {
      workspaceId: settings.workspaceId,
      planTier: settings.planTier.toLowerCase() as WorkspacePlanTier,
      isBillingActive: settings.isBillingActive,
      monthlyPriceJpy: settings.monthlyPriceJpy,
      maxXAccounts: settings.maxXAccounts,
      maxMonthlyContentJobs: settings.maxMonthlyContentJobs,
      maxMonthlyAiGenerations: settings.maxMonthlyAiGenerations,
      maxMonthlyMentionSyncs: settings.maxMonthlyMentionSyncs,
      currentPeriodStart: settings.currentPeriodStart.toISOString(),
      currentPeriodEnd: settings.currentPeriodEnd.toISOString(),
    };
  }

  private mapUsage(
    workspaceId: string,
    usage: {
      periodStart: Date;
      periodEnd: Date;
      contentJobsCreated: number;
      aiGenerations: number;
      mentionSyncRuns: number;
      importedMentions: number;
    },
  ): WorkspaceUsageSnapshot {
    return {
      workspaceId,
      periodStart: usage.periodStart.toISOString(),
      periodEnd: usage.periodEnd.toISOString(),
      contentJobsCreated: usage.contentJobsCreated,
      aiGenerations: usage.aiGenerations,
      mentionSyncRuns: usage.mentionSyncRuns,
      importedMentions: usage.importedMentions,
    };
  }

  private parsePlanTier(value: WorkspacePlanTier) {
    switch (value) {
      case "free":
        return PrismaWorkspacePlanTier.FREE;
      case "pro":
        return PrismaWorkspacePlanTier.PRO;
      case "agency":
        return PrismaWorkspacePlanTier.AGENCY;
    }
  }
}
