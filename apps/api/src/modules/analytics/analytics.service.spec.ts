import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  const authService = {
    ensureActiveAccessToken: vi.fn().mockResolvedValue("access-token"),
  };

  it("lists snapshots from the database", async () => {
    const prisma = {
      analyticsSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            xAccountId: "acc_seed_oku",
            snapshotDate: new Date("2026-03-19T00:00:00.000Z"),
            impressions: 1200,
            engagements: 88,
            followersCount: 510,
            followersDelta: 12,
          },
        ]),
      },
    };
    const xApiService = {};

    const service = new AnalyticsService(prisma as never, xApiService as never, authService as never);
    await expect(service.listSnapshots()).resolves.toEqual([
      {
        xAccountId: "acc_seed_oku",
        date: "2026-03-19",
        impressions: 1200,
        engagements: 88,
        followersCount: 510,
        followersDelta: 12,
      },
    ]);
  });

  it("collects daily analytics from X metrics", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T10:00:00.000Z"));

    const prisma = {
      xAccount: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "acc_seed_oku",
            workspaceId: "ws_seed_oku",
            xUserId: "x-user-1",
            accessToken: "access-token",
          },
        ]),
      },
      analyticsSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          followersCount: 500,
        }),
        upsert: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([
          {
            xAccountId: "acc_seed_oku",
            snapshotDate: new Date("2026-03-19T00:00:00.000Z"),
            impressions: 1200,
            engagements: 88,
            followersCount: 512,
            followersDelta: 12,
          },
        ]),
      },
      contentJob: {
        findMany: vi.fn().mockResolvedValue([
          { externalPostId: "post_1" },
          { externalPostId: "post_2" },
        ]),
      },
      analysisReport: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      learningProfile: {
        upsert: vi.fn().mockResolvedValue(undefined),
      },
    };
    const xApiService = {
      getUserById: vi.fn().mockResolvedValue({
        data: {
          id: "x-user-1",
          public_metrics: {
            followers_count: 512,
          },
        },
      }),
      getPostsByIds: vi.fn().mockResolvedValue({
        data: [
          {
            id: "post_1",
            public_metrics: {
              impression_count: 1000,
              like_count: 20,
              reply_count: 10,
              repost_count: 5,
              quote_count: 2,
              bookmark_count: 1,
            },
          },
          {
            id: "post_2",
            public_metrics: {
              impression_count: 200,
              like_count: 30,
              reply_count: 15,
              repost_count: 4,
              quote_count: 1,
              bookmark_count: 0,
            },
          },
        ],
      }),
    };

    const service = new AnalyticsService(prisma as never, xApiService as never, authService as never);

    await expect(service.collectSnapshots()).resolves.toEqual({
      collected: 1,
      snapshots: [
        {
          xAccountId: "acc_seed_oku",
          date: "2026-03-19",
          impressions: 1200,
          engagements: 88,
          followersCount: 512,
          followersDelta: 12,
        },
      ],
    });

    expect(prisma.analyticsSnapshot.upsert).toHaveBeenCalledWith({
      where: {
        xAccountId_snapshotDate: {
          xAccountId: "acc_seed_oku",
          snapshotDate: new Date("2026-03-18T15:00:00.000Z"),
        },
      },
      update: expect.objectContaining({
        impressions: 1200,
        engagements: 88,
        followersCount: 512,
        followersDelta: 12,
      }),
      create: expect.objectContaining({
        workspaceId: "ws_seed_oku",
        xAccountId: "acc_seed_oku",
      }),
    });

    vi.useRealTimers();
  });

  it("learns patterns from own timeline", async () => {
    const prisma = {
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
          workspaceId: "ws_seed_oku",
          handle: "@oku_ai",
          displayName: "Oku Labs",
          xUserId: "x-user-1",
        }),
      },
      analysisReport: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      learningProfile: {
        upsert: vi.fn().mockResolvedValue(undefined),
      },
    };
    const xApiService = {
      getUserPosts: vi.fn().mockResolvedValue({
        data: [
          {
            id: "post_1",
            text: "新機能を公開しました。詳しくはこちら",
            created_at: "2026-03-19T00:00:00.000Z",
            public_metrics: {
              like_count: 10,
              reply_count: 2,
              repost_count: 1,
              quote_count: 0,
            },
          },
          {
            id: "post_2",
            text: "どの機能が一番気になりますか？",
            created_at: "2026-03-18T00:00:00.000Z",
            public_metrics: {
              like_count: 8,
              reply_count: 3,
              repost_count: 0,
              quote_count: 0,
            },
          },
        ],
      }),
    };

    const service = new AnalyticsService(prisma as never, xApiService as never, authService as never);
    await expect(service.learnFromOwnHistory()).resolves.toEqual(
      expect.objectContaining({
        source: "own",
        handle: "@oku_ai",
        totalPosts: 2,
      }),
    );
  });

  it("analyzes competitor timeline", async () => {
    const prisma = {
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
          workspaceId: "ws_seed_oku",
          handle: "@oku_ai",
          displayName: "Oku Labs",
          xUserId: "x-user-1",
        }),
      },
      analysisReport: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
    const xApiService = {
      getUserByUsername: vi.fn().mockResolvedValue({
        data: {
          id: "competitor-1",
          username: "rival_ai",
          name: "Rival AI",
        },
      }),
      getUserPosts: vi.fn().mockResolvedValue({
        data: [
          {
            id: "post_1",
            text: "比較表を公開しました #ai",
            created_at: "2026-03-19T00:00:00.000Z",
            public_metrics: {
              like_count: 30,
              reply_count: 4,
              repost_count: 5,
              quote_count: 1,
            },
          },
        ],
      }),
    };

    const service = new AnalyticsService(prisma as never, xApiService as never, authService as never);
    await expect(service.analyzeCompetitor("@rival_ai")).resolves.toEqual(
      expect.objectContaining({
        source: "competitor",
        handle: "@rival_ai",
        totalPosts: 1,
      }),
    );
  });

  it("lists post performance with X metrics and source prompt", async () => {
    const prisma = {
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
          xUserId: "x-user-1",
        }),
      },
      contentJob: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "job_perf_1",
            xAccountId: "acc_seed_oku",
            kind: "POST",
            body: "新機能を公開しました",
            externalPostId: "post_1",
            sourcePrompt: "task_post",
            publishedAt: new Date("2026-03-19T00:00:00.000Z"),
          },
        ]),
      },
    };
    const xApiService = {
      getPostsByIds: vi.fn().mockResolvedValue({
        data: [
          {
            id: "post_1",
            public_metrics: {
              impression_count: 1000,
              like_count: 20,
              reply_count: 5,
              repost_count: 3,
              quote_count: 1,
              bookmark_count: 2,
            },
          },
        ],
      }),
    };

    const service = new AnalyticsService(prisma as never, xApiService as never, authService as never);
    await expect(service.listPostPerformance()).resolves.toEqual([
      expect.objectContaining({
        contentJobId: "job_perf_1",
        sourcePrompt: "task_post",
        impressions: 1000,
        engagements: 31,
        score: 41,
      }),
    ]);
  });
});
