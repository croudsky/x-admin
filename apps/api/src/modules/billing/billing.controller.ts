import { Body, Controller, Get, Post } from "@nestjs/common";
import type { UpdateWorkspaceBillingInput, WorkspaceUserSummary } from "@oku/shared/index";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { BillingService } from "./billing.service";

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Roles("owner", "admin")
  @Get("summary")
  getSummary(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.billingService.getSummary(currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Post("settings")
  updateSettings(
    @CurrentUser() currentUser: WorkspaceUserSummary,
    @Body() input: UpdateWorkspaceBillingInput,
  ) {
    return this.billingService.updateSettings(currentUser.workspaceId, input);
  }
}
