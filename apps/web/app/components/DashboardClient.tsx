"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  AnalysisReportRecord,
  AnalyticsCollectResult,
  AIProvider,
  AIProviderSettingSummary,
  AuditLogQuery,
  AuditLogRecord,
  ApprovalDecisionInput,
  ApprovalRecord,
  AnalyticsSnapshot,
  AutomationOverview,
  ContentJob,
  ContentKind,
  CreateContentJobInput,
  FixedReplyRuleSummary,
  GeneratePostDraftResult,
  GenerateReplyDraftInput,
  MentionRecord,
  LearningProfileSummary,
  NotificationEndpointSummary,
  NotificationTestInput,
  OperationsOverview,
  PostPerformanceRecord,
  PromptPreviewResult,
  PromptTemplateKind,
  PromptTemplateSummary,
  TimelineAnalysisResult,
  WorkspaceUserSummary,
  WorkspaceBillingSummary,
  WorkspacePlanTier,
  UpdateWorkspaceBillingInput,
  UpsertPromptTemplateInput,
  UpsertAIProviderSettingInput,
  UpsertNotificationEndpointInput,
  UpsertFixedReplyRuleInput,
  UpdateAutomationPolicyInput,
  UpdateContentJobInput,
  UserRole,
  XAccount,
  UpsertXAppCredentialInput,
  XAppCredentialSummary,
} from "@oku/shared/index";

const fallbackOverview: AutomationOverview = {
  account: {
    id: "fallback-account",
    workspaceId: "fallback-workspace",
    handle: "@oku_ai",
    displayName: "Oku Labs",
    status: "connected",
  },
  policy: {
    workspaceId: "fallback-workspace",
    approvalMode: "manual",
    autoReplyEnabled: true,
    autoPostEnabled: false,
  },
  queue: [],
};

const fallbackAnalytics: AnalyticsSnapshot[] = [
  {
    xAccountId: "fallback-account",
    date: "2026-03-17",
    impressions: 14200,
    engagements: 690,
    followersDelta: 38,
  },
  {
    xAccountId: "fallback-account",
    date: "2026-03-18",
    impressions: 16840,
    engagements: 744,
    followersDelta: 46,
  },
];

