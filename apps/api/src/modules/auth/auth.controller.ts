import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { UpsertXAppCredentialInput, WorkspaceUserSummary } from "@oku/shared/index";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { Roles } from "./roles.decorator";

@Controller("auth/x")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("connect-url")
  getConnectUrl(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.authService.createConnectUrl(currentUser.workspaceId);
  }

  @Get("credentials")
  getCredentials(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.authService.getCredentialSummary(currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Post("credentials")
  saveCredentials(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: UpsertXAppCredentialInput) {
    return this.authService.saveCredentials(input, currentUser.workspaceId);
  }

  @Public()
  @Get("callback")
  handleCallback(@Query("code") code: string, @Query("state") state: string) {
    return this.authService.handleCallback(code, state);
  }
}
