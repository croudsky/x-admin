import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  NotificationTestInput,
  NotificationEndpointSummary,
  UpsertNotificationEndpointInput,
} from "@oku/shared/index";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEndpoints(workspaceId?: string): Promise<NotificationEndpointSummary[]> {
    const workspace = await this.requireWorkspace(workspaceId);
    const endpoints = await this.prisma.notificationEndpoint.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });

    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      webhookUrlMasked: this.maskWebhookUrl(endpoint.webhookUrl),
      events: endpoint.events.split(",").map((item) => item.trim()).filter(Boolean),
      repeatIntervalMinutes: endpoint.repeatIntervalMinutes,
      failureThresholdCount: endpoint.failureThresholdCount,
      isActive: endpoint.isActive,
    }));
  }

  async saveEndpoint(input: UpsertNotificationEndpointInput, workspaceId?: string): Promise<NotificationEndpointSummary> {
    const workspace = await this.requireWorkspace(workspaceId);
    const name = input.name.trim();
    const webhookUrl = input.webhookUrl.trim();
    const events = input.events.map((item) => item.trim()).filter(Boolean);

    if (!name || !webhookUrl || events.length === 0) {
      throw new BadRequestException("name, webhookUrl and events are required");
    }

    const existing = await this.prisma.notificationEndpoint.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
    });

    const saved = existing
      ? await this.prisma.notificationEndpoint.update({
          where: { id: existing.id },
          data: {
            name,
            webhookUrl,
            events: events.join(","),
            repeatIntervalMinutes: Math.max(0, input.repeatIntervalMinutes ?? 0),
            failureThresholdCount: Math.max(1, input.failureThresholdCount ?? 1),
            isActive: input.isActive,
          },
        })
      : await this.prisma.notificationEndpoint.create({
          data: {
            workspaceId: workspace.id,
            name,
            webhookUrl,
            events: events.join(","),
            repeatIntervalMinutes: Math.max(0, input.repeatIntervalMinutes ?? 0),
            failureThresholdCount: Math.max(1, input.failureThresholdCount ?? 1),
            isActive: input.isActive,
          },
        });

    return {
      id: saved.id,
      name: saved.name,
      webhookUrlMasked: this.maskWebhookUrl(saved.webhookUrl),
      events,
      repeatIntervalMinutes: saved.repeatIntervalMinutes,
      failureThresholdCount: saved.failureThresholdCount,
      isActive: saved.isActive,
    };
  }

  async emit(params: {
    workspaceId: string;
    eventType: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    const endpoints = await this.prisma.notificationEndpoint.findMany({
      where: {
        workspaceId: params.workspaceId,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const matching = endpoints.filter((endpoint) =>
      endpoint.events
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .includes(params.eventType),
    );

    await Promise.all(
      matching.map(async (endpoint) => {
        if (!(await this.shouldDeliver(endpoint, params.workspaceId, params.eventType))) {
          return;
        }

        await this.deliverWebhook(endpoint.webhookUrl, {
          text: `${params.title}\n${params.message}`,
          eventType: params.eventType,
          title: params.title,
          message: params.message,
          metadata: params.metadata ?? {},
        });
        await this.prisma.notificationEndpoint.update({
          where: { id: endpoint.id },
          data: {
            lastDeliveredAt: new Date(),
            lastDeliveredEventType: params.eventType,
          },
        });
      }),
    );
  }

  async testEndpoint(input: NotificationTestInput, workspaceId?: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    const endpoint = await this.prisma.notificationEndpoint.findFirst({
      where: {
        workspaceId: workspace.id,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!endpoint) {
      throw new BadRequestException("No active notification endpoint found");
    }

    await this.deliverWebhook(endpoint.webhookUrl, {
      text: `${input.title}\n${input.message}`,
      eventType: "notification.test",
      title: input.title,
      message: input.message,
    });

    return { delivered: true };
  }

  getPresets() {
    return [
      {
        id: "slack",
        label: "Slack",
        events: ["content.failed", "content.published", "approval.approved"],
      },
      {
        id: "discord",
        label: "Discord",
        events: ["content.failed", "content.published", "approval.approved"],
      },
      {
        id: "generic",
        label: "Generic Webhook",
        events: ["content.failed", "content.published"],
      },
    ];
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

  private maskWebhookUrl(value: string) {
    if (value.length <= 14) {
      return "********";
    }

    return `${value.slice(0, 10)}...${value.slice(-4)}`;
  }

  private async deliverWebhook(url: string, body: Record<string, unknown>) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async shouldDeliver(
    endpoint: {
      id: string;
      repeatIntervalMinutes: number;
      failureThresholdCount: number;
      lastDeliveredAt: Date | null;
      lastDeliveredEventType: string | null;
    },
    workspaceId: string,
    eventType: string,
  ) {
    if (
      endpoint.repeatIntervalMinutes > 0 &&
      endpoint.lastDeliveredAt &&
      endpoint.lastDeliveredEventType === eventType
    ) {
      const cooldownUntil = new Date(endpoint.lastDeliveredAt.getTime() + endpoint.repeatIntervalMinutes * 60_000);
      if (cooldownUntil > new Date()) {
        return false;
      }
    }

    if (eventType === "content.failed" && endpoint.failureThresholdCount > 1) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const failedCount = await this.prisma.contentJob.count({
        where: {
          workspaceId,
          status: "FAILED",
          updatedAt: { gte: oneHourAgo },
        },
      });
      if (failedCount < endpoint.failureThresholdCount) {
        return false;
      }
    }

    return true;
  }
}
