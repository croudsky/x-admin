import {
  PrismaClient,
  ApprovalMode,
  ContentKind,
  ContentStatus,
  PromptTemplateKind,
  UserRole,
  WorkspacePlanTier,
  XAccountStatus,
} from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const defaultPasswordHash = createHash("sha256").update("oku-demo-password").digest("hex");
  const workspace = await prisma.workspace.upsert({
    where: { id: "ws_seed_oku" },
    update: {
      name: "Oku Personal Workspace",
    },
    create: {
      id: "ws_seed_oku",
      name: "Oku Personal Workspace",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@oku.local" },
    update: {
      displayName: "Oku Owner",
      workspaceId: workspace.id,
      role: UserRole.OWNER,
      passwordHash: defaultPasswordHash,
    },
    create: {
      email: "owner@oku.local",
      displayName: "Oku Owner",
      workspaceId: workspace.id,
      role: UserRole.OWNER,
      passwordHash: defaultPasswordHash,
    },
  });

  const account = await prisma.xAccount.upsert({
    where: { handle: "@oku_ai" },
    update: {
      workspaceId: workspace.id,
      displayName: "Oku Labs",
      status: XAccountStatus.CONNECTED,
      xUserId: "oku-demo-account",
    },
    create: {
      workspaceId: workspace.id,
      handle: "@oku_ai",
      displayName: "Oku Labs",
      status: XAccountStatus.CONNECTED,
      xUserId: "oku-demo-account",
    },
  });

  await prisma.automationPolicy.upsert({
    where: { id: "policy_seed_oku" },
    update: {
      workspaceId: workspace.id,
      xAccountId: account.id,
      approvalMode: ApprovalMode.MANUAL,
      autoPostEnabled: false,
      autoReplyEnabled: true,
    },
    create: {
      id: "policy_seed_oku",
      workspaceId: workspace.id,
      xAccountId: account.id,
      approvalMode: ApprovalMode.MANUAL,
      autoPostEnabled: false,
      autoReplyEnabled: true,
    },
  });

  const billingPeriodStart = new Date("2026-03-01T00:00:00.000Z");
  const billingPeriodEnd = new Date("2026-03-31T23:59:59.999Z");
  await prisma.workspaceBilling.upsert({
    where: { workspaceId: workspace.id },
    update: {
      planTier: WorkspacePlanTier.FREE,
      isBillingActive: true,
      monthlyPriceJpy: 0,
      maxXAccounts: 1,
      maxMonthlyContentJobs: 100,
      maxMonthlyAiGenerations: 120,
      maxMonthlyMentionSyncs: 200,
      currentPeriodStart: billingPeriodStart,
      currentPeriodEnd: billingPeriodEnd,
    },
    create: {
      workspaceId: workspace.id,
      planTier: WorkspacePlanTier.FREE,
      isBillingActive: true,
      monthlyPriceJpy: 0,
      maxXAccounts: 1,
      maxMonthlyContentJobs: 100,
      maxMonthlyAiGenerations: 120,
      maxMonthlyMentionSyncs: 200,
      currentPeriodStart: billingPeriodStart,
      currentPeriodEnd: billingPeriodEnd,
    },
  });

  await prisma.promptTemplate.upsert({
    where: {
      workspaceId_kind: {
        workspaceId: workspace.id,
        kind: PromptTemplateKind.BASE,
      },
    },
    update: {
      title: "Base Prompt",
      content: "あなたはX運用担当です。日本語で、端的で信頼感のある文章を書いてください。",
      isActive: true,
    },
    create: {
      workspaceId: workspace.id,
      kind: PromptTemplateKind.BASE,
      title: "Base Prompt",
      content: "あなたはX運用担当です。日本語で、端的で信頼感のある文章を書いてください。",
      isActive: true,
    },
  });

  await prisma.promptTemplate.upsert({
    where: {
      workspaceId_kind: {
        workspaceId: workspace.id,
        kind: PromptTemplateKind.TASK_POST,
      },
    },
    update: {
      title: "Post Task Prompt",
      content: "テーマ、トーン、目的に沿って1投稿分の文面を作成し、最後に自然なCTAを1つだけ入れてください。",
      isActive: true,
    },
    create: {
      workspaceId: workspace.id,
      kind: PromptTemplateKind.TASK_POST,
      title: "Post Task Prompt",
      content: "テーマ、トーン、目的に沿って1投稿分の文面を作成し、最後に自然なCTAを1つだけ入れてください。",
      isActive: true,
    },
  });

  await prisma.promptTemplate.upsert({
    where: {
      workspaceId_kind: {
        workspaceId: workspace.id,
        kind: PromptTemplateKind.TASK_REPLY,
      },
    },
    update: {
      title: "Reply Task Prompt",
      content: "相手に配慮しつつ、短く自然な返信文を作成し、会話が前に進む一文で締めてください。",
      isActive: true,
    },
    create: {
      workspaceId: workspace.id,
      kind: PromptTemplateKind.TASK_REPLY,
      title: "Reply Task Prompt",
      content: "相手に配慮しつつ、短く自然な返信文を作成し、会話が前に進む一文で締めてください。",
      isActive: true,
    },
  });

  await prisma.promptTemplate.upsert({
    where: {
      workspaceId_kind: {
        workspaceId: workspace.id,
        kind: PromptTemplateKind.SAFETY,
      },
    },
    update: {
      title: "Safety Prompt",
      content: "280文字以内。絵文字は使わない。不要なハッシュタグは付けない。抽象表現を避ける。",
      isActive: true,
    },
    create: {
      workspaceId: workspace.id,
      kind: PromptTemplateKind.SAFETY,
      title: "Safety Prompt",
      content: "280文字以内。絵文字は使わない。不要なハッシュタグは付けない。抽象表現を避ける。",
      isActive: true,
    },
  });

  const existingJobs = await prisma.contentJob.count({
    where: { workspaceId: workspace.id },
  });

  if (existingJobs === 0) {
    await prisma.contentJob.createMany({
      data: [
        {
          workspaceId: workspace.id,
          xAccountId: account.id,
          kind: ContentKind.POST,
          status: ContentStatus.AWAITING_APPROVAL,
          body: "来週のプロダクト改善内容をまとめたスレッドを18:00に投稿予定。",
          scheduledAt: new Date("2026-03-19T09:00:00.000Z"),
        },
        {
          workspaceId: workspace.id,
          xAccountId: account.id,
          kind: ContentKind.REPLY,
          status: ContentStatus.QUEUED,
          body: "ありがとうございます。近日中に詳細を公開します。",
        },
      ],
    });
  }

  await prisma.analyticsSnapshot.createMany({
    data: [
      {
        workspaceId: workspace.id,
        xAccountId: account.id,
        snapshotDate: new Date("2026-03-17T00:00:00.000Z"),
        impressions: 14200,
        engagements: 690,
        followersCount: 1240,
        followersDelta: 38,
      },
      {
        workspaceId: workspace.id,
        xAccountId: account.id,
        snapshotDate: new Date("2026-03-18T00:00:00.000Z"),
        impressions: 16840,
        engagements: 744,
        followersCount: 1286,
        followersDelta: 46,
      },
    ],
    skipDuplicates: true,
  });

  console.log(
    JSON.stringify({
      workspaceId: workspace.id,
      userId: user.id,
      xAccountId: account.id,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
