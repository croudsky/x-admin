import { Injectable } from "@nestjs/common";
import type { AuditLogQuery, AuditLogRecord } from "@oku/shared/index";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listLogs(query?: AuditLogQuery): Promise<AuditLogRecord[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(query?.eventType ? { eventType: query.eventType } : {}),
        ...(query?.search
          ? {
              OR: [
                { summary: { contains: query.search, mode: "insensitive" } },
                { entityType: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return logs.map((log) => ({
      id: log.id,
      eventType: log.eventType,
      entityType: log.entityType,
      entityId: log.entityId ?? null,
      summary: log.summary,
      metadata: (log.metadata as Record<string, unknown> | null) ?? null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async record(params: {
    workspaceId: string;
    actorUserId?: string | null;
    eventType: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Record<string, unknown> | null;
  }) {
    await this.prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId ?? null,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        summary: params.summary,
        metadata: (params.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  }
}
