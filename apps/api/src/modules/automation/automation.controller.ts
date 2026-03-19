import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  ApprovalDecisionInput,
  BatchApprovalDecisionInput,
  CreateContentJobInput,
  FixedReplyRuleReorderInput,
  GenerateReplyDraftInput,
  UpdateAutomationPolicyInput,
  UpsertFixedReplyRuleInput,
  UpdateContentJobInput,
  WorkspaceUserSummary,
} from "@oku/shared/index";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AutomationService } from "./automation.service";

@Controller("automation")
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get("overview")
  getOverview(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.automationService.getOverview(xAccountId, currentUser.workspaceId);
  }

  @Get("content-jobs")
  listContentJobs(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.automationService.listContentJobs(xAccountId, currentUser.workspaceId);
  }

  @Get("operations")
  getOperationsOverview(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.automationService.getOperationsOverview(xAccountId, currentUser.workspaceId);
  }

  @Get("approvals")
  listApprovals(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.automationService.listApprovals(currentUser.workspaceId);
  }

  @Get("mentions")
  listMentions(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.automationService.listMentions(xAccountId, currentUser.workspaceId);
  }

  @Get("fixed-reply-rules")
  listFixedReplyRules(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.automationService.listFixedReplyRules(xAccountId, currentUser.workspaceId);
  }

  @Get("accounts")
  listAccounts(@CurrentUser() currentUser: WorkspaceUserSummary) {
    return this.automationService.listAccounts(currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("content-jobs")
  createContentJob(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: CreateContentJobInput) {
    return this.automationService.createContentJob(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("mentions/sync")
  syncMentions(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.automationService.syncMentions(xAccountId, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor", "reviewer")
  @Post("mentions/:id/generate-reply")
  generateReplyFromMention(
    @CurrentUser() currentUser: WorkspaceUserSummary,
    @Param("id") id: string,
    @Body() input: Omit<GenerateReplyDraftInput, "sourceText" | "inReplyToPostId">,
  ) {
    return this.automationService.generateReplyFromMention(id, input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("fixed-reply-rules")
  saveFixedReplyRule(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: UpsertFixedReplyRuleInput) {
    return this.automationService.saveFixedReplyRule(input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("fixed-reply-rules/:id/duplicate")
  duplicateFixedReplyRule(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.duplicateFixedReplyRule(id, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("fixed-reply-rules/:id/toggle")
  toggleFixedReplyRule(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.toggleFixedReplyRule(id, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("fixed-reply-rules/:id/reorder")
  reorderFixedReplyRule(
    @CurrentUser() currentUser: WorkspaceUserSummary,
    @Param("id") id: string,
    @Body() input: FixedReplyRuleReorderInput,
  ) {
    return this.automationService.reorderFixedReplyRule(id, input.direction, currentUser.workspaceId);
  }

  @Roles("owner", "admin")
  @Post("policy")
  updateAutomationPolicy(
    @CurrentUser() currentUser: WorkspaceUserSummary,
    @Body() input: UpdateAutomationPolicyInput,
    @Query("xAccountId") xAccountId?: string,
  ) {
    return this.automationService.updateAutomationPolicy(input, xAccountId, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "reviewer")
  @Post("content-jobs/:id/approval")
  decideApproval(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string, @Body() input: ApprovalDecisionInput) {
    return this.automationService.decideApproval(id, input, currentUser.workspaceId, currentUser.id);
  }

  @Roles("owner", "admin", "reviewer")
  @Post("content-jobs/approval/batch")
  decideApprovalsBatch(@CurrentUser() currentUser: WorkspaceUserSummary, @Body() input: BatchApprovalDecisionInput) {
    return this.automationService.decideApprovalsBatch(input, currentUser.workspaceId, currentUser.id);
  }

  @Roles("owner", "admin", "editor", "reviewer")
  @Patch("content-jobs/:id")
  updateContentJob(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string, @Body() input: UpdateContentJobInput) {
    return this.automationService.updateContentJob(id, input, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("content-jobs/:id/send")
  sendContentJob(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.sendContentJob(id, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor", "reviewer")
  @Post("content-jobs/:id/reopen")
  reopenFailedJob(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.reopenFailedJob(id, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor", "reviewer")
  @Post("content-jobs/:id/retry")
  retryContentJob(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.retryContentJob(id, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("dispatch/run")
  runDispatchNow() {
    return this.automationService.dispatchDueContentJobs();
  }

  @Roles("owner", "admin", "editor")
  @Post("content-jobs/:id/unlock")
  unlockStuckJob(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.unlockStuckJob(id, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("fixed-reply-rules/:id/delete")
  deleteFixedReplyRule(@CurrentUser() currentUser: WorkspaceUserSummary, @Param("id") id: string) {
    return this.automationService.deleteFixedReplyRule(id, currentUser.workspaceId);
  }
}
