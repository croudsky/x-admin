import { BadRequestException } from "@nestjs/common";
import {
  ApprovalMode,
  ApprovalStatus,
  ContentKind,
  ContentStatus,
  MentionStatus,
  XAccountStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AutomationService } from "./automation.service";

function createWorkspaceFixture(overrides?: {
  approvalMode?: ApprovalMode;
  autoPostEnabled?: boolean;
  autoReplyEnabled?: boolean;
}) {
  return {
    id: "ws_seed_oku",
    name: "Oku Personal Workspace",
    createdAt: new Date("2026-03-18T00:00:00.000Z"),
    updatedAt: new Date("2026-03-18T00:00:00.000Z"),
    xAccounts: [
      {
        id: "acc_seed_oku",
        workspaceId: "ws_seed_oku",
        handle: "@oku_ai",
        displayName: "Oku Labs",
        xUserId: "oku-demo-account",
        status: XAccountStatus.CONNECTED,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        createdAt: new Date("2026-03-18T00:00:00.000Z"),
        updatedAt: new Date("2026-03-18T00:00:00.000Z"),
      },
    ],
    automationPolicies: [
      {
        id: "policy_seed_oku",
        workspaceId: "ws_seed_oku",
        xAccountId: "acc_seed_oku",
        approvalMode: overrides?.approvalMode ?? ApprovalMode.MANUAL,
        autoPostEnabled: overrides?.autoPostEnabled ?? false,
        autoReplyEnabled: overrides?.autoReplyEnabled ?? true,
        autoReplyPaused: false,
        autoReplyPauseReason: null,
        autoReplyCooldownUntil: null,
        maxAutoRepliesPerHour: 20,
        maxAutoRepliesPerDay: 100,
        maxConsecutiveAutoReplies: 10,
        spikeLimit10Minutes: 15,
        createdAt: new Date("2026-03-18T00:00:00.000Z"),
        updatedAt: new Date("2026-03-18T00:00:00.000Z"),
      },
    ],
    contentJobs: [],
  };
}

