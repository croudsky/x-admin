import { Controller, Get, Query } from "@nestjs/common";
import { AuditService } from "./audit.service";

@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("logs")
  listLogs(@Query("eventType") eventType?: string, @Query("search") search?: string) {
    return this.auditService.listLogs({ eventType, search });
  }
}
