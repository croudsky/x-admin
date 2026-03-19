import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type {
  GenerateReplyDraftInput,
  GeneratePostDraftInput,
  PromptPreviewInput,
  UpsertPromptTemplateInput,
  UpsertAIProviderSettingInput,
  WorkspaceUserSummary,
} from "@oku/shared/index";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AIService } from "./ai.service";

@Controller("ai")
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Get("settings")
  listSettings(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.aiService.listSettings(xAccountId, currentUser.workspaceId);
  }

  @Get("prompt-templates")
  listPromptTemplates(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.aiService.listPromptTemplates(xAccountId, currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Post("settings")
  saveSetting(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: UpsertAIProviderSettingInput) {
    return this.aiService.saveSetting(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("prompt-templates")
  savePromptTemplate(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: UpsertPromptTemplateInput) {
    return this.aiService.savePromptTemplate(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor", "reviewer")
  @Post("prompt-preview")
  getPromptPreview(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: PromptPreviewInput) {
    return this.aiService.getPromptPreview(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("generate-post")
  generatePost(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: GeneratePostDraftInput) {
    return this.aiService.generatePostDraft(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor", "reviewer")
  @Post("generate-reply")
  generateReply(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: GenerateReplyDraftInput) {
    return this.aiService.generateReplyDraft(input, currentUser.workspaceId);
  }
}