describe("AutomationService", () => {
  const aiService = {
    generateReplyDraft: vi.fn(),
  };
  const xApiService = {
    getMentions: vi.fn(),
    createPost: vi.fn(),
    getLikingUsers: vi.fn(),
    getRetweetedBy: vi.fn(),
  };
  const authService = {
    ensureActiveAccessToken: vi.fn().mockResolvedValue("access-token"),
  };
  const notificationsService = {
    emit: vi.fn().mockResolvedValue(undefined),
  };
  const auditService = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  const contentSafetyService = {
    validate: vi.fn().mockReturnValue({ safe: true, reasons: [] }),
  };
  const billingService = {
    assertWithinLimit: vi.fn().mockResolvedValue(undefined),
    recordContentJobCreated: vi.fn().mockResolvedValue(undefined),
    recordMentionSync: vi.fn().mockResolvedValue(undefined),
  };

  it("returns null overview when no workspace is seeded", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
      billingService as never,
    );
    await expect(service.getOverview()).resolves.toEqual({
      account: null,
      policy: null,
      queue: [],
    });
  });

  it("creates an awaiting approval job in manual approval mode", async () => {
    const workspace = createWorkspaceFixture({ approvalMode: ApprovalMode.MANUAL });
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue(workspace),
      },
      contentJob: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "job_1",
          workspaceId: data.workspaceId,
          xAccountId: data.xAccountId,
          kind: data.kind,
          body: data.body,
          status: data.status,
          scheduledAt: data.scheduledAt,
          targetAuthorXUserId: null,
          targetAuthorHandle: null,
        })),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    const created = await service.createContentJob({
      kind: "post",
      body: "  手動承認で投稿する内容  ",
      scheduledAt: "2026-03-19T09:00:00.000Z",
    });

    expect(created).toEqual({
      id: "job_1",
      workspaceId: "ws_seed_oku",
      xAccountId: "acc_seed_oku",
      kind: "post",
      body: "手動承認で投稿する内容",
      status: "awaiting_approval",
      inReplyToPostId: null,
      targetAuthorXUserId: null,
      targetAuthorHandle: null,
      externalPostId: null,
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
      scheduledAt: "2026-03-19T09:00:00.000Z",
    });
    expect(prisma.contentJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: ContentStatus.AWAITING_APPROVAL,
        kind: ContentKind.POST,
      }),
    });
  });

  it("creates a queued job in auto mode when no schedule is provided", async () => {
    const workspace = createWorkspaceFixture({ approvalMode: ApprovalMode.AUTO });
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue(workspace),
      },
      contentJob: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "job_2",
          workspaceId: data.workspaceId,
          xAccountId: data.xAccountId,
          kind: data.kind,
          body: data.body,
          status: data.status,
          scheduledAt: data.scheduledAt,
          targetAuthorXUserId: null,
          targetAuthorHandle: null,
        })),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    const created = await service.createContentJob({
      kind: "reply",
      body: "即時返信を送る",
      scheduledAt: null,
    });

    expect(created.status).toBe("queued");
    expect(created.kind).toBe("reply");
    expect(prisma.contentJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: ContentStatus.QUEUED,
        kind: ContentKind.REPLY,
      }),
    });
  });

  it("rejects empty body", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn(),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    await expect(
      service.createContentJob({
        kind: "post",
        body: "   ",
        scheduledAt: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("approves an awaiting approval job and moves it to scheduled", async () => {
    const reviewer = {
      id: "user_seed_oku",
      createdAt: new Date("2026-03-18T00:00:00.000Z"),
    };
    const job = {
      id: "job_approval_1",
      workspaceId: "ws_seed_oku",
      xAccountId: "acc_seed_oku",
      kind: ContentKind.POST,
      body: "承認待ちの投稿",
      status: ContentStatus.AWAITING_APPROVAL,
      scheduledAt: new Date("2026-03-20T09:00:00.000Z"),
    };
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockReturnValue({
          id: job.id,
          workspaceId: job.workspaceId,
          xAccountId: job.xAccountId,
          kind: job.kind,
          body: job.body,
          status: ContentStatus.SCHEDULED,
          scheduledAt: job.scheduledAt,
        }),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(reviewer),
      },
      contentApproval: {
        create: vi.fn().mockReturnValue({
          id: "approval_1",
        }),
      },
      $transaction: vi.fn().mockImplementation(async (operations: unknown[]) =>
        Promise.all(operations as Promise<unknown>[]),
      ),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    const result = await service.decideApproval(job.id, { decision: "approve" });

    expect(result.status).toBe("scheduled");
    expect(prisma.contentApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentJobId: job.id,
        reviewerId: reviewer.id,
        status: ApprovalStatus.APPROVED,
      }),
    });
  });

  it("approves jobs in batch", async () => {
    const reviewer = {
      id: "user_seed_oku",
      createdAt: new Date("2026-03-18T00:00:00.000Z"),
    };
    const prisma = {
      contentJob: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: "job_batch_1",
            workspaceId: "ws_seed_oku",
            xAccountId: "acc_seed_oku",
            kind: ContentKind.POST,
            body: "承認待ち1",
            status: ContentStatus.AWAITING_APPROVAL,
            scheduledAt: null,
          })
          .mockResolvedValueOnce({
            id: "job_batch_2",
            workspaceId: "ws_seed_oku",
            xAccountId: "acc_seed_oku",
            kind: ContentKind.REPLY,
            body: "承認待ち2",
            status: ContentStatus.AWAITING_APPROVAL,
            scheduledAt: null,
          }),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: "job_batch_1",
            workspaceId: "ws_seed_oku",
            xAccountId: "acc_seed_oku",
            kind: ContentKind.POST,
            body: "承認待ち1",
            status: ContentStatus.QUEUED,
            scheduledAt: null,
          })
          .mockResolvedValueOnce({
            id: "job_batch_2",
            workspaceId: "ws_seed_oku",
            xAccountId: "acc_seed_oku",
            kind: ContentKind.REPLY,
            body: "承認待ち2",
            status: ContentStatus.QUEUED,
            scheduledAt: null,
          }),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(reviewer),
      },
      contentApproval: {
        create: vi.fn().mockResolvedValue({ id: "approval_batch" }),
      },
      $transaction: vi.fn().mockImplementation(async (operations: unknown[]) =>
        Promise.all(operations as Promise<unknown>[]),
      ),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(
      service.decideApprovalsBatch({
        jobIds: ["job_batch_1", "job_batch_2"],
        decision: "approve",
      }),
    ).resolves.toHaveLength(2);
  });

  it("rejects an awaiting approval job and moves it back to draft", async () => {
    const reviewer = {
      id: "user_seed_oku",
      createdAt: new Date("2026-03-18T00:00:00.000Z"),
    };
    const job = {
      id: "job_approval_2",
      workspaceId: "ws_seed_oku",
      xAccountId: "acc_seed_oku",
      kind: ContentKind.REPLY,
      body: "承認待ちの返信",
      status: ContentStatus.AWAITING_APPROVAL,
      scheduledAt: null,
    };
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockReturnValue({
          ...job,
          status: ContentStatus.DRAFT,
        }),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(reviewer),
      },
      contentApproval: {
        create: vi.fn().mockReturnValue({
          id: "approval_2",
        }),
      },
      $transaction: vi.fn().mockImplementation(async (operations: unknown[]) =>
        Promise.all(operations as Promise<unknown>[]),
      ),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    const result = await service.decideApproval(job.id, {
      decision: "reject",
      note: "文面を調整",
    });

    expect(result.status).toBe("draft");
    expect(prisma.contentApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: ApprovalStatus.REJECTED,
        note: "文面を調整",
      }),
    });
  });

  it("lists approval history with reviewer and content details", async () => {
    const prisma = {
      contentApproval: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "approval_1",
            contentJobId: "job_1",
            status: ApprovalStatus.APPROVED,
            note: null,
            reviewedAt: new Date("2026-03-18T10:00:00.000Z"),
            createdAt: new Date("2026-03-18T10:00:00.000Z"),
            reviewer: {
              displayName: "Oku Owner",
            },
            contentJob: {
              kind: ContentKind.POST,
              body: "承認済みの投稿",
            },
          },
        ]),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    await expect(service.listApprovals()).resolves.toEqual([
      {
        id: "approval_1",
        contentJobId: "job_1",
        reviewerName: "Oku Owner",
        contentKind: "post",
        contentBody: "承認済みの投稿",
        status: "approved",
        note: null,
        reviewedAt: "2026-03-18T10:00:00.000Z",
        createdAt: "2026-03-18T10:00:00.000Z",
      },
    ]);
  });

  it("syncs mentions from X and stores them", async () => {
    const prisma = {
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
          workspaceId: "ws_seed_oku",
          xUserId: "x-user-1",
          accessToken: "access-token",
        }),
      },
      xSyncState: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
      },
      mention: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
        findUnique: vi.fn().mockResolvedValue({
          id: "mention_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          externalMentionId: "2001",
          authorXUserId: "u1",
          authorHandle: "customer1",
          body: "料金について教えてください",
          referencedPostId: "fixed_post_1",
          status: MentionStatus.NEW,
          mentionedAt: new Date("2026-03-19T00:00:00.000Z"),
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "mention_1",
            xAccountId: "acc_seed_oku",
            externalMentionId: "2001",
            authorXUserId: "u1",
            authorHandle: "customer1",
            body: "料金について教えてください",
            referencedPostId: "fixed_post_1",
            status: MentionStatus.NEW,
            mentionedAt: new Date("2026-03-19T00:00:00.000Z"),
          },
        ]),
      },
      fixedReplyRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      automationPolicy: {
        findFirst: vi.fn().mockResolvedValue({
          autoReplyEnabled: true,
          autoReplyPaused: false,
          autoReplyCooldownUntil: null,
          maxAutoRepliesPerHour: 20,
          maxAutoRepliesPerDay: 100,
          maxConsecutiveAutoReplies: 10,
          spikeLimit10Minutes: 15,
          approvalMode: ApprovalMode.MANUAL,
        }),
      },
    };
    const syncXApiService = {
      getMentions: vi.fn().mockResolvedValue({
        data: [
          {
            id: "2001",
            text: "料金について教えてください",
            author_id: "u1",
            created_at: "2026-03-19T00:00:00.000Z",
            referenced_tweets: [{ id: "fixed_post_1", type: "replied_to" }],
          },
        ],
        includes: {
          users: [{ id: "u1", username: "customer1" }],
        },
      }),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      syncXApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    await expect(service.syncMentions()).resolves.toEqual({
      imported: 1,
      mentions: [
        {
          id: "mention_1",
          xAccountId: "acc_seed_oku",
          externalMentionId: "2001",
          authorXUserId: "u1",
          authorHandle: "customer1",
          body: "料金について教えてください",
          referencedPostId: "fixed_post_1",
          status: "new",
          mentionedAt: "2026-03-19T00:00:00.000Z",
        },
      ],
      nextPaginationToken: null,
      rateLimitedUntil: null,
    });
  });

  it("generates a reply draft from a mention", async () => {
    const prisma = {
      mention: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mention_1",
          body: "料金について教えてください",
          externalMentionId: "2001",
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const aiService = {
      generateReplyDraft: vi.fn().mockResolvedValue({
        job: {
          id: "job_reply_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: "reply",
          body: "詳細は本日中にご案内します。",
          status: "awaiting_approval",
          scheduledAt: null,
        },
      }),
    };
    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    await expect(
      service.generateReplyFromMention("mention_1", {
        tone: "丁寧",
        goal: "詳細案内につなげる",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "job_reply_1",
        kind: "reply",
      }),
    );
  });

  it("sends a queued content job to X and marks it published", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_send_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.REPLY,
          body: "詳細は本日中にご案内します。",
          status: ContentStatus.QUEUED,
          scheduledAt: null,
          inReplyToPostId: "2001",
          externalPostId: null,
          xAccount: {
            accessToken: "access-token",
          },
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_send_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.REPLY,
          body: "詳細は本日中にご案内します。",
          status: ContentStatus.PUBLISHED,
          scheduledAt: null,
          inReplyToPostId: "2001",
          targetAuthorXUserId: null,
          targetAuthorHandle: null,
          externalPostId: "3001",
        }),
      },
      mention: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const sendXApiService = {
      createPost: vi.fn().mockResolvedValue({
        id: "3001",
        text: "詳細は本日中にご案内します。",
      }),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      sendXApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    await expect(service.sendContentJob("job_send_1")).resolves.toEqual({
      job: {
        id: "job_send_1",
        workspaceId: "ws_seed_oku",
        xAccountId: "acc_seed_oku",
        kind: "reply",
        body: "詳細は本日中にご案内します。",
        status: "published",
        inReplyToPostId: "2001",
        targetAuthorXUserId: null,
        targetAuthorHandle: null,
        externalPostId: "3001",
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
        scheduledAt: null,
      },
      sentPostId: "3001",
    });
  });

  it("sends a processing content job to X for worker dispatch", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_processing_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "本日の更新内容を公開しました。",
          status: ContentStatus.PROCESSING,
          scheduledAt: null,
          inReplyToPostId: null,
          externalPostId: null,
          xAccount: {
            accessToken: "access-token",
          },
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_processing_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "本日の更新内容を公開しました。",
          status: ContentStatus.PUBLISHED,
          scheduledAt: null,
          inReplyToPostId: null,
          targetAuthorXUserId: null,
          targetAuthorHandle: null,
          externalPostId: "post_processing_1",
        }),
      },
      mention: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const sendXApiService = {
      createPost: vi.fn().mockResolvedValue({
        id: "post_processing_1",
        text: "本日の更新内容を公開しました。",
      }),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      sendXApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(service.sendContentJob("job_processing_1")).resolves.toEqual(
      expect.objectContaining({
        sentPostId: "post_processing_1",
      }),
    );
  });

  it("moves unsafe content back to approval instead of sending", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_send_unsafe",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.REPLY,
          body: "絶対儲かるので今すぐ登録してください",
          status: ContentStatus.QUEUED,
          scheduledAt: null,
          inReplyToPostId: "2001",
          externalPostId: null,
          xAccount: {
            accessToken: "access-token",
          },
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_send_unsafe",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.REPLY,
          body: "絶対儲かるので今すぐ登録してください",
          status: ContentStatus.AWAITING_APPROVAL,
          scheduledAt: null,
          inReplyToPostId: "2001",
          externalPostId: null,
          lastError: "禁止表現を含んでいます: 絶対儲かる",
        }),
      },
    };
    const localSafetyService = {
      validate: vi.fn().mockReturnValue({
        safe: false,
        reasons: ["禁止表現を含んでいます: 絶対儲かる"],
      }),
    };
    const sendXApiService = {
      createPost: vi.fn(),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      sendXApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      localSafetyService as never,
    );

    await expect(service.sendContentJob("job_send_unsafe")).rejects.toThrow(
      "Content failed safety validation",
    );
    expect(sendXApiService.createPost).not.toHaveBeenCalled();
    expect(prisma.contentJob.update).toHaveBeenCalledWith({
      where: { id: "job_send_unsafe" },
      data: expect.objectContaining({
        status: ContentStatus.AWAITING_APPROVAL,
      }),
    });
  });

  it("reopens a failed job into approval review", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_failed_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "送信失敗した投稿",
          status: ContentStatus.FAILED,
          scheduledAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_failed_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "送信失敗した投稿",
          status: ContentStatus.AWAITING_APPROVAL,
          scheduledAt: null,
        }),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(service.reopenFailedJob("job_failed_1")).resolves.toEqual(
      expect.objectContaining({
        id: "job_failed_1",
        status: "awaiting_approval",
      }),
    );
  });

  it("retries a failed job back into the queue", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_failed_2",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "送信失敗した投稿",
          status: ContentStatus.FAILED,
          scheduledAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_failed_2",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "送信失敗した投稿",
          status: ContentStatus.QUEUED,
          scheduledAt: null,
          retryCount: 3,
          lastError: null,
          nextRetryAt: null,
        }),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(service.retryContentJob("job_failed_2")).resolves.toEqual(
      expect.objectContaining({
        id: "job_failed_2",
        status: "queued",
      }),
    );
  });

  it("updates a failed job body and schedule", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_edit_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "古い本文",
          status: ContentStatus.FAILED,
          scheduledAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_edit_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "新しい本文",
          status: ContentStatus.FAILED,
          scheduledAt: new Date("2026-03-20T01:00:00.000Z"),
          lastError: null,
        }),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(
      service.updateContentJob("job_edit_1", {
        body: "新しい本文",
        scheduledAt: "2026-03-20T01:00:00.000Z",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "job_edit_1",
        body: "新しい本文",
      }),
    );
  });

  it("dispatches queued and due scheduled jobs", async () => {
    const prisma = {
      contentJob: {
        findMany: vi.fn().mockResolvedValue([
          { id: "job_queue_1", status: ContentStatus.QUEUED },
          { id: "job_schedule_1", status: ContentStatus.SCHEDULED },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ retryCount: 0 }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );
    vi.spyOn(service, "sendContentJob")
      .mockResolvedValueOnce({
        job: {} as never,
        sentPostId: "post_1",
      })
      .mockResolvedValueOnce({
        job: {} as never,
        sentPostId: "post_2",
      });

    await expect(service.dispatchDueContentJobs()).resolves.toEqual([
      "job_queue_1",
      "job_schedule_1",
    ]);
  });

  it("returns operations overview", async () => {
    const prisma = {
      contentJob: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "job_processing_stuck",
              workspaceId: "ws_seed_oku",
              xAccountId: "acc_seed_oku",
              kind: ContentKind.POST,
              body: "処理中",
              status: ContentStatus.PROCESSING,
              scheduledAt: null,
              processingStartedAt: new Date("2026-03-19T00:00:00.000Z"),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "job_failed_recent",
              workspaceId: "ws_seed_oku",
              xAccountId: "acc_seed_oku",
              kind: ContentKind.REPLY,
              body: "失敗",
              status: ContentStatus.FAILED,
              scheduledAt: null,
            },
          ]),
        count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
      },
      xSyncState: {
        findFirst: vi.fn().mockResolvedValue({
          xAccountId: "acc_seed_oku",
          lastMentionId: "2001",
          nextPaginationToken: null,
          rateLimitedUntil: null,
          lastSyncedAt: new Date("2026-03-19T00:10:00.000Z"),
        }),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(service.getOperationsOverview()).resolves.toEqual(
      expect.objectContaining({
        queueDepth: 3,
        awaitingApprovalCount: 2,
      }),
    );
  });

  it("unlocks a stuck processing job", async () => {
    const prisma = {
      contentJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: "job_unlock_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "処理中のジョブ",
          status: ContentStatus.PROCESSING,
          scheduledAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "job_unlock_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          kind: ContentKind.POST,
          body: "処理中のジョブ",
          status: ContentStatus.QUEUED,
          scheduledAt: null,
          lastError: "manually unlocked",
        }),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(service.unlockStuckJob("job_unlock_1")).resolves.toEqual(
      expect.objectContaining({
        id: "job_unlock_1",
        status: "queued",
      }),
    );
  });

  it("creates a fixed reply job when phrase, like and repost conditions match", async () => {
    const prisma = {
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
          workspaceId: "ws_seed_oku",
          xUserId: "x-user-1",
          accessToken: "access-token",
        }),
      },
      xSyncState: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
      },
      mention: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
        findUnique: vi.fn().mockResolvedValue({
          id: "mention_fixed_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          externalMentionId: "mention_external_1",
          authorXUserId: "user_123",
          authorHandle: "customer1",
          body: "参加希望です。よろしくお願いします",
          referencedPostId: "fixed_post_1",
          status: MentionStatus.NEW,
          mentionedAt: new Date("2026-03-19T00:00:00.000Z"),
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      fixedReplyRule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "rule_1",
            xAccountId: "acc_seed_oku",
            fixedPostId: "fixed_post_1",
            fixedPostText: "この投稿に参加希望と返信してください",
            triggerPhrase: "参加希望",
            requireLike: true,
            requireRetweet: true,
            replyTemplate: "確認しました {{author_id}}",
            includeAuthorId: true,
            includeAuthorHandle: true,
            isActive: true,
            updatedAt: new Date("2026-03-19T00:00:00.000Z"),
          },
        ]),
      },
      contentJob: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(undefined),
      },
      automationPolicy: {
        findFirst: vi.fn().mockResolvedValue({
          approvalMode: ApprovalMode.MANUAL,
          autoReplyEnabled: true,
          autoReplyPaused: false,
          autoReplyCooldownUntil: null,
          maxAutoRepliesPerHour: 20,
          maxAutoRepliesPerDay: 100,
          maxConsecutiveAutoReplies: 10,
          spikeLimit10Minutes: 15,
        }),
      },
    };
    const fixedReplyXApiService = {
      getMentions: vi.fn().mockResolvedValue({
        data: [
          {
            id: "mention_external_1",
            text: "参加希望です。よろしくお願いします",
            author_id: "user_123",
            created_at: "2026-03-19T00:00:00.000Z",
            referenced_tweets: [{ id: "fixed_post_1", type: "replied_to" }],
          },
        ],
        includes: {
          users: [{ id: "user_123", username: "customer1" }],
        },
      }),
      getLikingUsers: vi.fn().mockResolvedValue({
        data: [{ id: "user_123", username: "customer1" }],
      }),
      getRetweetedBy: vi.fn().mockResolvedValue({
        data: [{ id: "user_123", username: "customer1" }],
      }),
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      fixedReplyXApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await service.syncMentions();

    expect(prisma.contentJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: ContentKind.REPLY,
        inReplyToPostId: "mention_external_1",
        status: ContentStatus.AWAITING_APPROVAL,
        sourcePrompt: "fixed-reply-rule:rule_1",
        body: "@customer1 確認しました user_123",
      }),
    });
  });

  it("toggles a fixed reply rule", async () => {
    const prisma = {
      fixedReplyRule: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rule_toggle_1",
          xAccountId: "acc_seed_oku",
          fixedPostId: "fixed_post_1",
          fixedPostText: "固定投稿",
          triggerPhrase: null,
          requireLike: false,
          requireRetweet: false,
          requireFollow: false,
          activeFrom: null,
          activeTo: null,
          maxRepliesPerAuthorPerDay: 1,
          excludedUserIds: [],
          replyTemplate: "ありがとうございます",
          priority: 0,
          includeAuthorId: false,
          includeAuthorHandle: true,
          isActive: true,
        }),
        update: vi.fn().mockResolvedValue({
          id: "rule_toggle_1",
          xAccountId: "acc_seed_oku",
          fixedPostId: "fixed_post_1",
          fixedPostText: "固定投稿",
          triggerPhrase: null,
          requireLike: false,
          requireRetweet: false,
          requireFollow: false,
          activeFrom: null,
          activeTo: null,
          maxRepliesPerAuthorPerDay: 1,
          excludedUserIds: [],
          replyTemplate: "ありがとうございます",
          priority: 0,
          includeAuthorId: false,
          includeAuthorHandle: true,
          isActive: false,
        }),
      },
    };

    const service = new AutomationService(
      prisma as never,
      aiService as never,
      xApiService as never,
      authService as never,
      notificationsService as never,
      auditService as never,
      contentSafetyService as never,
    );

    await expect(service.toggleFixedReplyRule("rule_toggle_1")).resolves.toEqual(
      expect.objectContaining({
        id: "rule_toggle_1",
        isActive: false,
      }),
    );
  });
});
