import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ApprovalDecisionInput,
  ApprovalRecord,
  AutomationOverview,
  BatchApprovalDecisionInput,
  ContentJob,
  CreateContentJobInput,
  FixedReplyRuleSummary,
  GenerateReplyDraftInput,
  MentionRecord,
  OperationsOverview,
  SendContentJobResult,
  SyncMentionsResult,
  UpdateAutomationPolicyInput,
  UpdateContentJobInput,
  UpsertFixedReplyRuleInput,
} from "@oku/shared/index";
import {
  ApprovalStatus,
  ApprovalMode,
  ContentKind,
  ContentStatus,
  MentionStatus,
  XAccountStatus,
} from "@prisma/client";
import { AIService } from "../ai/ai.service";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ContentSafetyError, ContentSafetyService } from "../security/content-safety.service";
import { XApiRateLimitError, XApiService } from "./x-api.service";

@Injectable()
export class AutomationService {
  private readonly maxRetryCount = 3;
  private readonly billing: Pick<
    BillingService,
    "assertWithinLimit" | "recordContentJobCreated" | "recordMentionSync"
  >;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly xApiService: XApiService,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly contentSafetyService: ContentSafetyService,
    billingService?: BillingService,
  ) {
    this.billing = billingService ?? {
      assertWithinLimit: async () => undefined,
      recordContentJobCreated: async () => undefined,
      recordMentionSync: async () => undefined,
    };
  }

  async getOverview(xAccountId?: string, workspaceId?: string): Promise<AutomationOverview> {
    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      include: {
        xAccounts: {
          orderBy: { createdAt: "asc" },
        },
        automationPolicies: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        contentJobs: {
          orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
          take: 20,
        },
      },
    });

    if (!workspace) {
      return {
        account: null,
        policy: null,
        queue: [],
      };
    }

    const account = this.selectAccount(workspace.xAccounts, xAccountId);
    const policy = workspace.automationPolicies[0];

    return {
      account: account
        ? {
            id: account.id,
            workspaceId: account.workspaceId,
            handle: account.handle,
            displayName: account.displayName,
            status: this.mapAccountStatus(account.status),
          }
        : null,
      policy: policy
        ? {
            workspaceId: policy.workspaceId,
            approvalMode: this.mapApprovalMode(policy.approvalMode),
            autoReplyEnabled: policy.autoReplyEnabled,
            autoPostEnabled: policy.autoPostEnabled,
            autoReplyPaused: policy.autoReplyPaused,
            autoReplyPauseReason: policy.autoReplyPauseReason,
            autoReplyCooldownUntil: policy.autoReplyCooldownUntil ? policy.autoReplyCooldownUntil.toISOString() : null,
            maxAutoRepliesPerHour: policy.maxAutoRepliesPerHour,
            maxAutoRepliesPerDay: policy.maxAutoRepliesPerDay,
            maxConsecutiveAutoReplies: policy.maxConsecutiveAutoReplies,
            spikeLimit10Minutes: policy.spikeLimit10Minutes,
          }
        : null,
      queue: workspace.contentJobs
        .filter((job) => !account || job.xAccountId === account.id)
        .map((job) => this.mapContentJob(job)),
    };
  }

  async listContentJobs(xAccountId?: string, workspaceId?: string): Promise<ContentJob[]> {
    const jobs = await this.prisma.contentJob.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(xAccountId ? { xAccountId } : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 40,
    });

    return jobs.map((job) => this.mapContentJob(job));
  }

  async getOperationsOverview(xAccountId?: string, workspaceId?: string): Promise<OperationsOverview> {
    const stuckThreshold = new Date(Date.now() - 15 * 60 * 1000);
    const [stuckProcessingJobs, recentFailedJobs, queueDepth, awaitingApprovalCount, syncState] = await Promise.all([
      this.prisma.contentJob.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(xAccountId ? { xAccountId } : {}),
          status: ContentStatus.PROCESSING,
          processingStartedAt: { lt: stuckThreshold },
        },
        orderBy: { processingStartedAt: "asc" },
        take: 10,
      }),
      this.prisma.contentJob.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(xAccountId ? { xAccountId } : {}),
          status: ContentStatus.FAILED,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      this.prisma.contentJob.count({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(xAccountId ? { xAccountId } : {}),
          status: { in: [ContentStatus.QUEUED, ContentStatus.SCHEDULED, ContentStatus.PROCESSING] },
        },
      }),
      this.prisma.contentJob.count({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(xAccountId ? { xAccountId } : {}),
          status: ContentStatus.AWAITING_APPROVAL,
        },
      }),
      xAccountId
        ? this.prisma.xSyncState.findFirst({ where: { xAccountId, ...(workspaceId ? { workspaceId } : {}) } })
        : this.prisma.xSyncState.findFirst({ where: workspaceId ? { workspaceId } : undefined, orderBy: { updatedAt: "desc" } }),
    ]);

    return {
      stuckProcessingJobs: stuckProcessingJobs.map((job) => this.mapContentJob(job)),
      recentFailedJobs: recentFailedJobs.map((job) => this.mapContentJob(job)),
      queueDepth,
      awaitingApprovalCount,
      syncState: syncState
        ? {
            xAccountId: syncState.xAccountId,
            lastMentionId: syncState.lastMentionId ?? null,
            nextPaginationToken: syncState.nextPaginationToken ?? null,
            rateLimitedUntil: syncState.rateLimitedUntil ? syncState.rateLimitedUntil.toISOString() : null,
            lastSyncedAt: syncState.lastSyncedAt ? syncState.lastSyncedAt.toISOString() : null,
          }
        : null,
    };
  }

  async listApprovals(workspaceId?: string): Promise<ApprovalRecord[]> {
    const approvals = await this.prisma.contentApproval.findMany({
      where: workspaceId ? { contentJob: { workspaceId } } : undefined,
      include: {
        reviewer: true,
        contentJob: true,
      },
      orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
    });

    return approvals.map((approval) => ({
      id: approval.id,
      contentJobId: approval.contentJobId,
      reviewerName: approval.reviewer.displayName,
      contentKind: this.mapKind(approval.contentJob.kind),
      contentBody: approval.contentJob.body,
      status: this.mapApprovalStatus(approval.status),
      note: approval.note,
      reviewedAt: approval.reviewedAt ? approval.reviewedAt.toISOString() : null,
      createdAt: approval.createdAt.toISOString(),
    }));
  }

  async listAccounts(workspaceId?: string) {
    const accounts = await this.prisma.xAccount.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: "asc" },
    });

    return accounts.map((account) => ({
      id: account.id,
      workspaceId: account.workspaceId,
      handle: account.handle,
      displayName: account.displayName,
      status: this.mapAccountStatus(account.status),
    }));
  }

  async listMentions(xAccountId?: string, workspaceId?: string): Promise<MentionRecord[]> {
    const mentions = await this.prisma.mention.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(xAccountId ? { xAccountId } : {}),
      },
      orderBy: { mentionedAt: "desc" },
      take: 20,
    });

    return mentions.map((mention) => ({
      id: mention.id,
      xAccountId: mention.xAccountId,
      externalMentionId: mention.externalMentionId,
      authorXUserId: mention.authorXUserId ?? null,
      authorHandle: mention.authorHandle,
      body: mention.body,
      referencedPostId: mention.referencedPostId ?? null,
      status: this.mapMentionStatus(mention.status),
      mentionedAt: mention.mentionedAt.toISOString(),
    }));
  }

  async listFixedReplyRules(xAccountId?: string, workspaceId?: string): Promise<FixedReplyRuleSummary[]> {
    const rules = await this.prisma.fixedReplyRule.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(xAccountId ? { xAccountId } : {}),
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    return rules.map((rule) => ({
      id: rule.id,
      xAccountId: rule.xAccountId,
      fixedPostId: rule.fixedPostId,
      fixedPostText: rule.fixedPostText,
      triggerPhrase: rule.triggerPhrase,
      requireLike: rule.requireLike,
      requireRetweet: rule.requireRetweet,
      requireFollow: rule.requireFollow,
      activeFrom: rule.activeFrom ? rule.activeFrom.toISOString() : null,
      activeTo: rule.activeTo ? rule.activeTo.toISOString() : null,
      maxRepliesPerAuthorPerDay: rule.maxRepliesPerAuthorPerDay,
      excludedUserIds: this.readStringArray(rule.excludedUserIds),
      replyTemplate: rule.replyTemplate,
      priority: rule.priority,
      includeAuthorId: rule.includeAuthorId,
      includeAuthorHandle: rule.includeAuthorHandle,
      isActive: rule.isActive,
    }));
  }

  async saveFixedReplyRule(input: UpsertFixedReplyRuleInput, workspaceId?: string): Promise<FixedReplyRuleSummary> {
    const workspace = await this.requireWorkspace(workspaceId);
    const xAccount = await this.prisma.xAccount.findFirst({
      where: { id: input.xAccountId, workspaceId: workspace.id },
    });

    if (!xAccount) {
      throw new BadRequestException("X account not found");
    }

    const fixedPostId = input.fixedPostId.trim();
    const fixedPostText = input.fixedPostText.trim();
    const replyTemplate = input.replyTemplate.trim();
    const triggerPhrase = input.triggerPhrase?.trim() || null;
    const activeFrom = input.activeFrom ? new Date(input.activeFrom) : null;
    const activeTo = input.activeTo ? new Date(input.activeTo) : null;
    const excludedUserIds = (input.excludedUserIds ?? []).map((item) => item.trim()).filter(Boolean);

    if (!fixedPostId || !fixedPostText || !replyTemplate) {
      throw new BadRequestException("fixedPostId, fixedPostText and replyTemplate are required");
    }
    if (activeFrom && Number.isNaN(activeFrom.getTime())) {
      throw new BadRequestException("activeFrom must be a valid ISO date");
    }
    if (activeTo && Number.isNaN(activeTo.getTime())) {
      throw new BadRequestException("activeTo must be a valid ISO date");
    }
    if (activeFrom && activeTo && activeFrom > activeTo) {
      throw new BadRequestException("activeFrom must be before activeTo");
    }

    const existing = await this.prisma.fixedReplyRule.findFirst({
      where: {
        xAccountId: xAccount.id,
        fixedPostId,
      },
      orderBy: { createdAt: "asc" },
    });

    const saved = existing
      ? await this.prisma.fixedReplyRule.update({
          where: { id: existing.id },
          data: {
            fixedPostText,
            triggerPhrase,
            requireLike: input.requireLike,
            requireRetweet: input.requireRetweet,
            requireFollow: input.requireFollow ?? false,
            activeFrom,
            activeTo,
            maxRepliesPerAuthorPerDay: Math.max(1, input.maxRepliesPerAuthorPerDay ?? 1),
            excludedUserIds,
            replyTemplate,
            priority: input.priority ?? 0,
            includeAuthorId: input.includeAuthorId,
            includeAuthorHandle: input.includeAuthorHandle,
            isActive: input.isActive,
          },
        })
      : await this.prisma.fixedReplyRule.create({
          data: {
            workspaceId: workspace.id,
            xAccountId: xAccount.id,
            fixedPostId,
            fixedPostText,
            triggerPhrase,
            requireLike: input.requireLike,
            requireRetweet: input.requireRetweet,
            requireFollow: input.requireFollow ?? false,
            activeFrom,
            activeTo,
            maxRepliesPerAuthorPerDay: Math.max(1, input.maxRepliesPerAuthorPerDay ?? 1),
            excludedUserIds,
            replyTemplate,
            priority: input.priority ?? 0,
            includeAuthorId: input.includeAuthorId,
            includeAuthorHandle: input.includeAuthorHandle,
            isActive: input.isActive,
          },
        });

    return this.mapFixedReplyRule(saved);
  }

  async duplicateFixedReplyRule(id: string, workspaceId?: string): Promise<FixedReplyRuleSummary> {
    const existing = workspaceId
      ? await this.prisma.fixedReplyRule.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.fixedReplyRule.findUnique({
          where: { id },
        });
    if (!existing) {
      throw new NotFoundException("fixed reply rule not found");
    }

    const duplicated = await this.prisma.fixedReplyRule.create({
      data: {
        workspaceId: existing.workspaceId,
        xAccountId: existing.xAccountId,
        fixedPostId: `${existing.fixedPostId}-copy`,
        fixedPostText: existing.fixedPostText,
        triggerPhrase: existing.triggerPhrase,
        requireLike: existing.requireLike,
        requireRetweet: existing.requireRetweet,
        requireFollow: existing.requireFollow,
        activeFrom: existing.activeFrom,
        activeTo: existing.activeTo,
        maxRepliesPerAuthorPerDay: existing.maxRepliesPerAuthorPerDay,
        excludedUserIds: this.readStringArray(existing.excludedUserIds),
        replyTemplate: existing.replyTemplate,
        priority: existing.priority,
        includeAuthorId: existing.includeAuthorId,
        includeAuthorHandle: existing.includeAuthorHandle,
        isActive: false,
      },
    });

    return this.mapFixedReplyRule(duplicated);
  }

  async deleteFixedReplyRule(id: string, workspaceId?: string) {
    const existing = workspaceId
      ? await this.prisma.fixedReplyRule.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.fixedReplyRule.findUnique({
          where: { id },
        });
    if (!existing) {
      throw new NotFoundException("fixed reply rule not found");
    }
    await this.prisma.fixedReplyRule.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  async toggleFixedReplyRule(id: string, workspaceId?: string): Promise<FixedReplyRuleSummary> {
    const existing = workspaceId
      ? await this.prisma.fixedReplyRule.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.fixedReplyRule.findUnique({
          where: { id },
        });
    if (!existing) {
      throw new NotFoundException("fixed reply rule not found");
    }

    const updated = await this.prisma.fixedReplyRule.update({
      where: { id },
      data: {
        isActive: !existing.isActive,
      },
    });

    return this.mapFixedReplyRule(updated);
  }

  async reorderFixedReplyRule(id: string, direction: "up" | "down", workspaceId?: string): Promise<FixedReplyRuleSummary[]> {
    const current = workspaceId
      ? await this.prisma.fixedReplyRule.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.fixedReplyRule.findUnique({
          where: { id },
        });
    if (!current) {
      throw new NotFoundException("fixed reply rule not found");
    }

    const neighbor = await this.prisma.fixedReplyRule.findFirst({
      where: {
        xAccountId: current.xAccountId,
        priority: direction === "up" ? { gt: current.priority } : { lt: current.priority },
      },
      orderBy: {
        priority: direction === "up" ? "asc" : "desc",
      },
    });

    if (!neighbor) {
      return this.listFixedReplyRules(current.xAccountId, current.workspaceId);
    }

    await this.prisma.$transaction([
      this.prisma.fixedReplyRule.update({
        where: { id: current.id },
        data: { priority: neighbor.priority },
      }),
      this.prisma.fixedReplyRule.update({
        where: { id: neighbor.id },
        data: { priority: current.priority },
      }),
    ]);

    return this.listFixedReplyRules(current.xAccountId, current.workspaceId);
  }

  async updateAutomationPolicy(input: UpdateAutomationPolicyInput, xAccountId?: string, workspaceId?: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      include: {
        automationPolicies: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!workspace) {
      throw new BadRequestException("No seeded workspace found");
    }

    const existing = workspace.automationPolicies[0];
    const cooldownUntil = input.autoReplyCooldownUntil ? new Date(input.autoReplyCooldownUntil) : undefined;
    if (cooldownUntil && Number.isNaN(cooldownUntil.getTime())) {
      throw new BadRequestException("autoReplyCooldownUntil must be a valid ISO date");
    }

    const saved = existing
      ? await this.prisma.automationPolicy.update({
          where: { id: existing.id },
          data: {
            xAccountId: xAccountId ?? existing.xAccountId,
            approvalMode: input.approvalMode ? (input.approvalMode === "auto" ? ApprovalMode.AUTO : ApprovalMode.MANUAL) : undefined,
            autoReplyEnabled: input.autoReplyEnabled,
            autoPostEnabled: input.autoPostEnabled,
            autoReplyPaused: input.autoReplyPaused,
            autoReplyPauseReason: input.autoReplyPauseReason,
            autoReplyCooldownUntil: cooldownUntil,
            maxAutoRepliesPerHour: input.maxAutoRepliesPerHour,
            maxAutoRepliesPerDay: input.maxAutoRepliesPerDay,
            maxConsecutiveAutoReplies: input.maxConsecutiveAutoReplies,
            spikeLimit10Minutes: input.spikeLimit10Minutes,
          },
        })
      : await this.prisma.automationPolicy.create({
          data: {
            workspaceId: workspace.id,
            xAccountId,
            approvalMode: input.approvalMode === "auto" ? ApprovalMode.AUTO : ApprovalMode.MANUAL,
            autoReplyEnabled: input.autoReplyEnabled ?? false,
            autoPostEnabled: input.autoPostEnabled ?? false,
            autoReplyPaused: input.autoReplyPaused ?? false,
            autoReplyPauseReason: input.autoReplyPauseReason ?? null,
            autoReplyCooldownUntil: cooldownUntil ?? null,
            maxAutoRepliesPerHour: input.maxAutoRepliesPerHour ?? 20,
            maxAutoRepliesPerDay: input.maxAutoRepliesPerDay ?? 100,
            maxConsecutiveAutoReplies: input.maxConsecutiveAutoReplies ?? 10,
            spikeLimit10Minutes: input.spikeLimit10Minutes ?? 15,
          },
        });

    await this.auditService.record({
      workspaceId: workspace.id,
      eventType: "automation.policy.updated",
      entityType: "automation_policy",
      entityId: saved.id,
      summary: "自動返信ポリシーを更新しました",
      metadata: {
        xAccountId: xAccountId ?? null,
      },
    });

    return {
      workspaceId: saved.workspaceId,
      approvalMode: this.mapApprovalMode(saved.approvalMode),
      autoReplyEnabled: saved.autoReplyEnabled,
      autoPostEnabled: saved.autoPostEnabled,
      autoReplyPaused: saved.autoReplyPaused,
      autoReplyPauseReason: saved.autoReplyPauseReason,
      autoReplyCooldownUntil: saved.autoReplyCooldownUntil ? saved.autoReplyCooldownUntil.toISOString() : null,
      maxAutoRepliesPerHour: saved.maxAutoRepliesPerHour,
      maxAutoRepliesPerDay: saved.maxAutoRepliesPerDay,
      maxConsecutiveAutoReplies: saved.maxConsecutiveAutoReplies,
      spikeLimit10Minutes: saved.spikeLimit10Minutes,
    };
  }

  async createContentJob(input: CreateContentJobInput, workspaceId?: string): Promise<ContentJob> {
    const body = input.body.trim();
    if (!body) {
      throw new BadRequestException("body is required");
    }

    if (input.kind !== "post" && input.kind !== "reply") {
      throw new BadRequestException("kind must be post or reply");
    }

    const safety = this.contentSafetyService.validate({
      body,
      kind: input.kind,
    });
    if (!safety.safe) {
      throw new BadRequestException(safety.reasons.join(" / "));
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      include: {
        xAccounts: {
          orderBy: { createdAt: "asc" },
        },
        automationPolicies: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!workspace || workspace.xAccounts.length === 0) {
      throw new BadRequestException("No seeded workspace or X account found");
    }
    await this.billing.assertWithinLimit(workspace.id, "content_jobs");

    const account = this.selectAccount(workspace.xAccounts, input.xAccountId);
    if (!account) {
      throw new BadRequestException("No matching X account found");
    }

    const policy = workspace.automationPolicies[0];
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("scheduledAt must be a valid ISO date");
    }

    const status =
      policy?.approvalMode === ApprovalMode.MANUAL
        ? ContentStatus.AWAITING_APPROVAL
        : scheduledAt
          ? ContentStatus.SCHEDULED
          : ContentStatus.QUEUED;

    const created = await this.prisma.contentJob.create({
      data: {
        workspaceId: workspace.id,
        xAccountId: account.id,
        kind: input.kind === "post" ? ContentKind.POST : ContentKind.REPLY,
        body,
        scheduledAt,
        status,
      },
    });

    await this.auditService.record({
      workspaceId: workspace.id,
      eventType: "content.job.created",
      entityType: "content_job",
      entityId: created.id,
      summary: `${input.kind === "post" ? "投稿" : "返信"}ジョブを作成しました`,
      metadata: {
        status: this.mapStatus(created.status),
      },
    });
    await this.billing.recordContentJobCreated(workspace.id);

    return this.mapContentJob(created);
  }

  async decideApproval(id: string, input: ApprovalDecisionInput, workspaceId?: string, reviewerId?: string): Promise<ContentJob> {
    if (input.decision !== "approve" && input.decision !== "reject") {
      throw new BadRequestException("decision must be approve or reject");
    }

    const [job, reviewer] = await Promise.all([
      this.prisma.contentJob.findUnique({
        where: { id },
      }),
      reviewerId
        ? this.prisma.user.findFirst({
            where: {
              id: reviewerId,
              ...(workspaceId ? { workspaceId } : {}),
            },
          })
        : this.prisma.user.findFirst({
            where: workspaceId ? { workspaceId } : undefined,
            orderBy: { createdAt: "asc" },
          }),
    ]);

    if (!job) {
      throw new NotFoundException("content job not found");
    }
    if (workspaceId && job.workspaceId !== workspaceId) {
      throw new NotFoundException("content job not found");
    }

    if (job.status !== ContentStatus.AWAITING_APPROVAL) {
      throw new BadRequestException("content job is not awaiting approval");
    }

    if (!reviewer) {
      throw new BadRequestException("No reviewer available");
    }

    const nextStatus =
      input.decision === "approve"
        ? job.scheduledAt
          ? ContentStatus.SCHEDULED
          : ContentStatus.QUEUED
        : ContentStatus.DRAFT;

    const [, updatedJob] = await this.prisma.$transaction([
      this.prisma.contentApproval.create({
        data: {
          contentJobId: job.id,
          reviewerId: reviewer.id,
          status:
            input.decision === "approve"
              ? ApprovalStatus.APPROVED
              : ApprovalStatus.REJECTED,
          note: input.note?.trim() || null,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.contentJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
        },
      }),
    ]);

    await this.auditService.record({
      workspaceId: job.workspaceId,
      actorUserId: reviewer.id,
      eventType: input.decision === "approve" ? "content.job.approved" : "content.job.rejected",
      entityType: "content_job",
      entityId: job.id,
      summary: input.decision === "approve" ? "ジョブを承認しました" : "ジョブを差し戻しました",
      metadata: {
        note: input.note?.trim() || null,
      },
    });

    if (input.decision === "approve") {
      await this.notificationsService.emit({
        workspaceId: job.workspaceId,
        eventType: "approval.approved",
        title: "ジョブ承認",
        message: `ジョブ ${job.id} を承認しました`,
        metadata: {
          contentKind: this.mapKind(job.kind),
        },
      });
    }

    return this.mapContentJob(updatedJob);
  }

  async decideApprovalsBatch(input: BatchApprovalDecisionInput, workspaceId?: string, reviewerId?: string): Promise<ContentJob[]> {
    if (input.jobIds.length === 0) {
      throw new BadRequestException("jobIds are required");
    }

    const results: ContentJob[] = [];
    for (const jobId of input.jobIds) {
      results.push(
        await this.decideApproval(jobId, {
          decision: input.decision,
          note: input.note,
        }, workspaceId, reviewerId),
      );
    }
    return results;
  }

  async updateContentJob(id: string, input: UpdateContentJobInput, workspaceId?: string): Promise<ContentJob> {
    const job = workspaceId
      ? await this.prisma.contentJob.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.contentJob.findUnique({
          where: { id },
        });

    if (!job) {
      throw new NotFoundException("content job not found");
    }

    if (
      job.status !== ContentStatus.FAILED &&
      job.status !== ContentStatus.DRAFT &&
      job.status !== ContentStatus.AWAITING_APPROVAL
    ) {
      throw new BadRequestException("only failed, draft or awaiting approval jobs can be edited");
    }

    const body = input.body.trim();
    if (!body) {
      throw new BadRequestException("body is required");
    }

    const safety = this.contentSafetyService.validate({
      body,
      kind: this.mapKind(job.kind),
    });
    if (!safety.safe) {
      throw new BadRequestException(safety.reasons.join(" / "));
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("scheduledAt must be a valid ISO date");
    }

    const updated = await this.prisma.contentJob.update({
      where: { id: job.id },
      data: {
        body,
        scheduledAt,
        lastError: null,
      },
    });

    await this.auditService.record({
      workspaceId: job.workspaceId,
      eventType: "content.job.updated",
      entityType: "content_job",
      entityId: job.id,
      summary: "ジョブ本文を更新しました",
      metadata: {
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      },
    });

    return this.mapContentJob(updated);
  }

  async reopenFailedJob(id: string, workspaceId?: string): Promise<ContentJob> {
    const job = workspaceId
      ? await this.prisma.contentJob.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.contentJob.findUnique({
          where: { id },
        });

    if (!job) {
      throw new NotFoundException("content job not found");
    }

    if (job.status !== ContentStatus.FAILED) {
      throw new BadRequestException("only failed jobs can be reopened");
    }

    const updated = await this.prisma.contentJob.update({
      where: { id: job.id },
      data: {
        status: ContentStatus.AWAITING_APPROVAL,
        processingStartedAt: null,
      },
    });

    await this.auditService.record({
      workspaceId: job.workspaceId,
      eventType: "content.job.reopened",
      entityType: "content_job",
      entityId: job.id,
      summary: "failed ジョブを再審査に戻しました",
    });

    return this.mapContentJob(updated);
  }

  async retryContentJob(id: string, workspaceId?: string): Promise<ContentJob> {
    const job = workspaceId
      ? await this.prisma.contentJob.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.contentJob.findUnique({
          where: { id },
        });

    if (!job) {
      throw new NotFoundException("content job not found");
    }

    if (job.status !== ContentStatus.FAILED && job.status !== ContentStatus.DRAFT) {
      throw new BadRequestException("only failed or draft jobs can be retried");
    }

    const updated = await this.prisma.contentJob.update({
      where: { id: job.id },
      data: {
        status: job.scheduledAt ? ContentStatus.SCHEDULED : ContentStatus.QUEUED,
        processingStartedAt: null,
        nextRetryAt: null,
        lastError: null,
      },
    });

    await this.auditService.record({
      workspaceId: job.workspaceId,
      eventType: "content.job.retried",
      entityType: "content_job",
      entityId: job.id,
      summary: "ジョブを再投入しました",
    });

    return this.mapContentJob(updated);
  }

  async syncMentions(xAccountId?: string, workspaceId?: string): Promise<SyncMentionsResult> {
    if (workspaceId) {
      await this.billing.assertWithinLimit(workspaceId, "mention_sync_runs");
    }
    const xAccount = xAccountId
      ? await this.prisma.xAccount.findFirst({ where: { id: xAccountId, ...(workspaceId ? { workspaceId } : {}) } })
      : await this.prisma.xAccount.findFirst({
          where: {
            ...(workspaceId ? { workspaceId } : {}),
            status: "CONNECTED",
          },
          orderBy: { createdAt: "asc" },
        });

    if (!xAccount?.xUserId) {
      throw new BadRequestException("Connected X account with access token is required");
    }

    const accessToken = await this.authService.ensureActiveAccessToken(xAccount.id);

    const syncState = await this.prisma.xSyncState.findUnique({
      where: { xAccountId: xAccount.id },
    });
    if (syncState?.rateLimitedUntil && syncState.rateLimitedUntil > new Date()) {
      return {
        imported: 0,
        mentions: await this.listMentions(xAccount.id, xAccount.workspaceId),
        nextPaginationToken: syncState.nextPaginationToken ?? null,
        rateLimitedUntil: syncState.rateLimitedUntil.toISOString(),
      };
    }

    let paginationToken = syncState?.nextPaginationToken ?? undefined;
    let newestMentionId = syncState?.lastMentionId ?? undefined;
    let imported = 0;
    let rateLimitedUntil: Date | null = null;

    try {
      for (let page = 0; page < 3; page += 1) {
        const response = await this.xApiService.getMentions({
          xUserId: xAccount.xUserId,
          accessToken,
          sinceId: paginationToken ? undefined : newestMentionId,
          paginationToken,
          maxResults: 25,
        });

        const usernames = new Map(
          (response.includes?.users ?? []).map((user) => [user.id, user.username ?? "unknown"]),
        );

        for (const item of response.data ?? []) {
          await this.prisma.mention.upsert({
            where: { externalMentionId: item.id },
            update: {
              authorXUserId: item.author_id ?? null,
              authorHandle: usernames.get(item.author_id ?? "") ?? "unknown",
              body: item.text,
              referencedPostId:
                item.referenced_tweets?.find((tweet) => tweet.type === "replied_to")?.id ?? null,
              mentionedAt: item.created_at ? new Date(item.created_at) : new Date(),
            },
            create: {
              workspaceId: xAccount.workspaceId,
              xAccountId: xAccount.id,
              externalMentionId: item.id,
              authorXUserId: item.author_id ?? null,
              authorHandle: usernames.get(item.author_id ?? "") ?? "unknown",
              body: item.text,
              referencedPostId:
                item.referenced_tweets?.find((tweet) => tweet.type === "replied_to")?.id ?? null,
              mentionedAt: item.created_at ? new Date(item.created_at) : new Date(),
              status: MentionStatus.NEW,
            },
          });

          const storedMention = await this.prisma.mention.findUnique({
            where: { externalMentionId: item.id },
          });
          if (storedMention) {
        await this.applyFixedReplyRules(storedMention, xAccount.id, xAccount.xUserId, accessToken);
          }
          imported += 1;
        }

        newestMentionId = response.meta?.newest_id ?? newestMentionId;
        paginationToken = response.meta?.next_token;
        if (!paginationToken) {
          break;
        }
      }
    } catch (error) {
      if (error instanceof XApiRateLimitError) {
        rateLimitedUntil = new Date(Date.now() + (error.retryAfterSeconds ?? 900) * 1000);
        await this.auditService.record({
          workspaceId: xAccount.workspaceId,
          eventType: "x.sync.rate_limited",
          entityType: "x_account",
          entityId: xAccount.id,
          summary: "mention 同期が rate limit で停止しました",
          metadata: {
            retryAfterSeconds: error.retryAfterSeconds,
          },
        });
      } else {
        throw error;
      }
    }

    await this.prisma.xSyncState.upsert({
      where: { xAccountId: xAccount.id },
      update: {
        workspaceId: xAccount.workspaceId,
        lastMentionId: newestMentionId ?? null,
        nextPaginationToken: paginationToken ?? null,
        rateLimitedUntil,
        lastSyncedAt: new Date(),
      },
      create: {
        workspaceId: xAccount.workspaceId,
        xAccountId: xAccount.id,
        lastMentionId: newestMentionId ?? null,
        nextPaginationToken: paginationToken ?? null,
        rateLimitedUntil,
        lastSyncedAt: new Date(),
      },
    });
    await this.billing.recordMentionSync(xAccount.workspaceId, imported);

    return {
      imported,
      mentions: await this.listMentions(xAccount.id, xAccount.workspaceId),
      nextPaginationToken: paginationToken ?? null,
      rateLimitedUntil: rateLimitedUntil ? rateLimitedUntil.toISOString() : null,
    };
  }

  async generateReplyFromMention(
    mentionId: string,
    input: Omit<GenerateReplyDraftInput, "sourceText" | "inReplyToPostId">,
    workspaceId?: string,
  ): Promise<ContentJob> {
    const mention = workspaceId
      ? await this.prisma.mention.findFirst({
          where: { id: mentionId, workspaceId },
        })
      : await this.prisma.mention.findUnique({
          where: { id: mentionId },
        });

    if (!mention) {
      throw new NotFoundException("mention not found");
    }

    const generated = await this.aiService.generateReplyDraft({
      sourceText: mention.body,
      tone: input.tone,
      goal: input.goal,
      xAccountId: mention.xAccountId,
      inReplyToPostId: mention.externalMentionId,
    }, mention.workspaceId);

    await this.prisma.mention.update({
      where: { id: mention.id },
      data: {
        status: MentionStatus.REVIEWED,
      },
    });

    return generated.job;
  }

  async sendContentJob(id: string, workspaceId?: string): Promise<SendContentJobResult> {
    const job = workspaceId
      ? await this.prisma.contentJob.findFirst({
          where: { id, workspaceId },
          include: {
            xAccount: true,
          },
        })
      : await this.prisma.contentJob.findUnique({
          where: { id },
          include: {
            xAccount: true,
          },
        });

    if (!job) {
      throw new NotFoundException("content job not found");
    }

    if (
      job.status !== ContentStatus.QUEUED &&
      job.status !== ContentStatus.SCHEDULED &&
      job.status !== ContentStatus.PROCESSING
    ) {
      throw new BadRequestException("content job must be queued, scheduled or processing before sending");
    }

    const safety = this.contentSafetyService.validate({
      body: job.body,
      kind: this.mapKind(job.kind),
    });
    if (!safety.safe) {
      await this.prisma.contentJob.update({
        where: { id: job.id },
        data: {
          status: ContentStatus.AWAITING_APPROVAL,
          lastError: safety.reasons.join(" / "),
          processingStartedAt: null,
        },
      });

      await this.auditService.record({
        workspaceId: job.workspaceId,
        eventType: "content.job.safety_blocked",
        entityType: "content_job",
        entityId: job.id,
        summary: "安全判定によりジョブを承認待ちへ戻しました",
        metadata: {
          reasons: safety.reasons,
        },
      });

      await this.notificationsService.emit({
        workspaceId: job.workspaceId,
        eventType: "content.failed",
        title: "安全判定で送信停止",
        message: `ジョブ ${job.id} は安全判定により停止されました`,
        metadata: {
          reasons: safety.reasons,
        },
      });

      throw new ContentSafetyError(safety.reasons);
    }

    const sent = await this.xApiService.createPost({
      accessToken: await this.authService.ensureActiveAccessToken(job.xAccountId),
      text: job.body,
      inReplyToPostId: job.inReplyToPostId,
    });

    const updated = await this.prisma.contentJob.update({
      where: { id: job.id },
      data: {
        status: ContentStatus.PUBLISHED,
        externalPostId: sent.id,
        publishedAt: new Date(),
        processingStartedAt: null,
        nextRetryAt: null,
        lastError: null,
      },
    });

    await this.auditService.record({
      workspaceId: job.workspaceId,
      eventType: "content.job.published",
      entityType: "content_job",
      entityId: job.id,
      summary: "ジョブをXへ送信しました",
      metadata: {
        sentPostId: sent.id,
      },
    });

    if (job.inReplyToPostId) {
      await this.prisma.mention.updateMany({
        where: {
          externalMentionId: job.inReplyToPostId,
        },
        data: {
          status: MentionStatus.REPLIED,
        },
      });
    }

    await this.notificationsService.emit({
      workspaceId: job.workspaceId,
      eventType: "content.published",
      title: "X送信完了",
      message: `ジョブ ${job.id} をXへ送信しました`,
      metadata: {
        sentPostId: sent.id,
      },
    });

    return {
      job: this.mapContentJob(updated),
      sentPostId: sent.id,
    };
  }

  async dispatchDueContentJobs(): Promise<string[]> {
    const now = new Date();
    const jobs = await this.prisma.contentJob.findMany({
      where: {
        OR: [
          {
            status: ContentStatus.QUEUED,
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          {
            status: ContentStatus.SCHEDULED,
            scheduledAt: {
              lte: now,
            },
          },
        ],
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 20,
    });

    const sentJobs: string[] = [];
    for (const job of jobs) {
      try {
        const claimed = await this.prisma.contentJob.updateMany({
          where: {
            id: job.id,
            status: job.status,
          },
          data: {
            status: ContentStatus.PROCESSING,
            processingStartedAt: now,
          },
        });

        if (claimed.count === 0) {
          continue;
        }

        await this.sendContentJob(job.id);
        sentJobs.push(job.id);
      } catch (error) {
        if (error instanceof ContentSafetyError) {
          continue;
        }

        const latest = await this.prisma.contentJob.findUnique({
          where: { id: job.id },
        });
        const nextRetryCount = (latest?.retryCount ?? 0) + 1;
        const shouldFail = nextRetryCount >= this.maxRetryCount;
        await this.prisma.contentJob.update({
          where: { id: job.id },
          data: {
            status: shouldFail ? ContentStatus.FAILED : ContentStatus.QUEUED,
            retryCount: nextRetryCount,
            nextRetryAt: shouldFail ? null : new Date(Date.now() + nextRetryCount * 60_000),
            lastError: error instanceof Error ? error.message : String(error),
            processingStartedAt: null,
          },
        });

        await this.auditService.record({
          workspaceId: latest?.workspaceId ?? job.workspaceId,
          eventType: shouldFail ? "content.job.failed" : "content.job.retry_scheduled",
          entityType: "content_job",
          entityId: job.id,
          summary: shouldFail ? "ジョブが失敗状態になりました" : "ジョブの再試行を予約しました",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            retryCount: nextRetryCount,
          },
        });

        if (shouldFail) {
          await this.notificationsService.emit({
            workspaceId: latest?.workspaceId ?? job.workspaceId,
            eventType: "content.failed",
            title: "X送信失敗",
            message: `ジョブ ${job.id} が失敗状態になりました`,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    }

    return sentJobs;
  }

  async unlockStuckJob(id: string, workspaceId?: string): Promise<ContentJob> {
    const job = workspaceId
      ? await this.prisma.contentJob.findFirst({
          where: { id, workspaceId },
        })
      : await this.prisma.contentJob.findUnique({
          where: { id },
        });

    if (!job) {
      throw new NotFoundException("content job not found");
    }
    if (job.status !== ContentStatus.PROCESSING) {
      throw new BadRequestException("only processing jobs can be unlocked");
    }

    const updated = await this.prisma.contentJob.update({
      where: { id },
      data: {
        status: job.scheduledAt ? ContentStatus.SCHEDULED : ContentStatus.QUEUED,
        processingStartedAt: null,
        lastError: "manually unlocked",
      },
    });

    await this.auditService.record({
      workspaceId: job.workspaceId,
      eventType: "content.job.unlocked",
      entityType: "content_job",
      entityId: job.id,
      summary: "processing ジョブを手動で解除しました",
    });

    return this.mapContentJob(updated);
  }

  private async requireWorkspace(workspaceId?: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      orderBy: { createdAt: "asc" },
    });

    if (!workspace) {
      throw new BadRequestException("No seeded workspace found");
    }

    return workspace;
  }

  private mapAccountStatus(status: XAccountStatus): "connected" | "disconnected" {
    return status === XAccountStatus.CONNECTED ? "connected" : "disconnected";
  }

  private selectAccount<T extends { id: string }>(accounts: T[], xAccountId?: string) {
    if (!xAccountId) {
      return accounts[0] ?? null;
    }

    return accounts.find((account) => account.id === xAccountId) ?? null;
  }

  private async applyFixedReplyRules(
    mention: {
      id: string;
      workspaceId: string;
      xAccountId: string;
      externalMentionId: string;
      authorXUserId: string | null;
      authorHandle: string;
      body: string;
      referencedPostId: string | null;
    },
    xAccountId: string,
    xAccountUserId: string,
    accessToken: string,
  ) {
      const rules = await this.prisma.fixedReplyRule.findMany({
      where: {
        xAccountId,
        isActive: true,
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    const policy = await this.prisma.automationPolicy.findFirst({
      where: { workspaceId: mention.workspaceId },
      orderBy: { createdAt: "asc" },
    });
    if (!policy?.autoReplyEnabled || policy.autoReplyPaused) {
      return;
    }
    if (policy.autoReplyCooldownUntil && policy.autoReplyCooldownUntil > new Date()) {
      return;
    }

    for (const rule of rules) {
      if (mention.referencedPostId !== rule.fixedPostId) {
        continue;
      }
      if (rule.activeFrom && rule.activeFrom > new Date()) {
        continue;
      }
      if (rule.activeTo && rule.activeTo < new Date()) {
        continue;
      }

      if (rule.triggerPhrase && !mention.body.includes(rule.triggerPhrase)) {
        continue;
      }

      if (!mention.authorXUserId) {
        continue;
      }
      if (this.readStringArray(rule.excludedUserIds).includes(mention.authorXUserId)) {
        continue;
      }

      if (rule.requireLike) {
        const likingUsers = await this.xApiService.getLikingUsers({
          accessToken,
          postId: rule.fixedPostId,
        });
        if (!(likingUsers.data ?? []).some((user) => user.id === mention.authorXUserId)) {
          continue;
        }
      }

      if (rule.requireRetweet) {
        const retweetedBy = await this.xApiService.getRetweetedBy({
          accessToken,
          postId: rule.fixedPostId,
        });
        if (!(retweetedBy.data ?? []).some((user) => user.id === mention.authorXUserId)) {
          continue;
        }
      }

      if (rule.requireFollow) {
        const following = await this.xApiService.getFollowingUsers({
          accessToken,
          xUserId: xAccountUserId,
        });
        if (!(following.data ?? []).some((user) => user.id === mention.authorXUserId)) {
          continue;
        }
      }

      const existingJob = await this.prisma.contentJob.findFirst({
        where: {
          xAccountId: mention.xAccountId,
          inReplyToPostId: mention.externalMentionId,
        },
      });
      if (existingJob) {
        continue;
      }

      const limitsOk = await this.canCreateAutoReply({
        mention,
        rule,
        policy,
      });
      if (!limitsOk.allowed) {
        await this.auditService.record({
          workspaceId: mention.workspaceId,
          eventType: "fixed.reply.skipped",
          entityType: "mention",
          entityId: mention.id,
          summary: "固定返信ルールに一致したが制限によりスキップしました",
          metadata: {
            reason: limitsOk.reason,
            ruleId: rule.id,
          },
        });
        continue;
      }

      const replyBody = this.renderFixedReplyTemplate(rule, mention);
      const status =
        policy?.approvalMode === ApprovalMode.MANUAL
          ? ContentStatus.AWAITING_APPROVAL
          : ContentStatus.QUEUED;

      await this.prisma.contentJob.create({
        data: {
          workspaceId: mention.workspaceId,
          xAccountId: mention.xAccountId,
          kind: ContentKind.REPLY,
          body: replyBody,
          inReplyToPostId: mention.externalMentionId,
          targetAuthorXUserId: mention.authorXUserId,
          targetAuthorHandle: mention.authorHandle,
          status,
          sourcePrompt: `fixed-reply-rule:${rule.id}`,
        },
      });

      await this.auditService.record({
        workspaceId: mention.workspaceId,
        eventType: "fixed.reply.auto_created",
        entityType: "content_job",
        entityId: mention.externalMentionId,
        summary: "固定投稿ルールにより返信ジョブを作成しました",
        metadata: {
          ruleId: rule.id,
          mentionId: mention.id,
        },
      });
    }
  }

  private renderFixedReplyTemplate(
    rule: {
      replyTemplate: string;
      includeAuthorId: boolean;
      includeAuthorHandle: boolean;
    },
    mention: {
      authorXUserId: string | null;
      authorHandle: string;
    },
  ) {
    let body = rule.replyTemplate;

    body = body.replaceAll("{{author_id}}", mention.authorXUserId ?? "");
    body = body.replaceAll("{{author_handle}}", mention.authorHandle);

    if (rule.includeAuthorHandle && !body.includes(`@${mention.authorHandle}`)) {
      body = `@${mention.authorHandle} ${body}`.trim();
    }

    if (rule.includeAuthorId && mention.authorXUserId && !body.includes(mention.authorXUserId)) {
      body = `${body} ${mention.authorXUserId}`.trim();
    }

    return body;
  }

  private async canCreateAutoReply(params: {
    mention: {
      xAccountId: string;
      authorXUserId: string | null;
    };
    rule: {
      maxRepliesPerAuthorPerDay: number;
    };
    policy: {
      maxAutoRepliesPerHour: number;
      maxAutoRepliesPerDay: number;
      maxConsecutiveAutoReplies: number;
      spikeLimit10Minutes: number;
    };
  }) {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [hourCount, dayCount, tenMinuteCount, authorCount, recentReplies] = await Promise.all([
      this.prisma.contentJob.count({
        where: {
          xAccountId: params.mention.xAccountId,
          kind: ContentKind.REPLY,
          sourcePrompt: { startsWith: "fixed-reply-rule:" },
          createdAt: { gte: hourAgo },
          status: { not: ContentStatus.FAILED },
        },
      }),
      this.prisma.contentJob.count({
        where: {
          xAccountId: params.mention.xAccountId,
          kind: ContentKind.REPLY,
          sourcePrompt: { startsWith: "fixed-reply-rule:" },
          createdAt: { gte: dayStart },
          status: { not: ContentStatus.FAILED },
        },
      }),
      this.prisma.contentJob.count({
        where: {
          xAccountId: params.mention.xAccountId,
          kind: ContentKind.REPLY,
          sourcePrompt: { startsWith: "fixed-reply-rule:" },
          createdAt: { gte: tenMinutesAgo },
          status: { not: ContentStatus.FAILED },
        },
      }),
      params.mention.authorXUserId
        ? this.prisma.contentJob.count({
            where: {
              xAccountId: params.mention.xAccountId,
              kind: ContentKind.REPLY,
              sourcePrompt: { startsWith: "fixed-reply-rule:" },
              targetAuthorXUserId: params.mention.authorXUserId,
              createdAt: { gte: dayStart },
              status: { not: ContentStatus.FAILED },
            },
          })
        : Promise.resolve(0),
      this.prisma.contentJob.findMany({
        where: {
          xAccountId: params.mention.xAccountId,
          kind: ContentKind.REPLY,
          sourcePrompt: { startsWith: "fixed-reply-rule:" },
          createdAt: { gte: dayStart },
          status: { not: ContentStatus.FAILED },
        },
        orderBy: { createdAt: "desc" },
        take: params.policy.maxConsecutiveAutoReplies,
        select: { sourcePrompt: true },
      }),
    ]);

    if (hourCount >= params.policy.maxAutoRepliesPerHour) {
      return { allowed: false, reason: "hour_limit" };
    }
    if (dayCount >= params.policy.maxAutoRepliesPerDay) {
      return { allowed: false, reason: "day_limit" };
    }
    if (tenMinuteCount >= params.policy.spikeLimit10Minutes) {
      return { allowed: false, reason: "spike_limit" };
    }
    if (authorCount >= params.rule.maxRepliesPerAuthorPerDay) {
      return { allowed: false, reason: "author_daily_limit" };
    }
    if (
      recentReplies.length >= params.policy.maxConsecutiveAutoReplies &&
      recentReplies.every((item) => item.sourcePrompt?.startsWith("fixed-reply-rule:"))
    ) {
      return { allowed: false, reason: "consecutive_limit" };
    }

    return { allowed: true as const };
  }

  private mapFixedReplyRule(rule: {
    id: string;
    xAccountId: string;
    fixedPostId: string;
    fixedPostText: string;
    triggerPhrase: string | null;
    requireLike: boolean;
    requireRetweet: boolean;
    requireFollow: boolean;
    activeFrom: Date | null;
    activeTo: Date | null;
    maxRepliesPerAuthorPerDay: number;
    excludedUserIds: unknown;
    replyTemplate: string;
    priority: number;
    includeAuthorId: boolean;
    includeAuthorHandle: boolean;
    isActive: boolean;
  }): FixedReplyRuleSummary {
    return {
      id: rule.id,
      xAccountId: rule.xAccountId,
      fixedPostId: rule.fixedPostId,
      fixedPostText: rule.fixedPostText,
      triggerPhrase: rule.triggerPhrase,
      requireLike: rule.requireLike,
      requireRetweet: rule.requireRetweet,
      requireFollow: rule.requireFollow,
      activeFrom: rule.activeFrom ? rule.activeFrom.toISOString() : null,
      activeTo: rule.activeTo ? rule.activeTo.toISOString() : null,
      maxRepliesPerAuthorPerDay: rule.maxRepliesPerAuthorPerDay,
      excludedUserIds: this.readStringArray(rule.excludedUserIds),
      replyTemplate: rule.replyTemplate,
      priority: rule.priority,
      includeAuthorId: rule.includeAuthorId,
      includeAuthorHandle: rule.includeAuthorHandle,
      isActive: rule.isActive,
    };
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  private mapApprovalMode(mode: ApprovalMode): "auto" | "manual" {
    return mode === ApprovalMode.AUTO ? "auto" : "manual";
  }

  private mapApprovalStatus(
    status: ApprovalStatus,
  ): "approved" | "rejected" | "pending" {
    switch (status) {
      case ApprovalStatus.APPROVED:
        return "approved";
      case ApprovalStatus.REJECTED:
        return "rejected";
      case ApprovalStatus.PENDING:
        return "pending";
    }
  }

  private mapKind(kind: ContentKind): "post" | "reply" {
    return kind === ContentKind.POST ? "post" : "reply";
  }

  private mapMentionStatus(
    status: MentionStatus,
  ): "new" | "reviewed" | "replied" | "ignored" {
    switch (status) {
      case MentionStatus.NEW:
        return "new";
      case MentionStatus.REVIEWED:
        return "reviewed";
      case MentionStatus.REPLIED:
        return "replied";
      case MentionStatus.IGNORED:
        return "ignored";
    }
  }

  private mapStatus(
    status: ContentStatus,
  ): "draft" | "queued" | "awaiting_approval" | "scheduled" | "processing" | "published" | "failed" {
    switch (status) {
      case ContentStatus.DRAFT:
        return "draft";
      case ContentStatus.QUEUED:
        return "queued";
      case ContentStatus.AWAITING_APPROVAL:
        return "awaiting_approval";
      case ContentStatus.SCHEDULED:
        return "scheduled";
      case ContentStatus.PROCESSING:
        return "processing";
      case ContentStatus.PUBLISHED:
        return "published";
      case ContentStatus.FAILED:
        return "failed";
    }
  }

  private mapContentJob(job: {
    id: string;
    workspaceId: string;
    xAccountId: string;
    kind: ContentKind;
    body: string;
    status: ContentStatus;
    inReplyToPostId?: string | null;
    targetAuthorXUserId?: string | null;
    targetAuthorHandle?: string | null;
    externalPostId?: string | null;
    retryCount?: number;
    nextRetryAt?: Date | null;
    lastError?: string | null;
    scheduledAt: Date | null;
  }): ContentJob {
    return {
      id: job.id,
      workspaceId: job.workspaceId,
      xAccountId: job.xAccountId,
      kind: this.mapKind(job.kind),
      body: job.body,
      status: this.mapStatus(job.status),
      inReplyToPostId: job.inReplyToPostId ?? null,
      targetAuthorXUserId: job.targetAuthorXUserId ?? null,
      targetAuthorHandle: job.targetAuthorHandle ?? null,
      externalPostId: job.externalPostId ?? null,
      retryCount: job.retryCount ?? 0,
      nextRetryAt: job.nextRetryAt ? job.nextRetryAt.toISOString() : null,
      lastError: job.lastError ?? null,
      scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
    };
  }
}
