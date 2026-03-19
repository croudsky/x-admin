import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import type {
  CreateWorkspaceUserInput,
  LoginInput,
  LoginResult,
  UpdateWorkspaceUserRoleInput,
  UpsertXAppCredentialInput,
  WorkspaceUserSummary,
  XAppCredentialSummary,
  XCallbackResult,
  XConnectUrlResponse,
} from "@oku/shared/index";
import { XAccountStatus } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { EncryptionService } from "../security/encryption.service";

type XTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope?: string;
  refresh_token?: string;
};

type XMeResponse = {
  data?: {
    id: string;
    username: string;
    name: string;
  };
};

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_ME_URL = "https://api.x.com/2/users/me";
const DEFAULT_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async getCredentialSummary(workspaceId?: string): Promise<XAppCredentialSummary | null> {
    const workspace = await this.requireWorkspace(workspaceId);

    if (!workspace) {
      return null;
    }

    const credential = await this.prisma.xAppCredential.findFirst({
      where: {
        workspaceId: workspace.id,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!credential) {
      return null;
    }

    return this.toCredentialSummary(credential);
  }

  async saveCredentials(input: UpsertXAppCredentialInput, workspaceId?: string): Promise<XAppCredentialSummary> {
    const workspace = await this.requireWorkspace(workspaceId);

    if (!workspace) {
      throw new BadRequestException("No seeded workspace found");
    }

    const clientId = input.clientId.trim();
    const redirectUri = input.redirectUri.trim();
    const scopes = input.scopes.trim();
    const clientSecret = input.clientSecret?.trim() || null;

    if (!clientId || !redirectUri || !scopes) {
      throw new BadRequestException("clientId, redirectUri and scopes are required");
    }

    if (input.isActive) {
      await this.prisma.xAppCredential.updateMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    }

    const existing = await this.prisma.xAppCredential.findFirst({
      where: {
        workspaceId: workspace.id,
      },
      orderBy: { createdAt: "asc" },
    });

    const saved = existing
      ? await this.prisma.xAppCredential.update({
          where: { id: existing.id },
          data: {
            clientId,
            clientSecret: clientSecret
              ? this.encryptionService.encrypt(clientSecret)
              : existing.clientSecret,
            redirectUri,
            scopes,
            isActive: input.isActive,
          },
        })
      : await this.prisma.xAppCredential.create({
          data: {
            workspaceId: workspace.id,
            clientId,
            clientSecret: clientSecret ? this.encryptionService.encrypt(clientSecret) : null,
            redirectUri,
            scopes,
            isActive: input.isActive,
          },
        });

    await this.auditService.record({
      workspaceId: workspace.id,
      eventType: "x.credentials.saved",
      entityType: "x_app_credential",
      entityId: saved.id,
      summary: "X認証設定を更新しました",
      metadata: {
        clientId,
        scopes,
      },
    });

    return {
      ...this.toCredentialSummary(saved),
      maskedClientSecret: clientSecret
        ? this.maskSecret(clientSecret)
        : this.toCredentialSummary(saved).maskedClientSecret,
    };
  }

  async createConnectUrl(workspaceId?: string): Promise<XConnectUrlResponse> {
    const config = await this.getConfigOrThrow(workspaceId);
    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      include: {
        xAccounts: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!workspace) {
      throw new BadRequestException("No seeded workspace found");
    }

    const state = randomBytes(24).toString("hex");
    const codeVerifier = randomBytes(48).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const scopes = config.scopes.join(" ");

    await this.prisma.xOAuthSession.create({
      data: {
        workspaceId: workspace.id,
        xAccountId: workspace.xAccounts[0]?.id ?? null,
        state,
        codeVerifier,
        redirectUri: config.redirectUri,
        scopes,
        expiresAt,
      },
    });

    const authorizeUrl = new URL(X_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return {
      authorizeUrl: authorizeUrl.toString(),
      state,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async handleCallback(code: string, state: string): Promise<XCallbackResult> {
    if (!code || !state) {
      throw new BadRequestException("code and state are required");
    }

    const config = await this.getConfigOrThrow();
    const session = await this.prisma.xOAuthSession.findUnique({
      where: { state },
    });

    if (!session) {
      throw new BadRequestException("OAuth session not found");
    }

    if (session.usedAt || session.expiresAt < new Date()) {
      throw new BadRequestException("OAuth session expired");
    }

    const tokenResponse = await this.exchangeCode({
      code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    const me = await this.fetchCurrentUser(tokenResponse.access_token);

    if (!me.data) {
      throw new InternalServerErrorException("Could not fetch current user from X");
    }

    const xAccount = await this.prisma.xAccount.upsert({
      where: {
        xUserId: me.data.id,
      },
      update: {
        workspaceId: session.workspaceId,
        handle: `@${me.data.username}`,
        displayName: me.data.name,
        status: XAccountStatus.CONNECTED,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
      create: {
        workspaceId: session.workspaceId,
        xUserId: me.data.id,
        handle: `@${me.data.username}`,
        displayName: me.data.name,
        status: XAccountStatus.CONNECTED,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
    });

    await this.prisma.xOAuthSession.update({
      where: { id: session.id },
      data: {
        usedAt: new Date(),
        xAccountId: xAccount.id,
      },
    });

    await this.auditService.record({
      workspaceId: session.workspaceId,
      eventType: "x.oauth.connected",
      entityType: "x_account",
      entityId: xAccount.id,
      summary: `Xアカウント ${xAccount.handle} を接続しました`,
      metadata: {
        handle: xAccount.handle,
      },
    });

    return {
      xAccountId: xAccount.id,
      handle: xAccount.handle,
      displayName: xAccount.displayName,
      status: "connected",
    };
  }

  async ensureActiveAccessToken(xAccountId: string) {
    const account = await this.prisma.xAccount.findUnique({
      where: { id: xAccountId },
    });

    if (!account) {
      throw new BadRequestException("X account not found");
    }

    if (!account.accessToken) {
      throw new BadRequestException("X access token is missing");
    }

    const expiresSoon =
      !account.tokenExpiresAt || account.tokenExpiresAt.getTime() <= Date.now() + 5 * 60 * 1000;

    if (!expiresSoon) {
      return account.accessToken;
    }

    if (!account.refreshToken) {
      throw new BadRequestException("X refresh token is missing");
    }

    const config = await this.getConfigOrThrow();
    const refreshed = await this.refreshAccessToken({
      refreshToken: account.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    const updated = await this.prisma.xAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? account.refreshToken,
        tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        status: XAccountStatus.CONNECTED,
      },
    });

    await this.auditService.record({
      workspaceId: account.workspaceId,
      eventType: "x.oauth.refreshed",
      entityType: "x_account",
      entityId: account.id,
      summary: "X access token を更新しました",
      metadata: {
        handle: account.handle,
      },
    });

    return updated.accessToken ?? refreshed.access_token;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user?.passwordHash || user.passwordHash !== this.hashPassword(input.password)) {
      throw new BadRequestException("Invalid email or password");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.create({
      data: {
        workspaceId: user.workspaceId,
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: this.mapWorkspaceUser(updated),
    };
  }

  async getSessionUser(token?: string): Promise<WorkspaceUserSummary | null> {
    if (!token) {
      return null;
    }

    const session = await this.prisma.userSession.findUnique({
      where: {
        tokenHash: this.hashToken(token),
      },
      include: {
        user: true,
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return this.mapWorkspaceUser(session.user);
  }

  async listWorkspaceUsers(workspaceId?: string): Promise<WorkspaceUserSummary[]> {
    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      include: {
        users: {
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!workspace) {
      return [];
    }

    return workspace.users.map((user) => this.mapWorkspaceUser(user));
  }

  async createWorkspaceUser(input: CreateWorkspaceUserInput, workspaceId?: string): Promise<WorkspaceUserSummary> {
    const workspace = await this.requireWorkspace(workspaceId);

    if (!workspace) {
      throw new BadRequestException("No seeded workspace found");
    }

    const created = await this.prisma.user.create({
      data: {
        workspaceId: workspace.id,
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        role: this.mapUserRole(input.role),
        passwordHash: this.hashPassword(input.password),
      },
    });

    return this.mapWorkspaceUser(created);
  }

  async updateWorkspaceUserRole(id: string, input: UpdateWorkspaceUserRoleInput, workspaceId?: string): Promise<WorkspaceUserSummary> {
    if (!workspaceId) {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          role: this.mapUserRole(input.role),
        },
      });

      return this.mapWorkspaceUser(updated);
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        workspaceId,
      },
    });

    if (!existing) {
      throw new BadRequestException("User not found");
    }

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        role: this.mapUserRole(input.role),
      },
    });

    return this.mapWorkspaceUser(updated);
  }

  private async getConfigOrThrow(workspaceId?: string) {
    const workspace = await this.requireWorkspace(workspaceId);

    const stored = workspace
      ? await this.prisma.xAppCredential.findFirst({
          where: {
            workspaceId: workspace.id,
            isActive: true,
          },
          orderBy: { updatedAt: "desc" },
        })
      : null;

    const clientId = stored?.clientId ?? process.env.X_CLIENT_ID;
    const redirectUri = stored?.redirectUri ?? process.env.X_REDIRECT_URI;
    const clientSecret = stored?.clientSecret
      ? this.encryptionService.decrypt(stored.clientSecret)
      : process.env.X_CLIENT_SECRET;
    const scopes = (stored?.scopes ?? process.env.X_OAUTH_SCOPES ?? DEFAULT_SCOPES.join(","))
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);

    if (!clientId || !redirectUri) {
      throw new BadRequestException("X client settings are required");
    }

    return {
      clientId,
      redirectUri,
      clientSecret,
      scopes,
    };
  }

  private async requireWorkspace(workspaceId?: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: workspaceId ? { id: workspaceId } : undefined,
      orderBy: { createdAt: "asc" },
    });

    if (!workspace) {
      throw new BadRequestException("No seeded workspace found");
    }

    return workspace;
  }

  private async exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId: string;
    clientSecret?: string;
  }): Promise<XTokenResponse> {
    const body = new URLSearchParams({
      code: params.code,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (params.clientSecret) {
      const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    } else {
      body.set("client_id", params.clientId);
    }

    const response = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      throw new BadRequestException(`Token exchange failed with status ${response.status}`);
    }

    return (await response.json()) as XTokenResponse;
  }

  private async refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
    clientSecret?: string;
  }): Promise<XTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (params.clientSecret) {
      const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    } else {
      body.set("client_id", params.clientId);
    }

    const response = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      throw new BadRequestException(`Refresh token exchange failed with status ${response.status}`);
    }

    return (await response.json()) as XTokenResponse;
  }

  private async fetchCurrentUser(accessToken: string): Promise<XMeResponse> {
    const response = await fetch(X_ME_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Fetching current user failed with status ${response.status}`);
    }

    return (await response.json()) as XMeResponse;
  }

  private toCredentialSummary(credential: {
    clientId: string;
    clientSecret: string | null;
    redirectUri: string;
    scopes: string;
    isActive: boolean;
  }): XAppCredentialSummary {
    return {
      clientId: credential.clientId,
      redirectUri: credential.redirectUri,
      scopes: credential.scopes,
      isActive: credential.isActive,
      hasClientSecret: Boolean(credential.clientSecret),
      maskedClientSecret: credential.clientSecret
        ? this.maskSecret(credential.clientSecret)
        : null,
    };
  }

  private maskSecret(value: string) {
    if (value.length <= 8) {
      return "********";
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private hashPassword(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private mapUserRole(role: "owner" | "admin" | "editor" | "reviewer" | "viewer") {
    switch (role) {
      case "owner":
        return "OWNER";
      case "admin":
        return "ADMIN";
      case "editor":
        return "EDITOR";
      case "reviewer":
        return "REVIEWER";
      case "viewer":
        return "VIEWER";
    }
  }

  private mapWorkspaceUser(user: {
    id: string;
    workspaceId: string;
    email: string;
    displayName: string;
    role: "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";
    lastLoginAt: Date | null;
  }): WorkspaceUserSummary {
    return {
      id: user.id,
      workspaceId: user.workspaceId,
      email: user.email,
      displayName: user.displayName,
      role: user.role.toLowerCase() as WorkspaceUserSummary["role"],
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }
}
