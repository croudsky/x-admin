import { Body, Controller, Get, Post } from "@nestjs/common";
import type { NotificationTestInput, UpsertNotificationEndpointInput, WorkspaceUserSummary } from "@oku/shared/index";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("endpoints")
  listEndpoints(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.notificationsService.listEndpoints(currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Post("endpoints")
  saveEndpoint(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: UpsertNotificationEndpointInput) {
    return this.notificationsService.saveEndpoint(input, currentUser.workspaceId);
  }

  @Get("presets")
  getPresets() {
    return this.notificationsService.getPresets();
  }

  @Roles("owner", "admin")
  @Post("test")
  testEndpoint(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: NotificationTestInput) {
    return this.notificationsService.testEndpoint(input, currentUser.workspaceId);
  }
}
