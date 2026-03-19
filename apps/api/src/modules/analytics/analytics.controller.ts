import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { WorkspaceUserSummary } from "@oku/shared/index";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("snapshots")
  getSnapshots(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.analyticsService.listSnapshots(xAccountId, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("collect")
  collectSnapshots(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.analyticsService.collectSnapshots(xAccountId, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("learn")
  learnFromOwnHistory(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.analyticsService.learnFromOwnHistory(xAccountId, currentUser.workspaceId);
  }

  @Roles("owner", "admin", "editor")
  @Post("competitor")
  analyzeCompetitor(
    @CurrentUser() currentUser: WorkspaceUserSummary,
    @Body() input: { handle: string },
    @Query("xAccountId") xAccountId?: string,
  ) {
    return this.analyticsService.analyzeCompetitor(input.handle, xAccountId, currentUser.workspaceId);
  }

  @Get("reports")
  listReports(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.analyticsService.listAnalysisReports(xAccountId, currentUser.workspaceId);
  }

  @Get("learning-profile")
  getLearningProfile(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId: string) {
    return this.analyticsService.getLearningProfile(xAccountId, currentUser.workspaceId);
  }

  @Get("post-performance")
  listPostPerformance(@CurrentUser() currentUser: WorkspaceUserSummary, @Query("xAccountId") xAccountId?: string) {
    return this.analyticsService.listPostPerformance(xAccountId, currentUser.workspaceId);
  }
}
