import { ApprovalMode, ContentStatus, AIProvider as PrismaAIProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AIService } from "./ai.service";

describe("AIService", () => {
  const encryptionService = {
    encrypt: vi.fn((value: string) => `enc:${value}`),
    decrypt: vi.fn((value: string) => value.replace(/^enc:/, "")),
  };
  const contentSafetyService = {
    validate: vi.fn().mockReturnValue({ safe: true, reasons: [] }),
  };
  const billingService = {
    assertWithinLimit: vi.fn().mockResolvedValue(undefined),
    recordAIGeneration: vi.fn().mockResolvedValue(undefined),
    recordContentJobCreated: vi.fn().mockResolvedValue(undefined),
  };

  it("saves an AI provider setting and masks the API key", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      aIProviderSetting: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({
          provider: PrismaAIProvider.OPENAI,
          model: "gpt-4.1-mini",
          systemPrompt: "Write crisply",
          isActive: true,
          apiKey: "enc:sk-test-secret",
        }),
      },
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      contentSafetyService as never,
      billingService as never,
    );
    await expect(
      service.saveSetting({
        provider: "openai",
        apiKey: "sk-test-secret",
        model: "gpt-4.1-mini",
        systemPrompt: "Write crisply",
        isActive: true,
      }),
    ).resolves.toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
      systemPrompt: "Write crisply",
      isActive: true,
      hasApiKey: true,
      maskedApiKey: "sk-t...cret",
    });

    expect(encryptionService.encrypt).toHaveBeenCalledWith("sk-test-secret");
  });

  it("generates a post draft and creates a content job", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      automationPolicy: {
        findFirst: vi.fn().mockResolvedValue({
          approvalMode: ApprovalMode.MANUAL,
        }),
      },
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
        }),
      },
      aIProviderSetting: {
        findFirst: vi.fn().mockResolvedValue({
          provider: PrismaAIProvider.OPENAI,
          apiKey: "enc:sk-test-secret",
          model: "gpt-4.1-mini",
          systemPrompt: "Write crisply",
        }),
      },
      promptTemplate: {
        findMany: vi.fn().mockResolvedValue([
          {
            kind: "BASE",
            title: "Base Prompt",
            content: "You are an X operator.",
          },
          {
            kind: "TASK_POST",
            title: "Task Post Prompt",
            content: "Write one concise post.",
          },
          {
            kind: "SAFETY",
            title: "Safety Prompt",
            content: "No emoji.",
          },
        ]),
      },
      learningProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      contentJob: {
        create: vi.fn().mockResolvedValue({
          id: "job_generated_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          body: "AI generated post",
          status: ContentStatus.AWAITING_APPROVAL,
          scheduledAt: null,
        }),
      },
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      contentSafetyService as never,
      billingService as never,
    );
    vi.spyOn(service as never, "generateText").mockResolvedValue("AI generated post");

    await expect(
      service.generatePostDraft({
        topic: "新機能公開",
        tone: "簡潔",
        goal: "登録を促す",
        scheduledAt: null,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4.1-mini",
        job: expect.objectContaining({
          id: "job_generated_1",
          body: "AI generated post",
          status: "awaiting_approval",
        }),
      }),
    );
  });

  it("saves a prompt template", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      promptTemplate: {
        upsert: vi.fn().mockResolvedValue({
          id: "tmpl_1",
          kind: "BASE",
          title: "Base Prompt",
          content: "You are an X operator.",
          isActive: true,
          updatedAt: new Date("2026-03-19T00:00:00.000Z"),
        }),
      },
      learningProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      contentSafetyService as never,
    );
    await expect(
      service.savePromptTemplate({
        kind: "base",
        title: "Base Prompt",
        content: "You are an X operator.",
        isActive: true,
      }),
    ).resolves.toEqual({
      id: "tmpl_1",
      kind: "base",
      title: "Base Prompt",
      content: "You are an X operator.",
      isActive: true,
      updatedAt: "2026-03-19T00:00:00.000Z",
    });
  });

  it("builds a prompt preview for reply generation", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      promptTemplate: {
        findMany: vi.fn().mockResolvedValue([
          {
            kind: "BASE",
            title: "Base Prompt",
            content: "You are an X operator.",
          },
          {
            kind: "TASK_REPLY",
            title: "Reply Task Prompt",
            content: "Write a short reply.",
          },
          {
            kind: "SAFETY",
            title: "Safety Prompt",
            content: "No emoji.",
          },
        ]),
      },
      learningProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      contentSafetyService as never,
    );
    await expect(
      service.getPromptPreview({
        kind: "reply",
        topic: "質問への返答",
        tone: "丁寧",
        goal: "会話を前に進める",
      }),
    ).resolves.toEqual({
      prompt: expect.stringContaining("# Task\nWrite a short reply."),
      variables: [
        { label: "テーマ", value: "質問への返答" },
        { label: "トーン", value: "丁寧" },
        { label: "目的", value: "会話を前に進める" },
      ],
    });
  });

  it("generates a reply draft and creates a reply content job", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      automationPolicy: {
        findFirst: vi.fn().mockResolvedValue({
          approvalMode: ApprovalMode.MANUAL,
        }),
      },
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
        }),
      },
      aIProviderSetting: {
        findFirst: vi.fn().mockResolvedValue({
          provider: PrismaAIProvider.OPENAI,
          apiKey: "enc:sk-test-secret",
          model: "gpt-4.1-mini",
          systemPrompt: "Write crisply",
        }),
      },
      promptTemplate: {
        findMany: vi.fn().mockResolvedValue([
          {
            kind: "BASE",
            title: "Base Prompt",
            content: "You are an X operator.",
          },
          {
            kind: "TASK_REPLY",
            title: "Reply Task Prompt",
            content: "Write a short reply.",
          },
          {
            kind: "SAFETY",
            title: "Safety Prompt",
            content: "No emoji.",
          },
        ]),
      },
      learningProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      contentJob: {
        create: vi.fn().mockResolvedValue({
          id: "job_reply_1",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          body: "丁寧な返信をありがとうございます。詳細は本日中に共有します。",
          status: ContentStatus.AWAITING_APPROVAL,
          scheduledAt: null,
        }),
      },
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      contentSafetyService as never,
    );
    vi.spyOn(service as never, "generateText").mockResolvedValue("丁寧な返信をありがとうございます。詳細は本日中に共有します。");

    await expect(
      service.generateReplyDraft({
        sourceText: "料金プランについて詳しく知りたいです。",
        tone: "丁寧",
        goal: "詳細案内につなげる",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        provider: "openai",
        job: expect.objectContaining({
          id: "job_reply_1",
          kind: "reply",
          status: "awaiting_approval",
        }),
      }),
    );
  });

  it("forces generated reply back to approval when safety check fails", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      automationPolicy: {
        findFirst: vi.fn().mockResolvedValue({
          approvalMode: ApprovalMode.AUTO,
        }),
      },
      xAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
        }),
      },
      aIProviderSetting: {
        findFirst: vi.fn().mockResolvedValue({
          provider: PrismaAIProvider.OPENAI,
          apiKey: "enc:sk-test-secret",
          model: "gpt-4.1-mini",
          systemPrompt: "Write crisply",
        }),
      },
      promptTemplate: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      learningProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      contentJob: {
        create: vi.fn().mockResolvedValue({
          id: "job_reply_flagged",
          workspaceId: "ws_seed_oku",
          xAccountId: "acc_seed_oku",
          body: "絶対儲かるので今すぐ参加してください",
          status: ContentStatus.AWAITING_APPROVAL,
          scheduledAt: null,
        }),
      },
    };
    const localSafetyService = {
      validate: vi.fn().mockReturnValue({
        safe: false,
        reasons: ["禁止表現を含んでいます: 絶対儲かる"],
      }),
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      localSafetyService as never,
    );
    vi.spyOn(service as never, "generateText").mockResolvedValue("絶対儲かるので今すぐ参加してください");

    await expect(
      service.generateReplyDraft({
        sourceText: "おすすめはありますか？",
        tone: "丁寧",
        goal: "相談に乗る",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          id: "job_reply_flagged",
          status: "awaiting_approval",
        }),
      }),
    );
  });

  it("injects learning profile into prompt preview", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      promptTemplate: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      learningProfile: {
        findUnique: vi.fn().mockResolvedValue({
          summary: "@oku_ai の推奨平均文字数は 80 字前後",
          patterns: ["質問投稿を増やす", "CTA を明示する"],
        }),
      },
    };

    const service = new AIService(
      prisma as never,
      encryptionService as never,
      contentSafetyService as never,
    );

    await expect(
      service.getPromptPreview({
        xAccountId: "acc_seed_oku",
        kind: "post",
        topic: "新機能",
        tone: "簡潔",
        goal: "登録促進",
      }),
    ).resolves.toEqual({
      prompt: expect.stringContaining("# Learning Profile"),
      variables: [
        { label: "テーマ", value: "新機能" },
        { label: "トーン", value: "簡潔" },
        { label: "目的", value: "登録促進" },
      ],
    });
  });
});
