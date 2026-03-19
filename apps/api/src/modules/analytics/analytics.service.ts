import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AnalysisReportRecord,
  AnalyticsCollectResult,
  AnalyticsSnapshot,
  LearningProfileSummary,
  PostPerformanceRecord,
  TimelineAnalysisResult,
  TimelineAnalysisTopPost,
} from "@oku/shared/index";
import { Prisma } from "@prisma/client";
import { ContentKind, ContentStatus, XAccountStatus } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../database/prisma.service";
import { XApiService } from "../automation/x-api.service";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xApiService: XApiService,
    private readonly authService: AuthService,
  ) {}

  async listSnapshots(xAccountId?: string, workspaceId?: string): Promise<AnalyticsSnapshot[]> {
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(xAccountId ? { xAccountId } : {}),
      },
      orderBy: { snapshotDate: "desc" },
      take: 7,
    });

    return [...snapshots].reverse().map((snapshot) => ({
      xAccountId: snapshot.xAccountId,
      date: snapshot.snapshotDate.toISOString().slice(0, 10),
      impressions: snapshot.impressions,
      engagements: snapshot.engagements,
      followersCount: snapshot.followersCount,
      followersDelta: snapshot.followersDelta,
    }));
  }

  async collectSnapshots(xAccountId?: string, workspaceId?: string): Promise<AnalyticsCollectResult> {
    const accounts = await this.prisma.xAccount.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(xAccountId ? { id: xAccountId } : {}),
        status: XAccountStatus.CONNECTED,
        xUserId: { not: null },
        accessToken: { not: null },
      },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      return {
        collected: 0,
        snapshots: await this.listSnapshots(xAccountId, workspaceId),
      };
    }

    let collected = 0;

    for (const account of accounts) {
      if (!account.xUserId || !account.accessToken) {
        continue;
      }

      const accessToken = await this.authService.ensureActiveAccessToken(account.id);

      const [user, latestSnapshot] = await Promise.all([
        this.xApiService.getUserById({
          accessToken,
          xUserId: account.xUserId,
        }),
        this.prisma.analyticsSnapshot.findFirst({
          where: { xAccountId: account.id },
          orderBy: { snapshotDate: "desc" },
        }),
      ]);

      const followersCount = user.data?.public_metrics?.followers_count ?? 0;
      const followersDelta = latestSnapshot
        ? followersCount - latestSnapshot.followersCount
        : 0;

      const snapshotDate = this.startOfDay(new Date());
      const publishedJobs = await this.prisma.contentJob.findMany({
        where: {
          xAccountId: account.id,
          status: ContentStatus.PUBLISHED,
          externalPostId: { not: null },
          publishedAt: {
            gte: snapshotDate,
            lt: new Date(snapshotDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        select: {
          externalPostId: true,
        },
      });

      const postIds = publishedJobs
        .map((job) => job.externalPostId)
        .filter((id): id is string => Boolean(id));
      const metricsFromX = await this.fetchPostMetrics(accessToken, postIds);

      await this.prisma.analyticsSnapshot.upsert({
        where: {
          xAccountId_snapshotDate: {
            xAccountId: account.id,
            snapshotDate,
          },
        },
        update: {
          impressions: metricsFromX.impressions,
          engagements: metricsFromX.engagements,
          followersCount,
          followersDelta,
        },
        create: {
          workspaceId: account.workspaceId,
          xAccountId: account.id,
          snapshotDate,
          impressions: metricsFromX.impressions,
          engagements: metricsFromX.engagements,
          followersCount,
          followersDelta,
        },
      });

      collected += 1;
    }

    return {
      collected,
      snapshots: await this.listSnapshots(xAccountId, workspaceId),
    };
  }

  async learnFromOwnHistory(xAccountId?: string, workspaceId?: string): Promise<TimelineAnalysisResult> {
    const account = await this.resolveAccount(xAccountId, workspaceId);

    if (!account?.xUserId) {
      throw new BadRequestException("Connected X account is required");
    }

    const accessToken = await this.authService.ensureActiveAccessToken(account.id);
    const posts = await this.xApiService.getUserPosts({
      accessToken,
      xUserId: account.xUserId,
      maxResults: 30,
    });

    const result = this.analyzeTimeline({
      source: "own",
      label: account.displayName,
      handle: account.handle,
      posts: posts.data ?? [],
    });
    await this.persistAnalysisReport({
      workspaceId: account.workspaceId,
      xAccountId: account.id,
      result,
    });
    await this.upsertLearningProfile({
      workspaceId: account.workspaceId,
      xAccountId: account.id,
      result,
    });
    return result;
  }

  async analyzeCompetitor(handle: string, xAccountId?: string, workspaceId?: string): Promise<TimelineAnalysisResult> {
    const account = await this.resolveAccount(xAccountId, workspaceId);

    if (!account) {
      throw new BadRequestException("Connected X account is required");
    }

    const accessToken = await this.authService.ensureActiveAccessToken(account.id);
    const target = await this.xApiService.getUserByUsername({
      accessToken,
      username: handle,
    });

    if (!target.data?.id) {
      throw new BadRequestException("Competitor account not found");
    }

    const posts = await this.xApiService.getUserPosts({
      accessToken,
      xUserId: target.data.id,
      maxResults: 30,
    });

    const result = this.analyzeTimeline({
      source: "competitor",
      label: target.data.name ?? target.data.username ?? handle,
      handle: `@${target.data.username ?? handle.replace(/^@/, "")}`,
      posts: posts.data ?? [],
    });
    await this.persistAnalysisReport({
      workspaceId: account.workspaceId,
      xAccountId: account.id,
      result,
    });
    return result;
  }

  async listAnalysisReports(xAccountId?: string, workspaceId?: string): Promise<AnalysisReportRecord[]> {
    const reports = await this.prisma.analysisReport.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(xAccountId ? { xAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return reports.map((report) => ({
      id: report.id,
      source: report.source as "own" | "competitor",
      label: report.label,
      handle: report.handle,
      createdAt: report.createdAt.toISOString(),
      report: report.report as unknown as TimelineAnalysisResult,
    }));
  }

  async getLearningProfile(xAccountId: string, workspaceId?: string): Promise<LearningProfileSummary | null> {
    const profile = await this.prisma.learningProfile.findFirst({
      where: {
        xAccountId,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    if (!profile) {
      return null;
    }

    return {
      xAccountId: profile.xAccountId,
      summary: profile.summary,
      patterns: ((profile.patterns as string[] | null) ?? []),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async listPostPerformance(xAccountId?: string, workspaceId?: string): Promise<PostPerformanceRecord[]> {
    const account = await this.resolveAccount(xAccountId, workspaceId);

    if (!account?.xUserId) {
      return [];
    }

    const jobs = await this.prisma.contentJob.findMany({
      where: {
        xAccountId: account.id,
        status: ContentStatus.PUBLISHED,
        externalPostId: { not: null },
      },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });

    const accessToken = await this.authService.ensureActiveAccessToken(account.id);
    const metrics = await this.xApiService.getPostsByIds({
      accessToken,
      ids: jobs.map((job) => job.externalPostId).filter((id): id is string => Boolean(id)),
    });

    const metricMap = new Map((metrics.data ?? []).map((item) => [item.id, item.public_metrics]));

    return jobs
      .filter((job): job is typeof job & { externalPostId: string } => Boolean(job.externalPostId))
      .map((job) => {
        const metric = metricMap.get(job.externalPostId);
        const likeCount = metric?.like_count ?? 0;
        const replyCount = metric?.reply_count ?? 0;
        const repostCount = metric?.repost_count ?? 0;
        const quoteCount = metric?.quote_count ?? 0;
        const bookmarkCount = metric?.bookmark_count ?? 0;
        const impressions = metric?.impression_count ?? 0;
        const engagements = likeCount + replyCount + repostCount + quoteCount + bookmarkCount;

        return {
          contentJobId: job.id,
          xAccountId: job.xAccountId,
          externalPostId: job.externalPostId,
          kind: job.kind === ContentKind.POST ? "post" : "reply",
          body: job.body,
          sourcePrompt: job.sourcePrompt ?? null,
          publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
          impressions,
          engagements,
          likeCount,
          replyCount,
          repostCount,
          quoteCount,
          bookmarkCount,
          score: likeCount + replyCount * 2 + repostCount * 3 + quoteCount * 2,
        } satisfies PostPerformanceRecord;
      });
  }

  private async fetchPostMetrics(accessToken: string, ids: string[]) {
    if (ids.length === 0) {
      return {
        impressions: 0,
        engagements: 0,
      };
    }

    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 100) {
      chunks.push(ids.slice(index, index + 100));
    }

    let impressions = 0;
    let engagements = 0;

    for (const chunk of chunks) {
      const posts = await this.xApiService.getPostsByIds({
        accessToken,
        ids: chunk,
      });

      for (const post of posts.data ?? []) {
        const publicMetrics = post.public_metrics;
        impressions += publicMetrics?.impression_count ?? 0;
        engagements +=
          (publicMetrics?.like_count ?? 0) +
          (publicMetrics?.reply_count ?? 0) +
          (publicMetrics?.repost_count ?? 0) +
          (publicMetrics?.quote_count ?? 0) +
          (publicMetrics?.bookmark_count ?? 0);
      }
    }

    return {
      impressions,
      engagements,
    };
  }

  private startOfDay(value: Date) {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException("Invalid analytics snapshot date");
    }

    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private async resolveAccount(xAccountId?: string, workspaceId?: string) {
    return xAccountId
      ? this.prisma.xAccount.findFirst({
          where: {
            id: xAccountId,
            ...(workspaceId ? { workspaceId } : {}),
          },
        })
      : this.prisma.xAccount.findFirst({
          where: {
            ...(workspaceId ? { workspaceId } : {}),
            status: XAccountStatus.CONNECTED,
          },
          orderBy: { createdAt: "asc" },
        });
  }

  private analyzeTimeline(params: {
    source: "own" | "competitor";
    label: string;
    handle: string;
    posts: Array<{
      id: string;
      text: string;
      created_at?: string;
      public_metrics?: {
        like_count?: number;
        reply_count?: number;
        repost_count?: number;
        quote_count?: number;
      };
    }>;
  }): TimelineAnalysisResult {
    const posts = params.posts;
    const totalPosts = posts.length;

    if (totalPosts === 0) {
      return {
        source: params.source,
        label: params.label,
        handle: params.handle,
        totalPosts: 0,
        averageLength: 0,
        averageEngagement: 0,
        questionPostRatio: 0,
        ctaPostRatio: 0,
        hashtagPostRatio: 0,
        topPosts: [],
        recommendations: ["分析対象の投稿がまだありません。"],
      };
    }

    const totalLength = posts.reduce((sum, post) => sum + [...post.text].length, 0);
    const totalEngagement = posts.reduce((sum, post) => sum + this.scorePost(post), 0);
    const questionPosts = posts.filter((post) => /[?？]/.test(post.text)).length;
    const ctaPosts = posts.filter((post) => /(詳しく|チェック|登録|確認|ぜひ|見てください|はこちら)/.test(post.text)).length;
    const hashtagPosts = posts.filter((post) => /#\S+/.test(post.text)).length;

    const topPosts: TimelineAnalysisTopPost[] = [...posts]
      .sort((left, right) => this.scorePost(right) - this.scorePost(left))
      .slice(0, 5)
      .map((post) => ({
        id: post.id,
        text: post.text,
        createdAt: post.created_at ?? null,
        likeCount: post.public_metrics?.like_count ?? 0,
        replyCount: post.public_metrics?.reply_count ?? 0,
        repostCount: post.public_metrics?.repost_count ?? 0,
        quoteCount: post.public_metrics?.quote_count ?? 0,
        score: this.scorePost(post),
      }));

    return {
      source: params.source,
      label: params.label,
      handle: params.handle,
      totalPosts,
      averageLength: Math.round(totalLength / totalPosts),
      averageEngagement: Math.round(totalEngagement / totalPosts),
      questionPostRatio: this.toRatio(questionPosts, totalPosts),
      ctaPostRatio: this.toRatio(ctaPosts, totalPosts),
      hashtagPostRatio: this.toRatio(hashtagPosts, totalPosts),
      topPosts,
      recommendations: this.buildRecommendations({
        averageLength: Math.round(totalLength / totalPosts),
        questionPostRatio: this.toRatio(questionPosts, totalPosts),
        ctaPostRatio: this.toRatio(ctaPosts, totalPosts),
        hashtagPostRatio: this.toRatio(hashtagPosts, totalPosts),
        averageEngagement: Math.round(totalEngagement / totalPosts),
      }),
    };
  }

  private scorePost(post: {
    public_metrics?: {
      like_count?: number;
      reply_count?: number;
      repost_count?: number;
      quote_count?: number;
    };
  }) {
    return (
      (post.public_metrics?.like_count ?? 0) +
      (post.public_metrics?.reply_count ?? 0) * 2 +
      (post.public_metrics?.repost_count ?? 0) * 3 +
      (post.public_metrics?.quote_count ?? 0) * 2
    );
  }

  private toRatio(count: number, total: number) {
    return Number((count / total).toFixed(2));
  }

  private buildRecommendations(metrics: {
    averageLength: number;
    questionPostRatio: number;
    ctaPostRatio: number;
    hashtagPostRatio: number;
    averageEngagement: number;
  }) {
    const recommendations: string[] = [];

    if (metrics.averageLength > 120) {
      recommendations.push("長文比率が高めです。要点を先頭2文に圧縮すると反応を比較しやすくなります。");
    } else {
      recommendations.push("短文運用が中心です。背景や具体例を1つ足した投稿も混ぜて差分を取る価値があります。");
    }

    if (metrics.questionPostRatio < 0.2) {
      recommendations.push("質問で終わる投稿が少なめです。会話を増やしたいなら疑問形の投稿を増やしてください。");
    }

    if (metrics.ctaPostRatio < 0.2) {
      recommendations.push("CTA比率が低めです。登録や詳細確認につなげる一文を明示すると転換率を測れます。");
    }

    if (metrics.hashtagPostRatio > 0.4) {
      recommendations.push("ハッシュタグ依存がやや高めです。ハッシュタグなし投稿との反応差を見た方がよいです。");
    }

    if (metrics.averageEngagement > 50) {
      recommendations.push("反応の高い投稿があります。上位投稿の構文と導入文をテンプレート化して再利用してください。");
    }

    return recommendations.slice(0, 4);
  }

  private async persistAnalysisReport(params: {
    workspaceId: string;
    xAccountId: string;
    result: TimelineAnalysisResult;
  }) {
    await this.prisma.analysisReport.create({
      data: {
        workspaceId: params.workspaceId,
        xAccountId: params.xAccountId,
        source: params.result.source,
        label: params.result.label,
        handle: params.result.handle,
        report: params.result as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async upsertLearningProfile(params: {
    workspaceId: string;
    xAccountId: string;
    result: TimelineAnalysisResult;
  }) {
    const summary = [
      `${params.result.handle} の推奨平均文字数は ${params.result.averageLength} 字前後`,
      `質問比率 ${params.result.questionPostRatio}`,
      `CTA比率 ${params.result.ctaPostRatio}`,
    ].join(" / ");

    await this.prisma.learningProfile.upsert({
      where: { xAccountId: params.xAccountId },
      update: {
        summary,
        patterns: params.result.recommendations as unknown as Prisma.InputJsonValue,
      },
      create: {
        workspaceId: params.workspaceId,
        xAccountId: params.xAccountId,
        summary,
        patterns: params.result.recommendations as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
