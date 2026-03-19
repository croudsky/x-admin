import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import type {
  CreateWorkspaceUserInput,
  LoginInput,
  UpdateWorkspaceUserRoleInput,
  WorkspaceUserSummary,
} from "@oku/shared/index";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { Roles } from "./roles.decorator";

@Controller("auth")
export class WorkspaceAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("session/login")
  login(@Body() input: LoginInput) {
    return this.authService.login(input);
  }

  @Get("session/me")
  getMe(@Headers("authorization") authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "").trim();
    return this.authService.getSessionUser(token);
  }

  @Get("users")
  listUsers(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.authService.listWorkspaceUsers(currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Post("users")
  createUser(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: CreateWorkspaceUserInput) {
    return this.authService.createWorkspaceUser(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Patch("users/:id/role")
  updateRole(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string, @Body() input: UpdateWorkspaceUserRoleInput) {
    return this.authService.updateWorkspaceUserRole(id, input, currentUser.workspaceId);
  }
}