type DashboardClientProps = {
  apiBaseUrl: string;
};

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setDate(date.getDate() - date.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const inputClassName =
  "w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-3 text-sm text-[var(--text)] outline-none";
const panelClassName =
  "rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]";
const primaryButtonClassName =
  "rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#fffaf2] transition enabled:hover:opacity-90 disabled:cursor-wait disabled:opacity-60";

export function DashboardClient({ apiBaseUrl }: DashboardClientProps) {
  const [overview, setOverview] = useState<AutomationOverview>(fallbackOverview);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot[]>(fallbackAnalytics);
  const [operationsOverview, setOperationsOverview] = useState<OperationsOverview | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [aiSettings, setAISettings] = useState<AIProviderSettingSummary[]>([]);
  const [analysisReports, setAnalysisReports] = useState<AnalysisReportRecord[]>([]);
  const [postPerformance, setPostPerformance] = useState<PostPerformanceRecord[]>([]);
  const [learningProfile, setLearningProfile] = useState<LearningProfileSummary | null>(null);
  const [mentions, setMentions] = useState<MentionRecord[]>([]);
  const [fixedReplyRules, setFixedReplyRules] = useState<FixedReplyRuleSummary[]>([]);
  const [notificationEndpoints, setNotificationEndpoints] = useState<NotificationEndpointSummary[]>([]);
  const [notificationPresets, setNotificationPresets] = useState<Array<{ id: string; label: string; events: string[] }>>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateSummary[]>([]);
  const [xCredential, setXCredential] = useState<XAppCredentialSummary | null>(null);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUserSummary[]>([]);
  const [billingSummary, setBillingSummary] = useState<WorkspaceBillingSummary | null>(null);
  const [sessionUser, setSessionUser] = useState<WorkspaceUserSummary | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<ContentKind>("post");
  const [scheduledAt, setScheduledAt] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [draftTone, setDraftTone] = useState("簡潔で信頼感のあるトーン");
  const [draftGoal, setDraftGoal] = useState("サービス理解を深めてもらう");
  const [draftScheduledAt, setDraftScheduledAt] = useState("");
  const [replySourceText, setReplySourceText] = useState("");
  const [replyTone, setReplyTone] = useState("丁寧で自然なトーン");
  const [replyGoal, setReplyGoal] = useState("会話を前に進める");
  const [fixedPostId, setFixedPostId] = useState("");
  const [fixedPostText, setFixedPostText] = useState("");
  const [fixedTriggerPhrase, setFixedTriggerPhrase] = useState("");
  const [fixedRequireLike, setFixedRequireLike] = useState(false);
  const [fixedRequireRetweet, setFixedRequireRetweet] = useState(false);
  const [fixedRequireFollow, setFixedRequireFollow] = useState(false);
  const [fixedActiveFrom, setFixedActiveFrom] = useState("");
  const [fixedActiveTo, setFixedActiveTo] = useState("");
  const [fixedMaxRepliesPerAuthorPerDay, setFixedMaxRepliesPerAuthorPerDay] = useState("1");
  const [fixedExcludedUserIds, setFixedExcludedUserIds] = useState("");
  const [fixedPriority, setFixedPriority] = useState("0");
  const [fixedReplyTemplate, setFixedReplyTemplate] = useState("@{{author_handle}} ありがとうございます。確認しました。");
  const [fixedIncludeAuthorId, setFixedIncludeAuthorId] = useState(false);
  const [fixedIncludeAuthorHandle, setFixedIncludeAuthorHandle] = useState(true);
  const [autoReplyPaused, setAutoReplyPaused] = useState(false);
  const [autoReplyPauseReason, setAutoReplyPauseReason] = useState("");
  const [approvalModeSetting, setApprovalModeSetting] = useState<"auto" | "manual">("manual");
  const [autoReplyEnabledSetting, setAutoReplyEnabledSetting] = useState(true);
  const [autoPostEnabledSetting, setAutoPostEnabledSetting] = useState(false);
  const [maxAutoRepliesPerHour, setMaxAutoRepliesPerHour] = useState("20");
  const [maxAutoRepliesPerDay, setMaxAutoRepliesPerDay] = useState("100");
  const [maxConsecutiveAutoReplies, setMaxConsecutiveAutoReplies] = useState("10");
  const [spikeLimit10Minutes, setSpikeLimit10Minutes] = useState("15");
  const [autoReplyCooldownUntil, setAutoReplyCooldownUntil] = useState("");
  const [xClientId, setXClientId] = useState("");
  const [xClientSecret, setXClientSecret] = useState("");
  const [xRedirectUri, setXRedirectUri] = useState("http://localhost:4000/auth/x/callback");
  const [xScopes, setXScopes] = useState("tweet.read,tweet.write,users.read,offline.access");
  const [aiProvider, setAIProvider] = useState<AIProvider>("openai");
  const [aiApiKey, setAIApiKey] = useState("");
  const [aiModel, setAIModel] = useState("gpt-4.1-mini");
  const [aiSystemPrompt, setAISystemPrompt] = useState("");
  const [promptKind, setPromptKind] = useState<PromptTemplateKind>("base");
  const [promptTitle, setPromptTitle] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [promptPreview, setPromptPreview] = useState<PromptPreviewResult | null>(null);
  const [notificationName, setNotificationName] = useState("Main Webhook");
  const [notificationWebhookUrl, setNotificationWebhookUrl] = useState("");
  const [notificationEvents, setNotificationEvents] = useState("content.failed,content.published,approval.approved");
  const [notificationRepeatIntervalMinutes, setNotificationRepeatIntervalMinutes] = useState("0");
  const [notificationFailureThresholdCount, setNotificationFailureThresholdCount] = useState("1");
  const [loginEmail, setLoginEmail] = useState("owner@oku.local");
  const [loginPassword, setLoginPassword] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("editor");
  const [billingPlanTier, setBillingPlanTier] = useState<WorkspacePlanTier>("free");
  const [billingActive, setBillingActive] = useState(true);
  const [billingMonthlyPriceJpy, setBillingMonthlyPriceJpy] = useState("0");
  const [billingMaxXAccounts, setBillingMaxXAccounts] = useState("1");
  const [billingMaxMonthlyContentJobs, setBillingMaxMonthlyContentJobs] = useState("100");
  const [billingMaxMonthlyAiGenerations, setBillingMaxMonthlyAiGenerations] = useState("120");
  const [billingMaxMonthlyMentionSyncs, setBillingMaxMonthlyMentionSyncs] = useState("200");
  const [auditEventType, setAuditEventType] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [selectedApprovalJobIds, setSelectedApprovalJobIds] = useState<string[]>([]);
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [calendarCursor, setCalendarCursor] = useState(() => startOfMonth(new Date()));
  const [ownAnalysis, setOwnAnalysis] = useState<TimelineAnalysisResult | null>(null);
  const [competitorHandle, setCompetitorHandle] = useState("");
  const [competitorAnalysis, setCompetitorAnalysis] = useState<TimelineAnalysisResult | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [connectPending, setConnectPending] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function withAccount(path: string) {
    if (!selectedAccountId) {
      return `${apiBaseUrl}${path}`;
    }

    const separator = path.includes("?") ? "&" : "?";
    return `${apiBaseUrl}${path}${separator}xAccountId=${encodeURIComponent(selectedAccountId)}`;
  }

  async function authFetch(input: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (sessionToken) {
      headers.set("Authorization", `Bearer ${sessionToken}`);
    }
    return fetch(input, {
      ...init,
      headers,
    });
  }

  useEffect(() => {
    const token = window.localStorage.getItem("oku_session_token");
    if (token) {
      setSessionToken(token);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!sessionToken) {
        return;
      }
      const [
        overviewResponse,
        analyticsResponse,
        approvalsResponse,
        operationsResponse,
        auditLogsResponse,
        accountsResponse,
        analysisReportsResponse,
        postPerformanceResponse,
        learningProfileResponse,
        aiSettingsResponse,
        promptTemplatesResponse,
        mentionsResponse,
        fixedReplyRulesResponse,
        xCredentialResponse,
        notificationEndpointsResponse,
        notificationPresetsResponse,
        workspaceUsersResponse,
        billingSummaryResponse,
      ] = await Promise.allSettled([
        authFetch(withAccount("/automation/overview"), { cache: "no-store" }),
        authFetch(withAccount("/analytics/snapshots"), { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/automation/approvals`, { cache: "no-store" }),
        authFetch(withAccount("/automation/operations"), { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/audit/logs`, { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/automation/accounts`, { cache: "no-store" }),
        authFetch(withAccount("/analytics/reports"), { cache: "no-store" }),
        authFetch(withAccount("/analytics/post-performance"), { cache: "no-store" }),
        authFetch(selectedAccountId ? withAccount("/analytics/learning-profile") : `${apiBaseUrl}/analytics/learning-profile`, { cache: "no-store" }),
        authFetch(withAccount("/ai/settings"), { cache: "no-store" }),
        authFetch(withAccount("/ai/prompt-templates"), { cache: "no-store" }),
        authFetch(withAccount("/automation/mentions"), { cache: "no-store" }),
        authFetch(withAccount("/automation/fixed-reply-rules"), { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/auth/x/credentials`, { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/notifications/endpoints`, { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/notifications/presets`, { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/auth/users`, { cache: "no-store" }),
        authFetch(`${apiBaseUrl}/billing/summary`, { cache: "no-store" }),
      ]);

      if (cancelled) {
        return;
      }

      if (overviewResponse.status === "fulfilled" && overviewResponse.value.ok) {
        const nextOverview = (await overviewResponse.value.json()) as AutomationOverview;
        setOverview(nextOverview);
        setApprovalModeSetting(nextOverview.policy?.approvalMode ?? "manual");
        setAutoReplyEnabledSetting(nextOverview.policy?.autoReplyEnabled ?? true);
        setAutoPostEnabledSetting(nextOverview.policy?.autoPostEnabled ?? false);
        setAutoReplyPaused(nextOverview.policy?.autoReplyPaused ?? false);
        setAutoReplyPauseReason(nextOverview.policy?.autoReplyPauseReason ?? "");
        setMaxAutoRepliesPerHour(String(nextOverview.policy?.maxAutoRepliesPerHour ?? 20));
        setMaxAutoRepliesPerDay(String(nextOverview.policy?.maxAutoRepliesPerDay ?? 100));
        setMaxConsecutiveAutoReplies(String(nextOverview.policy?.maxConsecutiveAutoReplies ?? 10));
        setSpikeLimit10Minutes(String(nextOverview.policy?.spikeLimit10Minutes ?? 15));
        setAutoReplyCooldownUntil(toDatetimeLocalValue(nextOverview.policy?.autoReplyCooldownUntil ?? null));
      }
      if (analyticsResponse.status === "fulfilled" && analyticsResponse.value.ok) {
        setAnalytics((await analyticsResponse.value.json()) as AnalyticsSnapshot[]);
      }
      if (approvalsResponse.status === "fulfilled" && approvalsResponse.value.ok) {
        setApprovals((await approvalsResponse.value.json()) as ApprovalRecord[]);
      }
      if (operationsResponse.status === "fulfilled" && operationsResponse.value.ok) {
        setOperationsOverview((await operationsResponse.value.json()) as OperationsOverview);
      }
      if (auditLogsResponse.status === "fulfilled" && auditLogsResponse.value.ok) {
        setAuditLogs((await auditLogsResponse.value.json()) as AuditLogRecord[]);
      }
      if (accountsResponse.status === "fulfilled" && accountsResponse.value.ok) {
        const nextAccounts = (await accountsResponse.value.json()) as XAccount[];
        setAccounts(nextAccounts);
        if (!selectedAccountId && nextAccounts[0]) {
          setSelectedAccountId(nextAccounts[0].id);
        }
      }
      if (analysisReportsResponse.status === "fulfilled" && analysisReportsResponse.value.ok) {
        setAnalysisReports((await analysisReportsResponse.value.json()) as AnalysisReportRecord[]);
      }
      if (postPerformanceResponse.status === "fulfilled" && postPerformanceResponse.value.ok) {
        setPostPerformance((await postPerformanceResponse.value.json()) as PostPerformanceRecord[]);
      }
      if (learningProfileResponse.status === "fulfilled" && learningProfileResponse.value.ok) {
        setLearningProfile((await learningProfileResponse.value.json()) as LearningProfileSummary | null);
      }
      if (aiSettingsResponse.status === "fulfilled" && aiSettingsResponse.value.ok) {
        const nextAISettings = (await aiSettingsResponse.value.json()) as AIProviderSettingSummary[];
        setAISettings(nextAISettings);
      }
      if (promptTemplatesResponse.status === "fulfilled" && promptTemplatesResponse.value.ok) {
        const nextTemplates = (await promptTemplatesResponse.value.json()) as PromptTemplateSummary[];
        setPromptTemplates(nextTemplates);
        const initialTemplate = nextTemplates.find((item) => item.kind === "base") ?? nextTemplates[0];
        if (initialTemplate) {
          setPromptKind(initialTemplate.kind);
          setPromptTitle(initialTemplate.title);
          setPromptContent(initialTemplate.content);
        }
      }
      if (mentionsResponse.status === "fulfilled" && mentionsResponse.value.ok) {
        setMentions((await mentionsResponse.value.json()) as MentionRecord[]);
      }
      if (fixedReplyRulesResponse.status === "fulfilled" && fixedReplyRulesResponse.value.ok) {
        const nextRules = (await fixedReplyRulesResponse.value.json()) as FixedReplyRuleSummary[];
        setFixedReplyRules(nextRules);
        const initialRule = nextRules[0];
        if (initialRule) {
          setFixedPostId(initialRule.fixedPostId);
          setFixedPostText(initialRule.fixedPostText);
          setFixedTriggerPhrase(initialRule.triggerPhrase ?? "");
          setFixedRequireLike(initialRule.requireLike);
          setFixedRequireRetweet(initialRule.requireRetweet);
          setFixedRequireFollow(initialRule.requireFollow);
          setFixedActiveFrom(toDatetimeLocalValue(initialRule.activeFrom ?? null));
          setFixedActiveTo(toDatetimeLocalValue(initialRule.activeTo ?? null));
          setFixedMaxRepliesPerAuthorPerDay(String(initialRule.maxRepliesPerAuthorPerDay));
          setFixedExcludedUserIds(initialRule.excludedUserIds.join(","));
          setFixedPriority(String(initialRule.priority));
          setFixedReplyTemplate(initialRule.replyTemplate);
          setFixedIncludeAuthorId(initialRule.includeAuthorId);
          setFixedIncludeAuthorHandle(initialRule.includeAuthorHandle);
        }
      }
      if (xCredentialResponse.status === "fulfilled" && xCredentialResponse.value.ok) {
        const nextCredential = (await xCredentialResponse.value.json()) as XAppCredentialSummary | null;
        setXCredential(nextCredential);
        if (nextCredential) {
          setXClientId(nextCredential.clientId);
          setXRedirectUri(nextCredential.redirectUri);
          setXScopes(nextCredential.scopes);
        }
      }
      if (notificationEndpointsResponse.status === "fulfilled" && notificationEndpointsResponse.value.ok) {
        const nextEndpoints = (await notificationEndpointsResponse.value.json()) as NotificationEndpointSummary[];
        setNotificationEndpoints(nextEndpoints);
        if (nextEndpoints[0]) {
          setNotificationName(nextEndpoints[0].name);
          setNotificationEvents(nextEndpoints[0].events.join(","));
          setNotificationRepeatIntervalMinutes(String(nextEndpoints[0].repeatIntervalMinutes));
          setNotificationFailureThresholdCount(String(nextEndpoints[0].failureThresholdCount));
        }
      }
      if (notificationPresetsResponse.status === "fulfilled" && notificationPresetsResponse.value.ok) {
        setNotificationPresets((await notificationPresetsResponse.value.json()) as Array<{ id: string; label: string; events: string[] }>);
      }
      if (workspaceUsersResponse.status === "fulfilled" && workspaceUsersResponse.value.ok) {
        setWorkspaceUsers((await workspaceUsersResponse.value.json()) as WorkspaceUserSummary[]);
      }
      if (billingSummaryResponse.status === "fulfilled" && billingSummaryResponse.value.ok) {
        const nextBillingSummary = (await billingSummaryResponse.value.json()) as WorkspaceBillingSummary;
        setBillingSummary(nextBillingSummary);
        setBillingPlanTier(nextBillingSummary.settings.planTier);
        setBillingActive(nextBillingSummary.settings.isBillingActive);
        setBillingMonthlyPriceJpy(String(nextBillingSummary.settings.monthlyPriceJpy));
        setBillingMaxXAccounts(String(nextBillingSummary.settings.maxXAccounts));
        setBillingMaxMonthlyContentJobs(String(nextBillingSummary.settings.maxMonthlyContentJobs));
        setBillingMaxMonthlyAiGenerations(String(nextBillingSummary.settings.maxMonthlyAiGenerations));
        setBillingMaxMonthlyMentionSyncs(String(nextBillingSummary.settings.maxMonthlyMentionSyncs));
      }
      const meResponse = await authFetch(`${apiBaseUrl}/auth/session/me`);
      if (meResponse.ok) {
        setSessionUser((await meResponse.json()) as WorkspaceUserSummary | null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, selectedAccountId, sessionToken]);

  const queue = overview.queue;
  const kpi = [
    { label: "承認待ち", value: String(queue.filter((item) => item.status === "awaiting_approval").length), tone: "bg-[#fff3e7]" },
    { label: "キュー済み", value: String(queue.filter((item) => item.status === "queued" || item.status === "scheduled").length), tone: "bg-[#edf7f5]" },
    { label: "返信候補", value: String(queue.filter((item) => item.kind === "reply").length), tone: "bg-[#fff3e7]" },
    { label: "再審査対象", value: String(queue.filter((item) => item.status === "failed").length), tone: "bg-[#edf7f5]" },
  ] as const;
  const latestAnalytics = analytics.at(-1);
  const reviewQueue = queue.filter((item) => item.status === "failed" || item.status === "awaiting_approval");
  const awaitingApprovalQueue = reviewQueue.filter((item) => item.status === "awaiting_approval");
  const role = sessionUser?.role ?? null;
  const canManageWorkspace = role === "owner" || role === "admin";
  const canEditContent = canManageWorkspace || role === "editor";
  const canReviewContent = canManageWorkspace || role === "reviewer";
  const canGenerateReply = canEditContent || canReviewContent;
  const canEditPrompts = canManageWorkspace || role === "editor";
  const scheduledJobs = queue.filter((item) => item.scheduledAt);
  const scheduledJobMap = scheduledJobs.reduce<Record<string, ContentJob[]>>((accumulator, job) => {
    const key = toDateKey(new Date(job.scheduledAt as string));
    accumulator[key] = [...(accumulator[key] ?? []), job];
    return accumulator;
  }, {});
  const calendarDays =
    calendarView === "month"
      ? (() => {
          const monthStart = startOfMonth(calendarCursor);
          const monthEnd = endOfMonth(calendarCursor);
          const gridStart = startOfWeek(monthStart);
          const gridEnd = addDays(startOfWeek(monthEnd), 6);
          const days: Date[] = [];
          for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
            days.push(new Date(cursor));
          }
          return days;
        })()
      : (() => {
          const weekStart = startOfWeek(calendarCursor);
          return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
        })();

  function prependJob(job: ContentJob) {
    setOverview((current) => ({
      ...current,
      queue: [job, ...current.queue].slice(0, 20),
    }));
  }

  function applyUpdatedJob(updated: ContentJob) {
    setOverview((current) => ({
      ...current,
      queue: current.queue.map((item) => (item.id === updated.id ? updated : item)),
    }));
  }

  function beginEditJob(job: ContentJob) {
    setEditingJobId(job.id);
    setEditBody(job.body);
    setEditScheduledAt(toDatetimeLocalValue(job.scheduledAt));
  }

  function cancelEditJob() {
    setEditingJobId(null);
    setEditBody("");
    setEditScheduledAt("");
  }

  async function saveBillingSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpdateWorkspaceBillingInput = {
        planTier: billingPlanTier,
        isBillingActive: billingActive,
        monthlyPriceJpy: Number(billingMonthlyPriceJpy) || 0,
        maxXAccounts: Number(billingMaxXAccounts) || 1,
        maxMonthlyContentJobs: Number(billingMaxMonthlyContentJobs) || 1,
        maxMonthlyAiGenerations: Number(billingMaxMonthlyAiGenerations) || 1,
        maxMonthlyMentionSyncs: Number(billingMaxMonthlyMentionSyncs) || 1,
      };
      const saveResponse = await authFetch(`${apiBaseUrl}/billing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!saveResponse.ok) {
        throw new Error((await saveResponse.text()) || "billing 設定の保存に失敗しました");
      }
      const summaryResponse = await authFetch(`${apiBaseUrl}/billing/summary`, { cache: "no-store" });
      if (summaryResponse.ok) {
        setBillingSummary((await summaryResponse.json()) as WorkspaceBillingSummary);
      }
      setNotice("billing 設定を保存しました");
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : "billing 設定の保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function submitJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const payload: CreateContentJobInput = {
      body,
      kind,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };

    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, xAccountId: selectedAccountId || undefined }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "投稿の作成に失敗しました");
        }
        prependJob((await response.json()) as ContentJob);
        setBody("");
        setScheduledAt("");
        setNotice("ジョブを作成しました");
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "投稿の作成に失敗しました");
      }
    });
  }

  async function generateDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/ai/generate-post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xAccountId: selectedAccountId || undefined,
            topic: draftTopic,
            tone: draftTone,
            goal: draftGoal,
            scheduledAt: draftScheduledAt ? new Date(draftScheduledAt).toISOString() : null,
          }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "AI下書き生成に失敗しました");
        }
        const generated = (await response.json()) as GeneratePostDraftResult;
        prependJob(generated.job);
        setDraftTopic("");
        setDraftScheduledAt("");
        setNotice(`AI下書きを作成しました (${generated.provider} / ${generated.model})`);
      } catch (generationError) {
        setError(generationError instanceof Error ? generationError.message : "AI下書き生成に失敗しました");
      }
    });
  }

  async function generateReplyDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const payload: GenerateReplyDraftInput = {
          xAccountId: selectedAccountId || undefined,
          sourceText: replySourceText,
          tone: replyTone,
          goal: replyGoal,
        };
        const response = await authFetch(`${apiBaseUrl}/ai/generate-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "AI返信下書き生成に失敗しました");
        }
        const generated = (await response.json()) as GeneratePostDraftResult;
        prependJob(generated.job);
        setReplySourceText("");
        setNotice(`AI返信下書きを作成しました (${generated.provider} / ${generated.model})`);
      } catch (generationError) {
        setError(generationError instanceof Error ? generationError.message : "AI返信下書き生成に失敗しました");
      }
    });
  }

  async function saveXCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpsertXAppCredentialInput = {
        clientId: xClientId,
        clientSecret: xClientSecret || undefined,
        redirectUri: xRedirectUri,
        scopes: xScopes,
        isActive: true,
      };
      const response = await authFetch(`${apiBaseUrl}/auth/x/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "X認証設定の保存に失敗しました");
      }
      setXCredential((await response.json()) as XAppCredentialSummary);
      setXClientSecret("");
      setNotice("X認証設定を保存しました");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "X認証設定の保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function saveAISettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpsertAIProviderSettingInput = {
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel,
        systemPrompt: aiSystemPrompt,
        isActive: true,
      };
      const response = await authFetch(withAccount("/ai/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "AI設定の保存に失敗しました");
      }
      const saved = (await response.json()) as AIProviderSettingSummary;
      setAISettings((current) => [saved, ...current.filter((item) => item.provider !== saved.provider).map((item) => ({ ...item, isActive: false }))]);
      setAIApiKey("");
      setNotice("AI設定を保存しました");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "AI設定の保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function savePromptTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpsertPromptTemplateInput = {
        kind: promptKind,
        title: promptTitle,
        content: promptContent,
        isActive: true,
      };
      const response = await authFetch(withAccount("/ai/prompt-templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "Prompt template の保存に失敗しました");
      }
      const saved = (await response.json()) as PromptTemplateSummary;
      setPromptTemplates((current) => [saved, ...current.filter((item) => item.kind !== saved.kind)]);
      setNotice("Prompt template を保存しました");
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : "Prompt template の保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function saveNotificationEndpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpsertNotificationEndpointInput = {
        name: notificationName,
        webhookUrl: notificationWebhookUrl,
        events: notificationEvents.split(",").map((item) => item.trim()).filter(Boolean),
        repeatIntervalMinutes: Number(notificationRepeatIntervalMinutes) || 0,
        failureThresholdCount: Number(notificationFailureThresholdCount) || 1,
        isActive: true,
      };
      const response = await authFetch(`${apiBaseUrl}/notifications/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "通知設定の保存に失敗しました");
      }
      const saved = (await response.json()) as NotificationEndpointSummary;
      setNotificationEndpoints([saved]);
      setNotificationWebhookUrl("");
      setNotice("通知設定を保存しました");
    } catch (notificationError) {
      setError(notificationError instanceof Error ? notificationError.message : "通知設定の保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function saveFixedReplyRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpsertFixedReplyRuleInput = {
        xAccountId: selectedAccountId,
        fixedPostId,
        fixedPostText,
        triggerPhrase: fixedTriggerPhrase || undefined,
        requireLike: fixedRequireLike,
        requireRetweet: fixedRequireRetweet,
        requireFollow: fixedRequireFollow,
        activeFrom: fixedActiveFrom ? new Date(fixedActiveFrom).toISOString() : null,
        activeTo: fixedActiveTo ? new Date(fixedActiveTo).toISOString() : null,
        maxRepliesPerAuthorPerDay: Number(fixedMaxRepliesPerAuthorPerDay) || 1,
        excludedUserIds: fixedExcludedUserIds.split(",").map((item) => item.trim()).filter(Boolean),
        replyTemplate: fixedReplyTemplate,
        priority: Number(fixedPriority) || 0,
        includeAuthorId: fixedIncludeAuthorId,
        includeAuthorHandle: fixedIncludeAuthorHandle,
        isActive: true,
      };
      const response = await authFetch(`${apiBaseUrl}/automation/fixed-reply-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "固定返信ルールの保存に失敗しました");
      }
      const saved = (await response.json()) as FixedReplyRuleSummary;
      setFixedReplyRules((current) => [saved, ...current.filter((item) => item.id !== saved.id && item.fixedPostId !== saved.fixedPostId)]);
      setNotice("固定返信ルールを保存しました");
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "固定返信ルールの保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function saveAutomationPolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);

    try {
      const payload: UpdateAutomationPolicyInput = {
        approvalMode: approvalModeSetting,
        autoReplyEnabled: autoReplyEnabledSetting,
        autoPostEnabled: autoPostEnabledSetting,
        autoReplyPaused,
        autoReplyPauseReason: autoReplyPauseReason || null,
        autoReplyCooldownUntil: autoReplyCooldownUntil ? new Date(autoReplyCooldownUntil).toISOString() : null,
        maxAutoRepliesPerHour: Number(maxAutoRepliesPerHour) || 20,
        maxAutoRepliesPerDay: Number(maxAutoRepliesPerDay) || 100,
        maxConsecutiveAutoReplies: Number(maxConsecutiveAutoReplies) || 10,
        spikeLimit10Minutes: Number(spikeLimit10Minutes) || 15,
      };
      const response = await authFetch(withAccount("/automation/policy"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "自動返信ポリシーの保存に失敗しました");
      }
      const policy = (await response.json()) as AutomationOverview["policy"];
      setOverview((current) => ({ ...current, policy }));
      setNotice("自動返信ポリシーを保存しました");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : "自動返信ポリシーの保存に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function duplicateFixedReplyRule(ruleId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/fixed-reply-rules/${ruleId}/duplicate`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "ルール複製に失敗しました");
        }
        const duplicated = (await response.json()) as FixedReplyRuleSummary;
        setFixedReplyRules((current) => [duplicated, ...current]);
        setNotice("固定返信ルールを複製しました");
      } catch (ruleError) {
        setError(ruleError instanceof Error ? ruleError.message : "ルール複製に失敗しました");
      }
    });
  }

  async function deleteFixedReplyRule(ruleId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/fixed-reply-rules/${ruleId}/delete`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "ルール削除に失敗しました");
        }
        setFixedReplyRules((current) => current.filter((item) => item.id !== ruleId));
        setNotice("固定返信ルールを削除しました");
      } catch (ruleError) {
        setError(ruleError instanceof Error ? ruleError.message : "ルール削除に失敗しました");
      }
    });
  }

  async function toggleFixedReplyRule(ruleId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/fixed-reply-rules/${ruleId}/toggle`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "ルール切替に失敗しました");
        }
        const updated = (await response.json()) as FixedReplyRuleSummary;
        setFixedReplyRules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setNotice("固定返信ルールの状態を更新しました");
      } catch (ruleError) {
        setError(ruleError instanceof Error ? ruleError.message : "ルール切替に失敗しました");
      }
    });
  }

  async function reorderFixedReplyRule(ruleId: string, direction: "up" | "down") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/fixed-reply-rules/${ruleId}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "ルール並び替えに失敗しました");
        }
        setFixedReplyRules((await response.json()) as FixedReplyRuleSummary[]);
        setNotice("固定返信ルールの順序を更新しました");
      } catch (ruleError) {
        setError(ruleError instanceof Error ? ruleError.message : "ルール並び替えに失敗しました");
      }
    });
  }

  async function loadAuditLogs(query?: AuditLogQuery) {
    const params = new URLSearchParams();
    if (query?.eventType) {
      params.set("eventType", query.eventType);
    }
    if (query?.search) {
      params.set("search", query.search);
    }

    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const response = await authFetch(`${apiBaseUrl}/audit/logs${suffix}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error((await response.text()) || "監査ログの取得に失敗しました");
    }
    setAuditLogs((await response.json()) as AuditLogRecord[]);
  }

  async function applyAuditFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await loadAuditLogs({
        eventType: auditEventType || undefined,
        search: auditSearch || undefined,
      });
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "監査ログの取得に失敗しました");
    }
  }

  async function sendTestNotification() {
    setError(null);
    setNotice(null);
    setSettingsPending(true);
    try {
      const payload: NotificationTestInput = {
        title: "Test Notification",
        message: "Oku からのテスト通知です",
      };
      const response = await authFetch(`${apiBaseUrl}/notifications/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "通知テストに失敗しました");
      }
      setNotice("テスト通知を送信しました");
    } catch (notificationError) {
      setError(notificationError instanceof Error ? notificationError.message : "通知テストに失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function loadPromptPreview(kind: "post" | "reply") {
    setError(null);
    setNotice(null);

    try {
      const response = await authFetch(`${apiBaseUrl}/ai/prompt-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          topic: draftTopic || "新機能リリース",
          tone: draftTone || "簡潔で信頼感のあるトーン",
          goal: draftGoal || "サービス理解を深めてもらう",
        }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "Prompt preview の取得に失敗しました");
      }
      setPromptPreview((await response.json()) as PromptPreviewResult);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Prompt preview の取得に失敗しました");
    }
  }

  function handlePromptKindChange(nextKind: PromptTemplateKind) {
    setPromptKind(nextKind);
    const template = promptTemplates.find((item) => item.kind === nextKind);
    if (template) {
      setPromptTitle(template.title);
      setPromptContent(template.content);
    } else {
      setPromptTitle("");
      setPromptContent("");
    }
  }

  async function beginXConnect() {
    setError(null);
    setNotice(null);
    setConnectPending(true);

    try {
      const response = await authFetch(`${apiBaseUrl}/auth/x/connect-url`);
      if (!response.ok) {
        throw new Error((await response.text()) || "X接続URLの取得に失敗しました");
      }
      const payload = (await response.json()) as { authorizeUrl: string };
      window.location.href = payload.authorizeUrl;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "X接続URLの取得に失敗しました");
    } finally {
      setConnectPending(false);
    }
  }

  async function decideApproval(jobId: string, decision: ApprovalDecisionInput["decision"]) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/${jobId}/approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note: approvalNote || undefined }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "承認操作に失敗しました");
        }
        applyUpdatedJob((await response.json()) as ContentJob);
        setApprovalNote("");
        setNotice(decision === "approve" ? "ジョブを承認しました" : "ジョブを差し戻しました");
      } catch (approvalError) {
        setError(approvalError instanceof Error ? approvalError.message : "承認操作に失敗しました");
      }
    });
  }

  async function decideApprovalsBatch(decision: ApprovalDecisionInput["decision"]) {
    if (selectedApprovalJobIds.length === 0) {
      return;
    }

    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/approval/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobIds: selectedApprovalJobIds,
            decision,
            note: approvalNote || undefined,
          }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "一括承認操作に失敗しました");
        }
        const updatedJobs = (await response.json()) as ContentJob[];
        setOverview((current) => ({
          ...current,
          queue: current.queue.map((item) => updatedJobs.find((job) => job.id === item.id) ?? item),
        }));
        setSelectedApprovalJobIds([]);
        setApprovalNote("");
        setNotice(decision === "approve" ? "選択したジョブを一括承認しました" : "選択したジョブを一括差し戻ししました");
      } catch (approvalError) {
        setError(approvalError instanceof Error ? approvalError.message : "一括承認操作に失敗しました");
      }
    });
  }

  async function syncMentions() {
    setError(null);
    setNotice(null);
    setConnectPending(true);
    try {
      const response = await authFetch(withAccount("/automation/mentions/sync"), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "mentions の同期に失敗しました");
      }
      const payload = (await response.json()) as { imported: number; mentions: MentionRecord[] };
      setMentions(payload.mentions);
      setNotice(`${payload.imported}件の mention を同期しました`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "mentions の同期に失敗しました");
    } finally {
      setConnectPending(false);
    }
  }

  async function generateReplyFromMention(mentionId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/mentions/${mentionId}/generate-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xAccountId: selectedAccountId || undefined,
            tone: replyTone,
            goal: replyGoal,
          }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "mention からの返信生成に失敗しました");
        }
        const job = (await response.json()) as ContentJob;
        prependJob(job);
        setNotice("mention から返信下書きを作成しました");
      } catch (replyError) {
        setError(replyError instanceof Error ? replyError.message : "mention からの返信生成に失敗しました");
      }
    });
  }

  async function sendContentJob(jobId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/${jobId}/send`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "送信に失敗しました");
        }
        const payload = (await response.json()) as { job: ContentJob; sentPostId: string };
        applyUpdatedJob(payload.job);
        setNotice(`Xへ送信しました: ${payload.sentPostId}`);
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : "送信に失敗しました");
      }
    });
  }

  async function retryContentJob(jobId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/${jobId}/retry`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "再投入に失敗しました");
        }
        applyUpdatedJob((await response.json()) as ContentJob);
        setNotice("ジョブを再投入しました");
      } catch (retryError) {
        setError(retryError instanceof Error ? retryError.message : "再投入に失敗しました");
      }
    });
  }

  async function reopenFailedJob(jobId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/${jobId}/reopen`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "再審査への戻しに失敗しました");
        }
        applyUpdatedJob((await response.json()) as ContentJob);
        setNotice("ジョブを再審査キューに戻しました");
      } catch (reopenError) {
        setError(reopenError instanceof Error ? reopenError.message : "再審査への戻しに失敗しました");
      }
    });
  }

  async function collectAnalytics() {
    setError(null);
    setNotice(null);
    setConnectPending(true);
    try {
      const response = await authFetch(withAccount("/analytics/collect"), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "分析収集に失敗しました");
      }
      const payload = (await response.json()) as AnalyticsCollectResult;
      setAnalytics(payload.snapshots);
      setNotice(`${payload.collected}件のアカウントで分析を更新しました`);
    } catch (analyticsError) {
      setError(analyticsError instanceof Error ? analyticsError.message : "分析収集に失敗しました");
    } finally {
      setConnectPending(false);
    }
  }

  async function analyzeOwnHistory() {
    setError(null);
    setNotice(null);
    setConnectPending(true);
    try {
      const response = await authFetch(withAccount("/analytics/learn"), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "過去投稿の分析に失敗しました");
      }
      setOwnAnalysis((await response.json()) as TimelineAnalysisResult);
      const [reportsResponse, profileResponse] = await Promise.all([
        authFetch(withAccount("/analytics/reports"), { cache: "no-store" }),
        authFetch(withAccount("/analytics/learning-profile"), { cache: "no-store" }),
      ]);
      if (reportsResponse.ok) {
        setAnalysisReports((await reportsResponse.json()) as AnalysisReportRecord[]);
      }
      if (profileResponse.ok) {
        setLearningProfile((await profileResponse.json()) as LearningProfileSummary | null);
      }
      setNotice("過去投稿から運用パターンを分析しました");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "過去投稿の分析に失敗しました");
    } finally {
      setConnectPending(false);
    }
  }

  async function analyzeCompetitor() {
    setError(null);
    setNotice(null);
    setConnectPending(true);
    try {
      const response = await authFetch(withAccount("/analytics/competitor"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: competitorHandle }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "競合分析に失敗しました");
      }
      setCompetitorAnalysis((await response.json()) as TimelineAnalysisResult);
      const reportsResponse = await authFetch(withAccount("/analytics/reports"), { cache: "no-store" });
      if (reportsResponse.ok) {
        setAnalysisReports((await reportsResponse.json()) as AnalysisReportRecord[]);
      }
      setNotice("競合アカウントを分析しました");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "競合分析に失敗しました");
    } finally {
      setConnectPending(false);
    }
  }

  async function saveEditedJob(jobId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const payload: UpdateContentJobInput = {
          body: editBody,
          scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
        };
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "ジョブ更新に失敗しました");
        }
        applyUpdatedJob((await response.json()) as ContentJob);
        cancelEditJob();
        setNotice("ジョブを更新しました");
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "ジョブ更新に失敗しました");
      }
    });
  }

  async function loginWorkspaceUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);
    try {
      const response = await authFetch(`${apiBaseUrl}/auth/session/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "ログインに失敗しました");
      }
      const payload = (await response.json()) as { token: string; user: WorkspaceUserSummary };
      window.localStorage.setItem("oku_session_token", payload.token);
      setSessionUser(payload.user);
      setLoginPassword("");
      setNotice("workspace user としてログインしました");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function createWorkspaceUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSettingsPending(true);
    try {
      const response = await authFetch(`${apiBaseUrl}/auth/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail,
          displayName: newUserDisplayName,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "ユーザー作成に失敗しました");
      }
      const created = (await response.json()) as WorkspaceUserSummary;
      setWorkspaceUsers((current) => [...current, created]);
      setNewUserEmail("");
      setNewUserDisplayName("");
      setNewUserPassword("");
      setNotice("workspace user を作成しました");
    } catch (userError) {
      setError(userError instanceof Error ? userError.message : "ユーザー作成に失敗しました");
    } finally {
      setSettingsPending(false);
    }
  }

  async function updateWorkspaceUserRole(userId: string, role: UserRole) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/auth/users/${userId}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "role 更新に失敗しました");
        }
        const updated = (await response.json()) as WorkspaceUserSummary;
        setWorkspaceUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setNotice("role を更新しました");
      } catch (userError) {
        setError(userError instanceof Error ? userError.message : "role 更新に失敗しました");
      }
    });
  }

  async function runDispatchNow() {
    setError(null);
    setNotice(null);
    setConnectPending(true);
    try {
      const response = await authFetch(`${apiBaseUrl}/automation/dispatch/run`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "手動 dispatch に失敗しました");
      }
      const result = (await response.json()) as string[];
      const [opsResponse, overviewResponse] = await Promise.all([
        authFetch(withAccount("/automation/operations"), { cache: "no-store" }),
        authFetch(withAccount("/automation/overview"), { cache: "no-store" }),
      ]);
      if (opsResponse.ok) {
        setOperationsOverview((await opsResponse.json()) as OperationsOverview);
      }
      if (overviewResponse.ok) {
        setOverview((await overviewResponse.json()) as AutomationOverview);
      }
      setNotice(`手動 dispatch を実行しました (${result.length}件)`);
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "手動 dispatch に失敗しました");
    } finally {
      setConnectPending(false);
    }
  }

  async function unlockStuckJob(jobId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await authFetch(`${apiBaseUrl}/automation/content-jobs/${jobId}/unlock`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "stuck job の解除に失敗しました");
        }
        const updatedJob = (await response.json()) as ContentJob;
        applyUpdatedJob(updatedJob);
        const opsResponse = await authFetch(withAccount("/automation/operations"), { cache: "no-store" });
        if (opsResponse.ok) {
          setOperationsOverview((await opsResponse.json()) as OperationsOverview);
        }
        setNotice("stuck job を解除しました");
      } catch (unlockError) {
        setError(unlockError instanceof Error ? unlockError.message : "stuck job の解除に失敗しました");
      }
    });
  }

  function jumpCalendar(direction: "prev" | "next") {
    setCalendarCursor((current) =>
      calendarView === "month"
        ? new Date(current.getFullYear(), current.getMonth() + (direction === "next" ? 1 : -1), 1)
        : addDays(current, direction === "next" ? 7 : -7),
    );
  }

  function useCalendarSlot(date: Date) {
    const next = new Date(date);
    next.setHours(10, 0, 0, 0);
    setScheduledAt(toDatetimeLocalValue(next.toISOString()));
  }

  return (
    <main className="px-5 py-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        <section className={`${panelClassName} backdrop-blur-md`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-sm text-[var(--muted)]">X automation workspace</p>
              <h1 className="mt-2 text-4xl font-semibold">Oku Admin</h1>
              <p className="mt-3 leading-7">
                投稿、返信、分析、下書き生成を一画面で扱うための運用コックピットです。現在は1アカウント向けですが、構造は複数アカウント前提です。
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <select
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  className="min-w-48 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} ({account.handle})
                    </option>
                  ))}
                </select>
                {canManageWorkspace ? (
                  <button type="button" onClick={() => void beginXConnect()} disabled={connectPending} className="rounded-full bg-[#1f1d1a] px-4 py-3 text-sm font-medium text-[#fffaf2] transition enabled:hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                    {connectPending ? "接続先を準備中..." : "Xアカウントを接続"}
                  </button>
                ) : null}
                {canEditContent ? (
                  <button type="button" onClick={() => void syncMentions()} disabled={connectPending} className="rounded-full border border-[var(--line)] px-4 py-3 text-sm transition enabled:hover:bg-[var(--surface-strong)] disabled:cursor-wait disabled:opacity-60">
                    {connectPending ? "同期中..." : "mentions を同期"}
                  </button>
                ) : null}
              </div>
              {xCredential ? <div className="mt-3 text-sm text-[var(--muted)]">X client: {xCredential.clientId}</div> : null}
              {sessionUser ? <div className="mt-3 text-sm text-[var(--muted)]">logged in as {sessionUser.displayName} / role: {sessionUser.role}</div> : null}
            </div>
            <div className="min-w-64 rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
              <div className="text-sm text-[var(--muted)]">接続アカウント</div>
              <div className="mt-2 text-2xl">{overview.account?.displayName ?? "未接続"}</div>
              <div className="mt-1">{overview.account?.handle ?? "-"}</div>
              <div className="mt-3 text-[var(--accent-2)]">Status: {overview.account?.status ?? "disconnected"}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpi.map((item) => (
            <article key={item.label} className={`${item.tone} rounded-[22px] border border-[var(--line)] p-5`}>
              <div className="text-sm text-[var(--muted)]">{item.label}</div>
              <div className="mt-3 text-[34px]">{item.value}</div>
            </article>
          ))}
        </section>

        {notice ? <div className="text-sm text-[var(--accent-2)]">{notice}</div> : null}
        {error ? <div className="text-sm text-[#b42318]">{error}</div> : null}

        <section className={panelClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">投稿カレンダー</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">予約済みジョブを日付ベースで確認し、日付クリックで新規ジョブの予約時刻に反映できます。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCalendarView("month")} className={`rounded-full px-3 py-2 text-sm ${calendarView === "month" ? "bg-[var(--accent)] text-[#fffaf2]" : "border border-[var(--line)]"}`}>
                月
              </button>
              <button type="button" onClick={() => setCalendarView("week")} className={`rounded-full px-3 py-2 text-sm ${calendarView === "week" ? "bg-[var(--accent)] text-[#fffaf2]" : "border border-[var(--line)]"}`}>
                週
              </button>
              <button type="button" onClick={() => jumpCalendar("prev")} className="rounded-full border border-[var(--line)] px-3 py-2 text-sm">
                前へ
              </button>
              <div className="min-w-28 text-center text-sm text-[var(--muted)]">
                {calendarCursor.getFullYear()}年{calendarCursor.getMonth() + 1}月
              </div>
              <button type="button" onClick={() => jumpCalendar("next")} className="rounded-full border border-[var(--line)] px-3 py-2 text-sm">
                次へ
              </button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-7 gap-2 text-xs text-[var(--muted)]">
            {["日", "月", "火", "水", "木", "金", "土"].map((label) => (
              <div key={label} className="px-2 py-1">{label}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const key = toDateKey(day);
              const items = scheduledJobMap[key] ?? [];
              const inCurrentMonth = day.getMonth() === calendarCursor.getMonth();
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => useCalendarSlot(day)}
                  className={`min-h-28 rounded-[18px] border p-3 text-left transition hover:border-[var(--accent)] ${inCurrentMonth ? "border-[var(--line)] bg-[var(--surface-strong)]" : "border-[var(--line)] bg-[var(--surface)] opacity-60"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{day.getDate()}</span>
                    <span className="text-[11px] text-[var(--muted)]">{items.length}件</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {items.slice(0, 3).map((job) => (
                      <div key={job.id} className="rounded-2xl bg-[#f6ead8] px-2.5 py-2 text-xs">
                        <div>{job.kind === "post" ? "投稿" : "返信"} / {job.status}</div>
                        <div className="mt-1 truncate">{job.body}</div>
                      </div>
                    ))}
                    {items.length > 3 ? <div className="text-[11px] text-[var(--muted)]">+{items.length - 3} more</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className={panelClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">運用監視</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">詰まった job、最近の失敗、mention 同期状態を確認し、必要なら手動 dispatch や解除を行います。</p>
            </div>
            {canEditContent ? (
              <button type="button" onClick={() => void runDispatchNow()} disabled={connectPending} className="rounded-full border border-[var(--line)] px-4 py-3 text-sm disabled:cursor-wait disabled:opacity-60">
                {connectPending ? "実行中..." : "手動 dispatch"}
              </button>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-sm text-[var(--muted)]">Queue depth</div>
              <div className="mt-2 text-3xl">{operationsOverview?.queueDepth ?? 0}</div>
            </div>
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-sm text-[var(--muted)]">承認待ち</div>
              <div className="mt-2 text-3xl">{operationsOverview?.awaitingApprovalCount ?? 0}</div>
            </div>
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-sm text-[var(--muted)]">stuck processing</div>
              <div className="mt-2 text-3xl">{operationsOverview?.stuckProcessingJobs.length ?? 0}</div>
            </div>
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-sm text-[var(--muted)]">recent failed</div>
              <div className="mt-2 text-3xl">{operationsOverview?.recentFailedJobs.length ?? 0}</div>
            </div>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-sm font-medium">同期状態</div>
              <div className="mt-3 grid gap-1 text-sm text-[var(--muted)]">
                <div>last sync: {operationsOverview?.syncState?.lastSyncedAt ? toDatetimeLocalValue(operationsOverview.syncState.lastSyncedAt) : "-"}</div>
                <div>rate limited until: {operationsOverview?.syncState?.rateLimitedUntil ? toDatetimeLocalValue(operationsOverview.syncState.rateLimitedUntil) : "-"}</div>
                <div>last mention id: {operationsOverview?.syncState?.lastMentionId ?? "-"}</div>
                <div>next token: {operationsOverview?.syncState?.nextPaginationToken ?? "-"}</div>
              </div>
            </div>
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-sm font-medium">stuck jobs</div>
              <div className="mt-3 grid gap-2.5 text-sm">
                {(operationsOverview?.stuckProcessingJobs ?? []).length > 0 ? (operationsOverview?.stuckProcessingJobs ?? []).map((job) => (
                  <div key={job.id} className="rounded-2xl border border-[var(--line)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{job.kind === "post" ? "投稿" : "返信"}</strong>
                      {canEditContent ? (
                        <button type="button" disabled={isPending} onClick={() => void unlockStuckJob(job.id)} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs disabled:cursor-wait disabled:opacity-60">
                          解除
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2">{job.body}</div>
                  </div>
                )) : <div className="text-[var(--muted)]">詰まっている job はありません。</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[1.3fr_0.9fr]">
          <article className={panelClassName}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">コンテンツキュー</h2>
              <div className="text-sm text-[var(--muted)]">
                {overview.policy?.approvalMode === "manual" ? "手動承認モード" : "自動承認モード"}
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {queue.length > 0 ? queue.map((job) => (
                <div key={job.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="flex flex-wrap justify-between gap-3">
                    <strong>{job.kind === "post" ? "投稿" : "返信"}</strong>
                    <span className="text-sm text-[var(--muted)]">{job.status}</span>
                  </div>
                  {editingJobId === job.id ? (
                    <div className="mt-3 grid gap-3">
                      <textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} rows={4} className={`${inputClassName} resize-y`} />
                      <input type="datetime-local" value={editScheduledAt} onChange={(event) => setEditScheduledAt(event.target.value)} className={inputClassName} />
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 leading-7">{job.body}</p>
                      <div className="text-sm text-[var(--muted)]">
                        実行予定: {job.scheduledAt ? toDatetimeLocalValue(job.scheduledAt) : "即時 or イベント駆動"}
                      </div>
                    </>
                  )}
                  {job.retryCount ? (
                    <div className="mt-2 text-sm text-[var(--muted)]">
                      retry: {job.retryCount}
                      {job.lastError ? ` / error: ${job.lastError}` : ""}
                    </div>
                  ) : null}
                  {(job.status === "queued" || job.status === "scheduled") ? (
                    <div className="mt-4">
                      {canEditContent ? (
                        <button type="button" disabled={isPending} onClick={() => void sendContentJob(job.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                          Xへ送信
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {job.status === "awaiting_approval" && canReviewContent ? (
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <button type="button" disabled={isPending} onClick={() => void decideApproval(job.id, "approve")} className="rounded-full bg-[var(--accent-2)] px-3.5 py-2.5 text-sm text-[#fffaf2] disabled:cursor-wait disabled:opacity-60">
                        承認
                      </button>
                      <button type="button" disabled={isPending} onClick={() => void decideApproval(job.id, "reject")} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        差し戻し
                      </button>
                    </div>
                  ) : null}
                  {(job.status === "failed" || job.status === "draft" || job.status === "awaiting_approval") && (canEditContent || canReviewContent) ? (
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {editingJobId === job.id ? (
                        <>
                          <button type="button" disabled={isPending} onClick={() => void saveEditedJob(job.id)} className="rounded-full bg-[#1f1d1a] px-3.5 py-2.5 text-sm text-[#fffaf2] disabled:cursor-wait disabled:opacity-60">
                            保存
                          </button>
                          <button type="button" disabled={isPending} onClick={cancelEditJob} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <button type="button" disabled={isPending} onClick={() => beginEditJob(job)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                          本文を編集
                        </button>
                      )}
                    </div>
                  ) : null}
                  {job.status === "failed" && canEditContent ? (
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      <button type="button" disabled={isPending} onClick={() => void reopenFailedJob(job.id)} className="rounded-full bg-[var(--accent-2)] px-3.5 py-2.5 text-sm text-[#fffaf2] disabled:cursor-wait disabled:opacity-60">
                        再審査へ戻す
                      </button>
                      <button type="button" disabled={isPending} onClick={() => void retryContentJob(job.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        再投入
                      </button>
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-[var(--muted)]">
                  まだコンテンツジョブはありません。右のフォームから追加できます。
                </div>
              )}
            </div>
          </article>

          <div className="grid gap-5">
            <article className={panelClassName}>
              <h2 className="text-xl font-semibold">AI投稿生成</h2>
              <form onSubmit={generateDraft} className="mt-4 grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">テーマ</span>
                  <input value={draftTopic} onChange={(event) => setDraftTopic(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">トーン</span>
                  <input value={draftTone} onChange={(event) => setDraftTone(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">目的</span>
                  <input value={draftGoal} onChange={(event) => setDraftGoal(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">予約時刻</span>
                  <input type="datetime-local" value={draftScheduledAt} onChange={(event) => setDraftScheduledAt(event.target.value)} className={inputClassName} />
                </label>
                <button type="submit" disabled={isPending || !canEditContent} className="rounded-full bg-[var(--accent-2)] px-4 py-3 text-sm font-medium text-[#fffaf2] transition enabled:hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                  {isPending ? "生成中..." : "AIで投稿下書きを作成"}
                </button>
              </form>
            </article>

            <article className={panelClassName}>
              <h2 className="text-xl font-semibold">AI返信生成</h2>
              <form onSubmit={generateReplyDraft} className="mt-4 grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">元メッセージ</span>
                  <textarea value={replySourceText} onChange={(event) => setReplySourceText(event.target.value)} rows={5} required className={`${inputClassName} resize-y`} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">トーン</span>
                  <input value={replyTone} onChange={(event) => setReplyTone(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">目的</span>
                  <input value={replyGoal} onChange={(event) => setReplyGoal(event.target.value)} required className={inputClassName} />
                </label>
                <button type="submit" disabled={isPending || !canGenerateReply} className="rounded-full bg-[#1e4d47] px-4 py-3 text-sm font-medium text-[#fffaf2] transition enabled:hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                  {isPending ? "生成中..." : "AIで返信下書きを作成"}
                </button>
              </form>
            </article>

            <article className={panelClassName}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Mentions</h2>
                <div className="text-sm text-[var(--muted)]">{mentions.length}件</div>
              </div>
              <div className="mt-4 grid gap-3.5">
                {mentions.length > 0 ? mentions.map((mention) => (
                  <div key={mention.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <strong>@{mention.authorHandle}</strong>
                      <span className="text-sm text-[var(--muted)]">{mention.status}</span>
                    </div>
                    <p className="mt-2 leading-7">{mention.body}</p>
                    <div className="mt-2 text-sm text-[var(--muted)]">{toDatetimeLocalValue(mention.mentionedAt)}</div>
                    <div className="mt-3">
                      {canGenerateReply ? (
                        <button type="button" disabled={isPending} onClick={() => void generateReplyFromMention(mention.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                          reply下書きを作成
                        </button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-[var(--muted)]">
                    mention はまだありません。同期すると表示されます。
                  </div>
                )}
              </div>
            </article>

            <article className={`${panelClassName} grid gap-4.5`}>
              <div>
                <h2 className="text-xl font-semibold">固定投稿返信ルール</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  固定ツイートへの返信に対して、文言・いいね・リポスト条件の組み合わせで自動返信ジョブを作成します。テンプレートでは
                  {" "}
                  <code>{"{{author_handle}}"}</code>
                  {" "}
                  と
                  {" "}
                  <code>{"{{author_id}}"}</code>
                  {" "}
                  が使えます。
                </p>
              </div>
              <form onSubmit={saveFixedReplyRule} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">固定ツイートID</span>
                  <input value={fixedPostId} onChange={(event) => setFixedPostId(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">固定ツイート内容</span>
                  <textarea value={fixedPostText} onChange={(event) => setFixedPostText(event.target.value)} rows={3} required className={`${inputClassName} resize-y`} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">必須文言</span>
                  <input value={fixedTriggerPhrase} onChange={(event) => setFixedTriggerPhrase(event.target.value)} placeholder="例: 参加希望" className={inputClassName} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={fixedRequireLike} onChange={(event) => setFixedRequireLike(event.target.checked)} />
                    いいね必須
                  </label>
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={fixedRequireRetweet} onChange={(event) => setFixedRequireRetweet(event.target.checked)} />
                    リポスト必須
                  </label>
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={fixedRequireFollow} onChange={(event) => setFixedRequireFollow(event.target.checked)} />
                    フォロー必須
                  </label>
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={fixedIncludeAuthorHandle} onChange={(event) => setFixedIncludeAuthorHandle(event.target.checked)} />
                    返信文に相手のハンドルを入れる
                  </label>
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={fixedIncludeAuthorId} onChange={(event) => setFixedIncludeAuthorId(event.target.checked)} />
                    返信文に相手のIDを入れる
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">有効開始</span>
                    <input type="datetime-local" value={fixedActiveFrom} onChange={(event) => setFixedActiveFrom(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">有効終了</span>
                    <input type="datetime-local" value={fixedActiveTo} onChange={(event) => setFixedActiveTo(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">同一ユーザーへの1日上限</span>
                    <input value={fixedMaxRepliesPerAuthorPerDay} onChange={(event) => setFixedMaxRepliesPerAuthorPerDay(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">優先度</span>
                    <input value={fixedPriority} onChange={(event) => setFixedPriority(event.target.value)} className={inputClassName} />
                  </label>
                </div>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">除外ユーザーID</span>
                  <input value={fixedExcludedUserIds} onChange={(event) => setFixedExcludedUserIds(event.target.value)} placeholder="id1,id2" className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">返信テンプレート</span>
                  <textarea value={fixedReplyTemplate} onChange={(event) => setFixedReplyTemplate(event.target.value)} rows={4} required className={`${inputClassName} resize-y`} />
                </label>
                <button type="submit" disabled={settingsPending || !selectedAccountId || !canEditContent} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "固定返信ルールを保存"}
                </button>
              </form>
              <div className="grid gap-3">
                {fixedReplyRules.length > 0 ? fixedReplyRules.map((rule) => (
                  <div key={rule.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong>固定ツイート: {rule.fixedPostId}</strong>
                      <span className="text-sm text-[var(--muted)]">{rule.isActive ? "active" : "inactive"}</span>
                    </div>
                    <div className="mt-2 text-sm text-[var(--muted)]">{rule.fixedPostText}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span>文言: {rule.triggerPhrase || "なし"}</span>
                      <span>いいね: {rule.requireLike ? "必須" : "不要"}</span>
                      <span>リポスト: {rule.requireRetweet ? "必須" : "不要"}</span>
                      <span>フォロー: {rule.requireFollow ? "必須" : "不要"}</span>
                      <span>同一人/日: {rule.maxRepliesPerAuthorPerDay}</span>
                      <span>優先度: {rule.priority}</span>
                    </div>
                    <div className="mt-3 rounded-2xl border border-[var(--line)] px-3 py-2 text-sm">{rule.replyTemplate}</div>
                    {canEditContent ? <div className="mt-4 flex flex-wrap gap-2.5">
                      <button type="button" disabled={isPending} onClick={() => void reorderFixedReplyRule(rule.id, "up")} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        上へ
                      </button>
                      <button type="button" disabled={isPending} onClick={() => void reorderFixedReplyRule(rule.id, "down")} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        下へ
                      </button>
                      <button type="button" disabled={isPending} onClick={() => void toggleFixedReplyRule(rule.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        {rule.isActive ? "無効化" : "有効化"}
                      </button>
                      <button type="button" disabled={isPending} onClick={() => void duplicateFixedReplyRule(rule.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        複製
                      </button>
                      <button type="button" disabled={isPending} onClick={() => void deleteFixedReplyRule(rule.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        削除
                      </button>
                    </div> : null}
                  </div>
                )) : (
                  <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-[var(--muted)]">
                    まだ固定返信ルールはありません。
                  </div>
                )}
              </div>
            </article>

            <article className={panelClassName}>
              <h2 className="text-xl font-semibold">新規ジョブ作成</h2>
              <form onSubmit={submitJob} className="mt-4 grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">種別</span>
                  <select value={kind} onChange={(event) => setKind(event.target.value as ContentKind)} className={inputClassName}>
                    <option value="post">投稿</option>
                    <option value="reply">返信</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">本文</span>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} required className={`${inputClassName} resize-y`} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">予約時刻</span>
                  <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className={inputClassName} />
                </label>
                <button type="submit" disabled={isPending || !canEditContent} className={primaryButtonClassName}>
                  {isPending ? "送信中..." : "ジョブを作成"}
                </button>
              </form>
            </article>

            <article className={`${panelClassName} grid gap-4.5`}>
              <div>
                <h2 className="text-xl font-semibold">承認ポリシー</h2>
                <p className="mt-2 leading-7 text-[var(--muted)]">投稿と返信の完全自動化を切り替え可能にする前提で、運用ガードレールをAPI側で持たせます。</p>
              </div>
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div>Approval mode: {overview.policy?.approvalMode ?? "manual"}</div>
                <div className="mt-2">Auto post: {String(overview.policy?.autoPostEnabled ?? false)}</div>
                <div className="mt-2">Auto reply: {String(overview.policy?.autoReplyEnabled ?? false)}</div>
                <div className="mt-2">Auto reply paused: {String(overview.policy?.autoReplyPaused ?? false)}</div>
                <div className="mt-2">Hour limit: {overview.policy?.maxAutoRepliesPerHour ?? 20}</div>
                <div className="mt-2">Day limit: {overview.policy?.maxAutoRepliesPerDay ?? 100}</div>
                <div className="mt-2">10 min spike limit: {overview.policy?.spikeLimit10Minutes ?? 15}</div>
              </div>
              <form onSubmit={saveAutomationPolicy} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">承認フロー</span>
                  <select value={approvalModeSetting} onChange={(event) => setApprovalModeSetting(event.target.value as "auto" | "manual")} className={inputClassName}>
                    <option value="manual">承認あり</option>
                    <option value="auto">承認なし</option>
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={autoPostEnabledSetting} onChange={(event) => setAutoPostEnabledSetting(event.target.checked)} />
                    自動投稿を有効化
                  </label>
                  <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                    <input type="checkbox" checked={autoReplyEnabledSetting} onChange={(event) => setAutoReplyEnabledSetting(event.target.checked)} />
                    自動返信を有効化
                  </label>
                </div>
                <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                  <input type="checkbox" checked={autoReplyPaused} onChange={(event) => setAutoReplyPaused(event.target.checked)} />
                  自動返信を一時停止
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">停止理由</span>
                  <input value={autoReplyPauseReason} onChange={(event) => setAutoReplyPauseReason(event.target.value)} className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">クールダウン終了</span>
                  <input type="datetime-local" value={autoReplyCooldownUntil} onChange={(event) => setAutoReplyCooldownUntil(event.target.value)} className={inputClassName} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">1時間上限</span>
                    <input value={maxAutoRepliesPerHour} onChange={(event) => setMaxAutoRepliesPerHour(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">1日上限</span>
                    <input value={maxAutoRepliesPerDay} onChange={(event) => setMaxAutoRepliesPerDay(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">連続自動返信上限</span>
                    <input value={maxConsecutiveAutoReplies} onChange={(event) => setMaxConsecutiveAutoReplies(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">10分スパイク上限</span>
                    <input value={spikeLimit10Minutes} onChange={(event) => setSpikeLimit10Minutes(event.target.value)} className={inputClassName} />
                  </label>
                </div>
                <button type="submit" disabled={settingsPending || !canManageWorkspace} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "自動返信ポリシーを保存"}
                </button>
              </form>
              <div className="rounded-[20px] bg-[#1f1d1a] p-5 text-[#fffaf2]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm opacity-70">分析スナップショット</div>
                  <button type="button" onClick={() => void collectAnalytics()} disabled={connectPending || !canEditContent} className="rounded-full border border-white/20 px-3 py-2 text-xs text-white disabled:cursor-wait disabled:opacity-60">
                    {connectPending ? "更新中..." : "実データを取得"}
                  </button>
                </div>
                {latestAnalytics ? (
                  <div className="mt-4 rounded-[18px] border border-white/10 bg-white/5 p-4">
                    <div className="text-sm opacity-70">最新</div>
                    <div className="mt-2 text-2xl">{latestAnalytics.date}</div>
                    <div className="mt-2">Impressions: {latestAnalytics.impressions.toLocaleString()}</div>
                    <div>Engagements: {latestAnalytics.engagements.toLocaleString()}</div>
                    <div>Followers: {(latestAnalytics.followersCount ?? 0).toLocaleString()}</div>
                    <div>Followers delta: {latestAnalytics.followersDelta >= 0 ? "+" : ""}{latestAnalytics.followersDelta}</div>
                  </div>
                ) : null}
                {analytics.map((item) => (
                  <div key={item.date} className="mt-3.5">
                    <strong>{item.date}</strong>
                    <div>Impressions: {item.impressions.toLocaleString()}</div>
                    <div>Engagements: {item.engagements.toLocaleString()}</div>
                    <div>Followers: {(item.followersCount ?? 0).toLocaleString()}</div>
                    <div>Followers delta: {item.followersDelta >= 0 ? "+" : ""}{item.followersDelta}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className={`${panelClassName} grid gap-4.5`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">投稿学習と競合分析</h2>
                <button type="button" onClick={() => void analyzeOwnHistory()} disabled={connectPending || !canEditContent} className="rounded-full border border-[var(--line)] px-4 py-2 text-sm disabled:cursor-wait disabled:opacity-60">
                  {connectPending ? "分析中..." : "自分の過去投稿を分析"}
                </button>
              </div>
              {ownAnalysis ? (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-sm text-[var(--muted)]">{ownAnalysis.handle}</div>
                  <div className="mt-2">平均文字数: {ownAnalysis.averageLength}</div>
                  <div>平均反応: {ownAnalysis.averageEngagement}</div>
                  <div>疑問形比率: {ownAnalysis.questionPostRatio}</div>
                  <div>CTA比率: {ownAnalysis.ctaPostRatio}</div>
                  <div className="mt-3 text-sm font-medium">示唆</div>
                  <div className="mt-2 grid gap-2 text-sm">
                    {ownAnalysis.recommendations.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void analyzeCompetitor();
                }}
                className="grid gap-3.5"
              >
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">競合アカウント</span>
                  <input value={competitorHandle} onChange={(event) => setCompetitorHandle(event.target.value)} placeholder="@competitor" className={inputClassName} />
                </label>
                <button type="submit" disabled={connectPending || !canEditContent} className={primaryButtonClassName}>
                  {connectPending ? "分析中..." : "競合を分析"}
                </button>
              </form>
              {competitorAnalysis ? (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-sm text-[var(--muted)]">{competitorAnalysis.handle}</div>
                  <div className="mt-2">平均文字数: {competitorAnalysis.averageLength}</div>
                  <div>平均反応: {competitorAnalysis.averageEngagement}</div>
                  <div>疑問形比率: {competitorAnalysis.questionPostRatio}</div>
                  <div>CTA比率: {competitorAnalysis.ctaPostRatio}</div>
                  <div className="mt-3 text-sm font-medium">上位投稿</div>
                  <div className="mt-2 grid gap-2 text-sm">
                    {competitorAnalysis.topPosts.slice(0, 3).map((post) => (
                      <div key={post.id} className="rounded-2xl border border-[var(--line)] p-3">
                        <div>{post.text}</div>
                        <div className="mt-1 text-[var(--muted)]">score: {post.score}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-sm font-medium">示唆</div>
                  <div className="mt-2 grid gap-2 text-sm">
                    {competitorAnalysis.recommendations.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {learningProfile ? (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-sm font-medium">Learning Profile</div>
                  <div className="mt-2 text-sm text-[var(--muted)]">{learningProfile.summary}</div>
                  <div className="mt-3 grid gap-2 text-sm">
                    {learningProfile.patterns.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {analysisReports.length > 0 ? (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-sm font-medium">分析履歴</div>
                  <div className="mt-3 grid gap-2.5 text-sm">
                    {analysisReports.slice(0, 5).map((report) => (
                      <div key={report.id} className="rounded-2xl border border-[var(--line)] p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{report.source}</strong>
                          <span className="text-[var(--muted)]">{toDatetimeLocalValue(report.createdAt)}</span>
                        </div>
                        <div className="mt-1">{report.handle}</div>
                        <div className="mt-1 text-[var(--muted)]">平均反応: {report.report.averageEngagement}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {postPerformance.length > 0 ? (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-sm font-medium">投稿別パフォーマンス</div>
                  <div className="mt-3 grid gap-2.5 text-sm">
                    {postPerformance.slice(0, 6).map((item) => (
                      <div key={item.contentJobId} className="rounded-2xl border border-[var(--line)] p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{item.kind === "post" ? "投稿" : "返信"} / score {item.score}</strong>
                          <span className="text-[var(--muted)]">{item.publishedAt ? toDatetimeLocalValue(item.publishedAt) : "-"}</span>
                        </div>
                        <div className="mt-2">{item.body}</div>
                        <div className="mt-2 text-[var(--muted)]">
                          impressions {item.impressions.toLocaleString()} / engagements {item.engagements.toLocaleString()}
                        </div>
                        <div className="mt-1 text-[var(--muted)]">
                          likes {item.likeCount} / replies {item.replyCount} / reposts {item.repostCount}
                        </div>
                        <div className="mt-1 text-[var(--muted)]">prompt: {item.sourcePrompt ?? "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>

            {canManageWorkspace ? (
            <article className={`${panelClassName} grid gap-4.5`}>
              <h2 className="text-xl font-semibold">X認証設定</h2>
              <form onSubmit={saveXCredentials} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Client ID</span>
                  <input value={xClientId} onChange={(event) => setXClientId(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Client Secret</span>
                  <input value={xClientSecret} onChange={(event) => setXClientSecret(event.target.value)} type="password" placeholder={xCredential?.maskedClientSecret ?? ""} className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Redirect URI</span>
                  <input value={xRedirectUri} onChange={(event) => setXRedirectUri(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Scopes</span>
                  <input value={xScopes} onChange={(event) => setXScopes(event.target.value)} required className={inputClassName} />
                </label>
                <button type="submit" disabled={settingsPending} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "X認証設定を保存"}
                </button>
              </form>
            </article>
            ) : null}

            {canManageWorkspace ? (
            <article className={`${panelClassName} grid gap-4.5`}>
              <h2 className="text-xl font-semibold">AIプロバイダ設定</h2>
              <form onSubmit={saveAISettings} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Provider</span>
                  <select value={aiProvider} onChange={(event) => setAIProvider(event.target.value as AIProvider)} className={inputClassName}>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">API Key</span>
                  <input value={aiApiKey} onChange={(event) => setAIApiKey(event.target.value)} type="password" required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Model</span>
                  <input value={aiModel} onChange={(event) => setAIModel(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">System Prompt</span>
                  <textarea value={aiSystemPrompt} onChange={(event) => setAISystemPrompt(event.target.value)} rows={4} className={`${inputClassName} resize-y`} />
                </label>
                <button type="submit" disabled={settingsPending} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "AI設定を保存"}
                </button>
              </form>
              <div className="grid gap-2.5">
                {aiSettings.map((setting) => (
                  <div key={setting.provider} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3.5">
                    <strong>{setting.provider}</strong>
                    <div className="mt-1 text-sm text-[var(--muted)]">model: {setting.model}</div>
                    <div className="text-sm text-[var(--muted)]">key: {setting.maskedApiKey ?? "-"}</div>
                    <div className="text-sm text-[var(--muted)]">active: {String(setting.isActive)}</div>
                  </div>
                ))}
              </div>
            </article>
            ) : null}

            {canManageWorkspace ? (
            <article className={`${panelClassName} grid gap-4.5`}>
              <h2 className="text-xl font-semibold">通知設定</h2>
              <div className="flex flex-wrap gap-2">
                {notificationPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setNotificationEvents(preset.events.join(","))}
                    className="rounded-full border border-[var(--line)] px-3 py-2 text-sm"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <form onSubmit={saveNotificationEndpoint} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Name</span>
                  <input value={notificationName} onChange={(event) => setNotificationName(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Webhook URL</span>
                  <input value={notificationWebhookUrl} onChange={(event) => setNotificationWebhookUrl(event.target.value)} placeholder={notificationEndpoints[0]?.webhookUrlMasked ?? ""} className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Events</span>
                  <input value={notificationEvents} onChange={(event) => setNotificationEvents(event.target.value)} className={inputClassName} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">再通知間隔(分)</span>
                    <input value={notificationRepeatIntervalMinutes} onChange={(event) => setNotificationRepeatIntervalMinutes(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">失敗通知しきい値(1時間)</span>
                    <input value={notificationFailureThresholdCount} onChange={(event) => setNotificationFailureThresholdCount(event.target.value)} className={inputClassName} />
                  </label>
                </div>
                <button type="submit" disabled={settingsPending} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "通知設定を保存"}
                </button>
                <button type="button" disabled={settingsPending} onClick={() => void sendTestNotification()} className="rounded-full border border-[var(--line)] px-4 py-3 text-sm disabled:cursor-wait disabled:opacity-60">
                  テスト通知を送信
                </button>
              </form>
              <div className="grid gap-2.5">
                {notificationEndpoints.length > 0 ? notificationEndpoints.map((endpoint) => (
                  <div key={endpoint.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3.5">
                    <strong>{endpoint.name}</strong>
                    <div className="mt-1 text-sm text-[var(--muted)]">{endpoint.webhookUrlMasked}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">events: {endpoint.events.join(", ")}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">repeat: {endpoint.repeatIntervalMinutes} min</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">failure threshold: {endpoint.failureThresholdCount}</div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3.5 text-sm text-[var(--muted)]">
                    通知先はまだありません。
                  </div>
                )}
              </div>
            </article>
            ) : null}

            {canManageWorkspace ? (
            <article className={`${panelClassName} grid gap-4.5`}>
              <div>
                <h2 className="text-xl font-semibold">Billing / Usage</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">月次の利用上限と現在の使用量を管理します。制限は API 側でも適用されます。</p>
              </div>
              {billingSummary ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm">
                    <div className="text-[var(--muted)]">Plan</div>
                    <div className="mt-2 text-xl">{billingSummary.settings.planTier}</div>
                    <div className="mt-1 text-[var(--muted)]">JPY {billingSummary.settings.monthlyPriceJpy.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm">
                    <div className="text-[var(--muted)]">Content Jobs</div>
                    <div className="mt-2 text-xl">{billingSummary.usage.contentJobsCreated} / {billingSummary.settings.maxMonthlyContentJobs}</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm">
                    <div className="text-[var(--muted)]">AI Generations</div>
                    <div className="mt-2 text-xl">{billingSummary.usage.aiGenerations} / {billingSummary.settings.maxMonthlyAiGenerations}</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm">
                    <div className="text-[var(--muted)]">Mention Sync</div>
                    <div className="mt-2 text-xl">{billingSummary.usage.mentionSyncRuns} / {billingSummary.settings.maxMonthlyMentionSyncs}</div>
                  </div>
                </div>
              ) : null}
              <form onSubmit={saveBillingSettings} className="grid gap-3.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">Plan</span>
                    <select value={billingPlanTier} onChange={(event) => setBillingPlanTier(event.target.value as WorkspacePlanTier)} className={inputClassName}>
                      <option value="free">free</option>
                      <option value="pro">pro</option>
                      <option value="agency">agency</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">月額(円)</span>
                    <input value={billingMonthlyPriceJpy} onChange={(event) => setBillingMonthlyPriceJpy(event.target.value)} className={inputClassName} />
                  </label>
                </div>
                <label className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                  <input type="checkbox" checked={billingActive} onChange={(event) => setBillingActive(event.target.checked)} />
                  billing を有効化
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">接続可能 X アカウント数</span>
                    <input value={billingMaxXAccounts} onChange={(event) => setBillingMaxXAccounts(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">月間ジョブ上限</span>
                    <input value={billingMaxMonthlyContentJobs} onChange={(event) => setBillingMaxMonthlyContentJobs(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">月間 AI 生成上限</span>
                    <input value={billingMaxMonthlyAiGenerations} onChange={(event) => setBillingMaxMonthlyAiGenerations(event.target.value)} className={inputClassName} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm text-[var(--muted)]">月間 mention 同期上限</span>
                    <input value={billingMaxMonthlyMentionSyncs} onChange={(event) => setBillingMaxMonthlyMentionSyncs(event.target.value)} className={inputClassName} />
                  </label>
                </div>
                <button type="submit" disabled={settingsPending} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "billing 設定を保存"}
                </button>
              </form>
            </article>
            ) : null}

            <article className={`${panelClassName} grid gap-4.5`}>
              <div>
                <h2 className="text-xl font-semibold">Workspace Users</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">role 管理と local login の土台です。現在は API 側も workspace と role で制限しています。</p>
              </div>
              <form onSubmit={loginWorkspaceUser} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Login Email</span>
                  <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Password</span>
                  <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" className={inputClassName} />
                </label>
                <button type="submit" disabled={settingsPending} className={primaryButtonClassName}>
                  {settingsPending ? "ログイン中..." : "ログイン"}
                </button>
              </form>
              {sessionUser ? (
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-sm">
                  <div>current: {sessionUser.displayName} ({sessionUser.email})</div>
                  <div className="mt-1 text-[var(--muted)]">role: {sessionUser.role}</div>
                </div>
              ) : null}
              {canManageWorkspace ? <form onSubmit={createWorkspaceUser} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">New User Email</span>
                  <input value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Display Name</span>
                  <input value={newUserDisplayName} onChange={(event) => setNewUserDisplayName(event.target.value)} className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Initial Password</span>
                  <input value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} type="password" className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Role</span>
                  <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as UserRole)} className={inputClassName}>
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                    <option value="reviewer">reviewer</option>
                    <option value="viewer">viewer</option>
                  </select>
                </label>
                <button type="submit" disabled={settingsPending} className={primaryButtonClassName}>
                  {settingsPending ? "作成中..." : "ユーザーを追加"}
                </button>
              </form> : null}
              <div className="grid gap-2.5">
                {workspaceUsers.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong>{user.displayName}</strong>
                        <div className="mt-1 text-sm text-[var(--muted)]">{user.email}</div>
                      </div>
                      <select value={user.role} disabled={!canManageWorkspace} onChange={(event) => void updateWorkspaceUserRole(user.id, event.target.value as UserRole)} className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-sm disabled:opacity-60">
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="editor">editor</option>
                        <option value="reviewer">reviewer</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </div>
                    <div className="mt-1 text-sm text-[var(--muted)]">last login: {user.lastLoginAt ? toDatetimeLocalValue(user.lastLoginAt) : "-"}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className={`${panelClassName} grid gap-4.5`}>
              <h2 className="text-xl font-semibold">Prompt Templates</h2>
              <form onSubmit={savePromptTemplate} className="grid gap-3.5">
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Kind</span>
                  <select
                    value={promptKind}
                    onChange={(event) => handlePromptKindChange(event.target.value as PromptTemplateKind)}
                    className={inputClassName}
                  >
                    <option value="base">Base</option>
                    <option value="task_post">Task Post</option>
                    <option value="task_reply">Task Reply</option>
                    <option value="safety">Safety</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Title</span>
                  <input value={promptTitle} onChange={(event) => setPromptTitle(event.target.value)} required className={inputClassName} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-[var(--muted)]">Content</span>
                  <textarea value={promptContent} onChange={(event) => setPromptContent(event.target.value)} rows={7} required className={`${inputClassName} resize-y`} />
                </label>
                <button type="submit" disabled={settingsPending || !canEditPrompts} className={primaryButtonClassName}>
                  {settingsPending ? "保存中..." : "Prompt template を保存"}
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void loadPromptPreview("post");
                    }}
                    disabled={!canEditPrompts}
                    className="rounded-full border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
                  >
                    投稿用 preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void loadPromptPreview("reply");
                    }}
                    disabled={!canEditPrompts}
                    className="rounded-full border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
                  >
                    返信用 preview
                  </button>
                </div>
              </form>
              <div className="grid gap-2.5">
                {promptTemplates.map((template) => (
                  <div key={template.kind} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3.5">
                    <strong>{template.kind}</strong>
                    <div className="mt-1 text-sm text-[var(--muted)]">{template.title}</div>
                    <div className="mt-1 line-clamp-3 text-sm text-[var(--muted)]">{template.content}</div>
                  </div>
                ))}
              </div>
              {promptPreview ? (
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-sm font-medium">Prompt Preview</div>
                  <div className="mt-2 grid gap-1 text-sm text-[var(--muted)]">
                    {promptPreview.variables.map((item) => (
                      <div key={item.label}>
                        {item.label}: {item.value}
                      </div>
                    ))}
                  </div>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
                    {promptPreview.prompt}
                  </pre>
                </div>
              ) : null}
            </article>
          </div>
        </section>

        <section className={panelClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">再審査キュー</h2>
            <div className="text-sm text-[var(--muted)]">failed / awaiting_approval</div>
          </div>
          <div className="mt-4.5 grid gap-3.5">
            {reviewQueue.length > 0 ? reviewQueue.map((job) => (
              <article key={job.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>{job.kind === "post" ? "投稿" : "返信"} / {job.status}</strong>
                  <span className="text-sm text-[var(--muted)]">retry {job.retryCount ?? 0}</span>
                </div>
                <p className="mt-2 leading-7">{job.body}</p>
                {job.lastError ? <div className="mt-2 text-sm text-[#b42318]">{job.lastError}</div> : null}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(canEditContent || canReviewContent) ? (
                    <button type="button" disabled={isPending} onClick={() => beginEditJob(job)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                      本文を編集
                    </button>
                  ) : null}
                  {job.status === "failed" ? (
                    <>
                      {canEditContent ? <button type="button" disabled={isPending} onClick={() => void reopenFailedJob(job.id)} className="rounded-full bg-[var(--accent-2)] px-3.5 py-2.5 text-sm text-[#fffaf2] disabled:cursor-wait disabled:opacity-60">
                        再審査へ戻す
                      </button> : null}
                      {canEditContent ? <button type="button" disabled={isPending} onClick={() => void retryContentJob(job.id)} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        再投入
                      </button> : null}
                    </>
                  ) : (
                    <>
                      {canReviewContent ? <button type="button" disabled={isPending} onClick={() => void decideApproval(job.id, "approve")} className="rounded-full bg-[var(--accent-2)] px-3.5 py-2.5 text-sm text-[#fffaf2] disabled:cursor-wait disabled:opacity-60">
                        承認
                      </button> : null}
                      {canReviewContent ? <button type="button" disabled={isPending} onClick={() => void decideApproval(job.id, "reject")} className="rounded-full border border-[var(--line)] px-3.5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">
                        差し戻し
                      </button> : null}
                    </>
                  )}
                </div>
              </article>
            )) : (
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-[var(--muted)]">
                再審査が必要なジョブはありません。
              </div>
            )}
          </div>
        </section>

        <section className={panelClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">承認履歴</h2>
            <div className="text-sm text-[var(--muted)]">最新 {approvals.length} 件</div>
          </div>
          <div className="mt-4 grid gap-3.5 md:grid-cols-[1fr_auto_auto]">
            <textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} rows={2} placeholder="承認コメント / 差し戻し理由" className={`${inputClassName} resize-y`} />
            <button type="button" disabled={isPending || selectedApprovalJobIds.length === 0 || !canReviewContent} onClick={() => void decideApprovalsBatch("approve")} className="rounded-full bg-[var(--accent-2)] px-4 py-3 text-sm text-[#fffaf2] disabled:cursor-wait disabled:opacity-60">
              選択を一括承認
            </button>
            <button type="button" disabled={isPending || selectedApprovalJobIds.length === 0 || !canReviewContent} onClick={() => void decideApprovalsBatch("reject")} className="rounded-full border border-[var(--line)] px-4 py-3 text-sm disabled:cursor-wait disabled:opacity-60">
              選択を一括差し戻し
            </button>
          </div>
          {awaitingApprovalQueue.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {awaitingApprovalQueue.map((job) => (
                <label key={job.id} className="flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedApprovalJobIds.includes(job.id)}
                    disabled={!canReviewContent}
                    onChange={(event) =>
                      setSelectedApprovalJobIds((current) =>
                        event.target.checked ? [...current, job.id] : current.filter((id) => id !== job.id),
                      )
                    }
                  />
                  <span>{job.kind === "post" ? "投稿" : "返信"}</span>
                  <span className="text-[var(--muted)]">{job.body.slice(0, 90)}</span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="mt-4.5 grid gap-3.5">
            {approvals.length > 0 ? approvals.map((approval) => (
              <article key={approval.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>{approval.contentKind === "post" ? "投稿" : "返信"} / {approval.status}</strong>
                  <span className="text-sm text-[var(--muted)]">Reviewer: {approval.reviewerName}</span>
                </div>
                <p className="mt-2 leading-7">{approval.contentBody}</p>
                <div className="text-sm text-[var(--muted)]">reviewedAt: {approval.reviewedAt ? toDatetimeLocalValue(approval.reviewedAt) : "-"}</div>
                {approval.note ? <div className="mt-2 text-sm text-[var(--muted)]">note: {approval.note}</div> : null}
              </article>
            )) : (
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-[var(--muted)]">
                まだ承認履歴はありません。
              </div>
            )}
          </div>
        </section>

        <section className={panelClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">監査ログ</h2>
            <div className="text-sm text-[var(--muted)]">最新 {auditLogs.length} 件</div>
          </div>
          <form onSubmit={applyAuditFilter} className="mt-4 grid gap-3.5 md:grid-cols-[0.7fr_1fr_auto]">
            <select value={auditEventType} onChange={(event) => setAuditEventType(event.target.value)} className={inputClassName}>
              <option value="">all events</option>
              <option value="content.job.published">content.job.published</option>
              <option value="content.job.failed">content.job.failed</option>
              <option value="content.job.approved">content.job.approved</option>
              <option value="x.oauth.refreshed">x.oauth.refreshed</option>
            </select>
            <input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="summary / entity type で検索" className={inputClassName} />
            <button type="submit" className={primaryButtonClassName}>絞り込む</button>
          </form>
          <div className="mt-4.5 grid gap-3.5">
            {auditLogs.length > 0 ? auditLogs.map((log) => (
              <article key={log.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>{log.eventType}</strong>
                  <span className="text-sm text-[var(--muted)]">{toDatetimeLocalValue(log.createdAt)}</span>
                </div>
                <p className="mt-2 leading-7">{log.summary}</p>
                <div className="text-sm text-[var(--muted)]">
                  {log.entityType}{log.entityId ? ` / ${log.entityId}` : ""}
                </div>
              </article>
            )) : (
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-4 text-[var(--muted)]">
                まだ監査ログはありません。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
