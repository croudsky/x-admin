export type ApprovalMode = "auto" | "manual";
export type UserRole = "owner" | "admin" | "editor" | "reviewer" | "viewer";
export type WorkspacePlanTier = "free" | "pro" | "agency";

export type ContentKind = "post" | "reply";
export type AIProvider = "openai" | "claude" | "gemini";
export type PromptTemplateKind = "base" | "task_post" | "task_reply" | "safety";

export type JobStatus =
  | "draft"
  | "queued"
  | "awaiting_approval"
  | "scheduled"
  | "processing"
  | "published"
  | "failed";

export interface Workspace {
  id: string;
  name: string;
  ownerUserId: string;
}

export interface XAccount {
  id: string;
  workspaceId: string;
  handle: string;
  displayName: string;
  status: "connected" | "disconnected";
}

export interface WorkspaceUserSummary {
  id: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: UserRole;
  lastLoginAt: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: WorkspaceUserSummary;
}

export interface CreateWorkspaceUserInput {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export interface UpdateWorkspaceUserRoleInput {
  role: UserRole;
}

export interface WorkspaceBillingSettings {
  workspaceId: string;
  planTier: WorkspacePlanTier;
  isBillingActive: boolean;
  monthlyPriceJpy: number;
  maxXAccounts: number;
  maxMonthlyContentJobs: number;
  maxMonthlyAiGenerations: number;
  maxMonthlyMentionSyncs: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface WorkspaceUsageSnapshot {
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  contentJobsCreated: number;
  aiGenerations: number;
  mentionSyncRuns: number;
  importedMentions: number;
}

export interface WorkspaceBillingSummary {
  settings: WorkspaceBillingSettings;
  usage: WorkspaceUsageSnapshot & {
    xAccountsConnected: number;
    postsPublished: number;
  };
  remaining: {
    xAccounts: number;
    contentJobs: number;
    aiGenerations: number;
    mentionSyncRuns: number;
  };
}

export interface UpdateWorkspaceBillingInput {
  planTier: WorkspacePlanTier;
  isBillingActive: boolean;
  monthlyPriceJpy: number;
  maxXAccounts: number;
  maxMonthlyContentJobs: number;
  maxMonthlyAiGenerations: number;
  maxMonthlyMentionSyncs: number;
}

export interface AutomationPolicy {
  workspaceId: string;
  approvalMode: ApprovalMode;
  autoReplyEnabled: boolean;
  autoPostEnabled: boolean;
  autoReplyPaused?: boolean;
  autoReplyPauseReason?: string | null;
  autoReplyCooldownUntil?: string | null;
  maxAutoRepliesPerHour?: number;
  maxAutoRepliesPerDay?: number;
  maxConsecutiveAutoReplies?: number;
  spikeLimit10Minutes?: number;
}

export interface ContentJob {
  id: string;
  workspaceId: string;
  xAccountId: string;
  kind: ContentKind;
  body: string;
  status: JobStatus;
  inReplyToPostId?: string | null;
  targetAuthorXUserId?: string | null;
  targetAuthorHandle?: string | null;
  externalPostId?: string | null;
  retryCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  scheduledAt: string | null;
}

export interface AnalyticsSnapshot {
  xAccountId: string;
  date: string;
  impressions: number;
  engagements: number;
  followersCount?: number;
  followersDelta: number;
}

export interface AnalyticsCollectResult {
  collected: number;
  snapshots: AnalyticsSnapshot[];
}

export interface NotificationEndpointSummary {
  id: string;
  name: string;
  webhookUrlMasked: string;
  events: string[];
  repeatIntervalMinutes: number;
  failureThresholdCount: number;
  isActive: boolean;
}

export interface UpsertNotificationEndpointInput {
  name: string;
  webhookUrl: string;
  events: string[];
  repeatIntervalMinutes?: number;
  failureThresholdCount?: number;
  isActive: boolean;
}

export interface NotificationTestInput {
  title: string;
  message: string;
}

export interface AuditLogRecord {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogQuery {
  eventType?: string;
  search?: string;
}

export interface TimelineAnalysisTopPost {
  id: string;
  text: string;
  createdAt: string | null;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount: number;
  score: number;
}

export interface TimelineAnalysisResult {
  source: "own" | "competitor";
  label: string;
  handle: string;
  totalPosts: number;
  averageLength: number;
  averageEngagement: number;
  questionPostRatio: number;
  ctaPostRatio: number;
  hashtagPostRatio: number;
  topPosts: TimelineAnalysisTopPost[];
  recommendations: string[];
}

export interface AnalysisReportRecord {
  id: string;
  source: "own" | "competitor";
  label: string;
  handle: string;
  createdAt: string;
  report: TimelineAnalysisResult;
}

export interface LearningProfileSummary {
  xAccountId: string;
  summary: string;
  patterns: string[];
  updatedAt: string;
}

export interface PostPerformanceRecord {
  contentJobId: string;
  xAccountId: string;
  externalPostId: string;
  kind: ContentKind;
  body: string;
  sourcePrompt: string | null;
  publishedAt: string | null;
  impressions: number;
  engagements: number;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount: number;
  bookmarkCount: number;
  score: number;
}

export interface OperationsOverview {
  stuckProcessingJobs: ContentJob[];
  recentFailedJobs: ContentJob[];
  queueDepth: number;
  awaitingApprovalCount: number;
  syncState: {
    xAccountId: string;
    lastMentionId: string | null;
    nextPaginationToken: string | null;
    rateLimitedUntil: string | null;
    lastSyncedAt: string | null;
  } | null;
}

export interface FixedReplyRuleSummary {
  id: string;
  xAccountId: string;
  fixedPostId: string;
  fixedPostText: string;
  triggerPhrase: string | null;
  requireLike: boolean;
  requireRetweet: boolean;
  requireFollow: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
  maxRepliesPerAuthorPerDay: number;
  excludedUserIds: string[];
  replyTemplate: string;
  priority: number;
  includeAuthorId: boolean;
  includeAuthorHandle: boolean;
  isActive: boolean;
}

export interface UpsertFixedReplyRuleInput {
  xAccountId: string;
  fixedPostId: string;
  fixedPostText: string;
  triggerPhrase?: string;
  requireLike: boolean;
  requireRetweet: boolean;
  requireFollow?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
  maxRepliesPerAuthorPerDay?: number;
  excludedUserIds?: string[];
  replyTemplate: string;
  priority?: number;
  includeAuthorId: boolean;
  includeAuthorHandle: boolean;
  isActive: boolean;
}

export interface UpdateAutomationPolicyInput {
  approvalMode?: ApprovalMode;
  autoReplyEnabled?: boolean;
  autoPostEnabled?: boolean;
  autoReplyPaused?: boolean;
  autoReplyPauseReason?: string | null;
  autoReplyCooldownUntil?: string | null;
  maxAutoRepliesPerHour?: number;
  maxAutoRepliesPerDay?: number;
  maxConsecutiveAutoReplies?: number;
  spikeLimit10Minutes?: number;
}

export interface AutomationOverview {
  account: XAccount | null;
  policy: AutomationPolicy | null;
  queue: ContentJob[];
}

export interface CreateContentJobInput {
  xAccountId?: string;
  body: string;
  kind: ContentKind;
  scheduledAt: string | null;
}

export interface UpdateContentJobInput {
  body: string;
  scheduledAt: string | null;
}

export interface ApprovalDecisionInput {
  decision: "approve" | "reject";
  note?: string;
}

export interface BatchApprovalDecisionInput {
  jobIds: string[];
  decision: "approve" | "reject";
  note?: string;
}

export interface ApprovalRecord {
  id: string;
  contentJobId: string;
  reviewerName: string;
  contentKind: ContentKind;
  contentBody: string;
  status: "approved" | "rejected" | "pending";
  note: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface FixedReplyRuleReorderInput {
  direction: "up" | "down";
}

export interface MentionRecord {
  id: string;
  xAccountId: string;
  externalMentionId: string;
  authorXUserId?: string | null;
  authorHandle: string;
  body: string;
  referencedPostId?: string | null;
  status: "new" | "reviewed" | "replied" | "ignored";
  mentionedAt: string;
}

export interface SyncMentionsResult {
  imported: number;
  mentions: MentionRecord[];
  nextPaginationToken?: string | null;
  rateLimitedUntil?: string | null;
}

export interface SendContentJobResult {
  job: ContentJob;
  sentPostId: string;
}

export interface XConnectUrlResponse {
  authorizeUrl: string;
  state: string;
  expiresAt: string;
}

export interface XCallbackResult {
  xAccountId: string;
  handle: string;
  displayName: string;
  status: "connected" | "disconnected";
}

export interface XAppCredentialSummary {
  clientId: string;
  redirectUri: string;
  scopes: string;
  isActive: boolean;
  hasClientSecret: boolean;
  maskedClientSecret: string | null;
}

export interface UpsertXAppCredentialInput {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
  isActive: boolean;
}

export interface AIProviderSettingSummary {
  provider: AIProvider;
  model: string;
  systemPrompt: string | null;
  isActive: boolean;
  hasApiKey: boolean;
  maskedApiKey: string | null;
}

export interface UpsertAIProviderSettingInput {
  provider: AIProvider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  isActive: boolean;
}

export interface GeneratePostDraftInput {
  xAccountId?: string;
  topic: string;
  tone: string;
  goal: string;
  scheduledAt: string | null;
}

export interface GeneratePostDraftResult {
  provider: AIProvider;
  model: string;
  prompt: string;
  job: ContentJob;
}

export interface GenerateReplyDraftInput {
  xAccountId?: string;
  sourceText: string;
  tone: string;
  goal: string;
  inReplyToPostId?: string | null;
}

export interface PromptPreviewInput {
  xAccountId?: string;
  kind: "post" | "reply";
  topic: string;
  tone: string;
  goal: string;
}

export interface PromptPreviewResult {
  prompt: string;
  variables: Array<{ label: string; value: string }>;
}

export interface PromptTemplateSummary {
  id: string;
  kind: PromptTemplateKind;
  title: string;
  content: string;
  isActive: boolean;
  updatedAt: string;
}

export interface UpsertPromptTemplateInput {
  kind: PromptTemplateKind;
  title: string;
  content: string;
  isActive: boolean;
}
