import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AIProvider,
  AIProviderSettingSummary,
  GenerateReplyDraftInput,
  GeneratePostDraftInput,
  GeneratePostDraftResult,
  PromptPreviewInput,
  PromptPreviewResult,
  PromptTemplateKind,
  PromptTemplateSummary,
  UpsertPromptTemplateInput,
  UpsertAIProviderSettingInput,
} from "@oku/shared/index";
import {
  AIProvider as PrismaAIProvider,
  ApprovalMode,
  ContentKind,
  ContentStatus,
  PromptTemplateKind as PrismaPromptTemplateKind,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { BillingService } from "../billing/billing.service";
import { ContentSafetyService } from "../security/content-safety.service";
import { EncryptionService } from "../security/encryption.service";

@Injectable()
export class AIService {
  private readonly billing: Pick<
    BillingService,
    "assertWithinLimit" | "recordAIGeneration" | "recordContentJobCreated"
  >;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly contentSafetyService: ContentSafetyService,
    billingService?: BillingService,
  ) {
    this.billing = billingService ?? {
      assertWithinLimit: async () => undefined,
      recordAIGeneration: async () => undefined,
      recordContentJobCreated: async () => undefined,
    };
  }

  async listSettings(_xAccountId?: string, workspaceId?: string): Promise<AIProviderSettingSummary[]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const settings = await this.prisma.aIProviderSetting.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });

    return settings.map((setting) => ({
      provider: this.mapProvider(setting.provider),
      model: setting.model,
      systemPrompt: setting.systemPrompt,
      isActive: setting.isActive,
      hasApiKey: Boolean(setting.apiKey),
      maskedApiKey: this.maskApiKey(setting.apiKey),
    }));
  }

  async listPromptTemplates(_xAccountId?: string, workspaceId?: string): Promise<PromptTemplateSummary[]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const templates = await this.prisma.promptTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: "desc" },
    });

    return templates.map((template) => ({
      id: template.id,
      kind: this.mapTemplateKind(template.kind),
      title: template.title,
      content: template.content,
      isActive: template.isActive,
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  async saveSetting(input: UpsertAIProviderSettingInput, workspaceId?: string): Promise<AIProviderSettingSummary> {
    const workspace = await this.requireWorkspace(workspaceId);
    const provider = this.parseProvider(input.provider);
    const apiKey = input.apiKey.trim();
    const model = input.model.trim();

    if (!apiKey) {
      throw new BadRequestException("apiKey is required");
    }

    if (!model) {
      throw new BadRequestException("model is required");
    }

    if (input.isActive) {
      await this.prisma.aIProviderSetting.updateMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    }

    const saved = await this.prisma.aIProviderSetting.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: workspace.id,
          provider,
        },
      },
      update: {
        apiKey: this.encryptionService.encrypt(apiKey),
        model,
        systemPrompt: input.systemPrompt?.trim() || null,
        isActive: input.isActive,
      },
      create: {
        workspaceId: workspace.id,
        provider,
        apiKey: this.encryptionService.encrypt(apiKey),
        model,
        systemPrompt: input.systemPrompt?.trim() || null,
        isActive: input.isActive,
      },
    });

    return {
      provider: this.mapProvider(saved.provider),
      model: saved.model,
      systemPrompt: saved.systemPrompt,
      isActive: saved.isActive,
      hasApiKey: true,
      maskedApiKey: this.maskApiKey(apiKey),
    };
  }

  async savePromptTemplate(input: UpsertPromptTemplateInput, workspaceId?: string): Promise<PromptTemplateSummary> {
    const workspace = await this.requireWorkspace(workspaceId);
    const title = input.title.trim();
    const content = input.content.trim();

    if (!title || !content) {
      throw new BadRequestException("title and content are required");
    }

    const kind = this.parseTemplateKind(input.kind);
    const saved = await this.prisma.promptTemplate.upsert({
      where: {
        workspaceId_kind: {
          workspaceId: workspace.id,
          kind,
        },
      },
      update: {
        title,
        content,
        isActive: input.isActive,
      },
      create: {
        workspaceId: workspace.id,
        kind,
        title,
        content,
        isActive: input.isActive,
      },
    });

    return {
      id: saved.id,
      kind: this.mapTemplateKind(saved.kind),
      title: saved.title,
      content: saved.content,
      isActive: saved.isActive,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getPromptPreview(input: PromptPreviewInput, workspaceId?: string): Promise<PromptPreviewResult> {
    const workspace = await this.requireWorkspace(workspaceId);
    const [templates, learningProfile] = await Promise.all([
      this.prisma.promptTemplate.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
      }),
      input.xAccountId
        ? workspaceId
          ? this.prisma.learningProfile.findFirst({
              where: { xAccountId: input.xAccountId, workspaceId: workspace.id },
            })
          : this.prisma.learningProfile.findUnique({
              where: { xAccountId: input.xAccountId },
            })
        : Promise.resolve(null),
    ]);

    const normalized = {
      topic: input.topic.trim(),
      tone: input.tone.trim(),
      goal: input.goal.trim(),
    };

    return {
      prompt: this.buildPrompt(input.kind, normalized, templates, learningProfile),
      variables: [
        { label: "テーマ", value: normalized.topic },
        { label: "トーン", value: normalized.tone },
        { label: "目的", value: normalized.goal },
      ],
    };
  }

  async generatePostDraft(input: GeneratePostDraftInput, workspaceId?: string): Promise<GeneratePostDraftResult> {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.billing.assertWithinLimit(workspace.id, "ai_generations");
    const topic = input.topic.trim();
    const tone = input.tone.trim();
    const goal = input.goal.trim();

    if (!topic || !tone || !goal) {
      throw new BadRequestException("topic, tone and goal are required");
    }

    const [policy, xAccount, setting, templates] = await Promise.all([
      this.prisma.automationPolicy.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "asc" },
      }),
      input.xAccountId
        ? this.prisma.xAccount.findFirst({
            where: { id: input.xAccountId, workspaceId: workspace.id },
          })
        : this.prisma.xAccount.findFirst({
            where: { workspaceId: workspace.id },
            orderBy: { createdAt: "asc" },
          }),
      this.prisma.aIProviderSetting.findFirst({
        where: { workspaceId: workspace.id, isActive: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.promptTemplate.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
      }),
    ]);

    if (!xAccount) {
      throw new BadRequestException("No X account found");
    }

    if (!setting) {
      throw new BadRequestException("No active AI provider setting found");
    }

    const learningProfile = await this.prisma.learningProfile.findUnique({
      where: { xAccountId: xAccount.id },
    });

    const prompt = this.buildPrompt(
      "post",
      {
        topic,
        tone,
        goal,
      },
      templates,
      learningProfile,
    );
    const generatedBody = await this.generateText({
      provider: setting.provider,
      apiKey: this.encryptionService.decrypt(setting.apiKey),
      model: setting.model,
      systemPrompt: setting.systemPrompt,
      prompt,
    });
    const safety = this.contentSafetyService.validate({
      body: generatedBody,
      kind: "post",
    });

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("scheduledAt must be a valid ISO date");
    }

    const status =
      !safety.safe || policy?.approvalMode === ApprovalMode.MANUAL
        ? ContentStatus.AWAITING_APPROVAL
        : scheduledAt
          ? ContentStatus.SCHEDULED
          : ContentStatus.QUEUED;

    const created = await this.prisma.contentJob.create({
      data: {
        workspaceId: workspace.id,
        xAccountId: xAccount.id,
        kind: ContentKind.POST,
        body: generatedBody,
        sourcePrompt: prompt,
        scheduledAt,
        status,
      },
    });
    await this.billing.recordAIGeneration(workspace.id);
    await this.billing.recordContentJobCreated(workspace.id);

    return {
      provider: this.mapProvider(setting.provider),
      model: setting.model,
      prompt,
      job: {
        id: created.id,
        workspaceId: created.workspaceId,
        xAccountId: created.xAccountId,
        kind: "post",
        body: created.body,
        status: this.mapStatus(created.status),
        scheduledAt: created.scheduledAt ? created.scheduledAt.toISOString() : null,
      },
    };
  }

  async generateReplyDraft(input: GenerateReplyDraftInput, workspaceId?: string): Promise<GeneratePostDraftResult> {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.billing.assertWithinLimit(workspace.id, "ai_generations");
    const sourceText = input.sourceText.trim();
    const tone = input.tone.trim();
    const goal = input.goal.trim();

    if (!sourceText || !tone || !goal) {
      throw new BadRequestException("sourceText, tone and goal are required");
    }

    const [policy, xAccount, setting, templates] = await Promise.all([
      this.prisma.automationPolicy.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "asc" },
      }),
      input.xAccountId
        ? this.prisma.xAccount.findFirst({
            where: { id: input.xAccountId, workspaceId: workspace.id },
          })
        : this.prisma.xAccount.findFirst({
            where: { workspaceId: workspace.id },
            orderBy: { createdAt: "asc" },
          }),
      this.prisma.aIProviderSetting.findFirst({
        where: { workspaceId: workspace.id, isActive: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.promptTemplate.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
      }),
    ]);

    if (!xAccount) {
      throw new BadRequestException("No X account found");
    }

    if (!setting) {
      throw new BadRequestException("No active AI provider setting found");
    }

    const learningProfile = await this.prisma.learningProfile.findUnique({
      where: { xAccountId: xAccount.id },
    });

    const prompt = this.buildPrompt(
      "reply",
      {
        topic: `元メッセージ: ${sourceText}`,
        tone,
        goal,
      },
      templates,
      learningProfile,
    );

    const generatedBody = await this.generateText({
      provider: setting.provider,
      apiKey: this.encryptionService.decrypt(setting.apiKey),
      model: setting.model,
      systemPrompt: setting.systemPrompt,
      prompt,
    });
    const safety = this.contentSafetyService.validate({
      body: generatedBody,
      kind: "reply",
    });

    const status =
      !safety.safe || policy?.approvalMode === ApprovalMode.MANUAL
        ? ContentStatus.AWAITING_APPROVAL
        : ContentStatus.QUEUED;

    const created = await this.prisma.contentJob.create({
      data: {
        workspaceId: workspace.id,
        xAccountId: xAccount.id,
        kind: ContentKind.REPLY,
        body: generatedBody,
        inReplyToPostId: input.inReplyToPostId ?? null,
        sourcePrompt: prompt,
        status,
      },
    });
    await this.billing.recordAIGeneration(workspace.id);
    await this.billing.recordContentJobCreated(workspace.id);

    return {
      provider: this.mapProvider(setting.provider),
      model: setting.model,
      prompt,
      job: {
        id: created.id,
        workspaceId: created.workspaceId,
        xAccountId: created.xAccountId,
        kind: "reply",
        body: created.body,
        status: this.mapStatus(created.status),
        scheduledAt: created.scheduledAt ? created.scheduledAt.toISOString() : null,
      },
    };
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

  private buildPrompt(
    kind: "post" | "reply",
    input: { topic: string; tone: string; goal: string },
    templates: Array<{ kind: PrismaPromptTemplateKind; title: string; content: string }>,
    learningProfile?: { summary: string; patterns: unknown } | null,
  ) {
    const byKind = new Map(templates.map((template) => [template.kind, template]));

    const base =
      byKind.get(PrismaPromptTemplateKind.BASE)?.content ??
      [
        "あなたはX運用担当です。",
        "日本語で1投稿分の下書きを作成してください。",
      ].join("\n");

    const task =
      (kind === "post"
        ? byKind.get(PrismaPromptTemplateKind.TASK_POST)?.content
        : byKind.get(PrismaPromptTemplateKind.TASK_REPLY)?.content) ??
      (kind === "post"
        ? [
            "テーマ、トーン、目的に沿って具体的な1投稿を書いてください。",
            "最後に自然なCTAを1つだけ入れてください。",
          ].join("\n")
        : [
            "相手に配慮しつつ、短く自然な返信文を作成してください。",
            "過剰にへりくだらず、会話を前に進める一文で締めてください。",
          ].join("\n"));

    const safety =
      byKind.get(PrismaPromptTemplateKind.SAFETY)?.content ??
      [
        "280文字以内。",
        "絵文字は使わない。",
        "不要なハッシュタグは付けない。",
        "抽象表現を避ける。",
      ].join("\n");

    return [
      `# Base\n${base}`,
      `# Task\n${task}`,
      `# Safety\n${safety}`,
      ...(learningProfile
        ? [
            "# Learning Profile",
            learningProfile.summary,
            ...((((learningProfile.patterns as string[] | null) ?? [])).map((item) => `- ${item}`)),
          ]
        : []),
      "# Variables",
      `テーマ: ${input.topic.trim()}`,
      `トーン: ${input.tone.trim()}`,
      `目的: ${input.goal.trim()}`,
    ].join("\n\n");
  }

  private async generateText(params: {
    provider: PrismaAIProvider;
    apiKey: string;
    model: string;
    systemPrompt: string | null;
    prompt: string;
  }) {
    switch (params.provider) {
      case PrismaAIProvider.OPENAI:
        return this.generateWithOpenAI(params);
      case PrismaAIProvider.CLAUDE:
        return this.generateWithClaude(params);
      case PrismaAIProvider.GEMINI:
        return this.generateWithGemini(params);
    }
  }

  private async generateWithOpenAI(params: {
    apiKey: string;
    model: string;
    systemPrompt: string | null;
    prompt: string;
  }) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        input: [
          ...(params.systemPrompt
            ? [{ role: "system", content: [{ type: "input_text", text: params.systemPrompt }] }]
            : []),
          { role: "user", content: [{ type: "input_text", text: params.prompt }] },
        ],
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`OpenAI request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      output_text?: string;
    };
    const text = json.output_text?.trim();
    if (!text) {
      throw new BadRequestException("OpenAI returned empty content");
    }
    return text;
  }

  private async generateWithClaude(params: {
    apiKey: string;
    model: string;
    systemPrompt: string | null;
    prompt: string;
  }) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: 300,
        system: params.systemPrompt ?? undefined,
        messages: [{ role: "user", content: params.prompt }],
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(`Claude request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((item) => item.type === "text")?.text?.trim();
    if (!text) {
      throw new BadRequestException("Claude returned empty content");
    }
    return text;
  }

  private async generateWithGemini(params: {
    apiKey: string;
    model: string;
    systemPrompt: string | null;
    prompt: string;
  }) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: params.systemPrompt
            ? {
                parts: [{ text: params.systemPrompt }],
              }
            : undefined,
          contents: [
            {
              parts: [{ text: params.prompt }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new BadRequestException(`Gemini request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new BadRequestException("Gemini returned empty content");
    }
    return text;
  }

  private parseProvider(provider: AIProvider) {
    switch (provider) {
      case "openai":
        return PrismaAIProvider.OPENAI;
      case "claude":
        return PrismaAIProvider.CLAUDE;
      case "gemini":
        return PrismaAIProvider.GEMINI;
    }
  }

  private parseTemplateKind(kind: PromptTemplateKind) {
    switch (kind) {
      case "base":
        return PrismaPromptTemplateKind.BASE;
      case "task_post":
        return PrismaPromptTemplateKind.TASK_POST;
      case "task_reply":
        return PrismaPromptTemplateKind.TASK_REPLY;
      case "safety":
        return PrismaPromptTemplateKind.SAFETY;
    }
  }

  private mapProvider(provider: PrismaAIProvider): AIProvider {
    switch (provider) {
      case PrismaAIProvider.OPENAI:
        return "openai";
      case PrismaAIProvider.CLAUDE:
        return "claude";
      case PrismaAIProvider.GEMINI:
        return "gemini";
    }
  }

  private mapTemplateKind(kind: PrismaPromptTemplateKind): PromptTemplateKind {
    switch (kind) {
      case PrismaPromptTemplateKind.BASE:
        return "base";
      case PrismaPromptTemplateKind.TASK_POST:
        return "task_post";
      case PrismaPromptTemplateKind.TASK_REPLY:
        return "task_reply";
      case PrismaPromptTemplateKind.SAFETY:
        return "safety";
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

  private maskApiKey(apiKey: string) {
    if (!apiKey) {
      return null;
    }

    if (apiKey.length <= 8) {
      return "********";
    }

    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }
}
