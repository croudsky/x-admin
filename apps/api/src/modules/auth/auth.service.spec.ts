import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const encryptionService = {
    encrypt: vi.fn((value: string) => `enc:${value}`),
    decrypt: vi.fn((value: string) => value.replace(/^enc:/, "")),
  };
  const auditService = {
    record: vi.fn().mockResolvedValue(undefined),
  };

  it("creates an X authorize URL and persists an oauth session", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
          xAccounts: [{ id: "acc_seed_oku" }],
        }),
      },
      xAppCredential: {
        findFirst: vi.fn().mockResolvedValue({
          clientId: "client-id",
          clientSecret: "enc:secret-value",
          redirectUri: "http://localhost:4000/auth/x/callback",
          scopes: "tweet.read,tweet.write,users.read,offline.access",
          isActive: true,
          updatedAt: new Date(),
        }),
      },
      xOAuthSession: {
        create,
      },
    };

    const service = new AuthService(prisma as never, encryptionService as never, auditService as never);
    const result = await service.createConnectUrl();

    expect(result.authorizeUrl).toContain("https://x.com/i/oauth2/authorize");
    expect(result.authorizeUrl).toContain("client_id=client-id");
    expect(result.authorizeUrl).toContain("code_challenge_method=S256");
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects connect url creation when required env vars are missing", async () => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_REDIRECT_URI;

    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      xAppCredential: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      xOAuthSession: {
        create: vi.fn(),
      },
    };

    const service = new AuthService(prisma as never, encryptionService as never, auditService as never);
    await expect(service.createConnectUrl()).rejects.toBeInstanceOf(BadRequestException);
  });

  it("saves X app credentials and returns a masked summary", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      xAppCredential: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          clientId: "client-id",
          clientSecret: "enc:secret-value",
          redirectUri: "http://localhost:4000/auth/x/callback",
          scopes: "tweet.read,tweet.write,users.read,offline.access",
          isActive: true,
        }),
      },
    };

    const service = new AuthService(prisma as never, encryptionService as never, auditService as never);
    await expect(
      service.saveCredentials({
        clientId: "client-id",
        clientSecret: "secret-value",
        redirectUri: "http://localhost:4000/auth/x/callback",
        scopes: "tweet.read,tweet.write,users.read,offline.access",
        isActive: true,
      }),
    ).resolves.toEqual({
      clientId: "client-id",
      redirectUri: "http://localhost:4000/auth/x/callback",
      scopes: "tweet.read,tweet.write,users.read,offline.access",
      isActive: true,
      hasClientSecret: true,
      maskedClientSecret: "secr...alue",
    });

    expect(encryptionService.encrypt).toHaveBeenCalledWith("secret-value");
  });

  it("refreshes an expired X access token", async () => {
    const accountUpdate = vi.fn().mockResolvedValue({
      accessToken: "new-access-token",
    });
    const prisma = {
      xAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_seed_oku",
          workspaceId: "ws_seed_oku",
          handle: "@oku_ai",
          accessToken: "old-access-token",
          refreshToken: "refresh-token",
          tokenExpiresAt: new Date("2026-03-18T00:00:00.000Z"),
        }),
        update: accountUpdate,
      },
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ws_seed_oku",
        }),
      },
      xAppCredential: {
        findFirst: vi.fn().mockResolvedValue({
          clientId: "client-id",
          clientSecret: "enc:secret-value",
          redirectUri: "http://localhost:4000/auth/x/callback",
          scopes: "tweet.read,tweet.write,users.read,offline.access",
          isActive: true,
          updatedAt: new Date(),
        }),
      },
    };

    const service = new AuthService(prisma as never, encryptionService as never, auditService as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 7200,
        token_type: "bearer",
      }),
    } as Response);

    await expect(service.ensureActiveAccessToken("acc_seed_oku")).resolves.toBe("new-access-token");
    expect(accountUpdate).toHaveBeenCalledWith({
      where: { id: "acc_seed_oku" },
      data: expect.objectContaining({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      }),
    });
  });

  it("creates a local session on login", async () => {
    const userSessionCreate = vi.fn().mockResolvedValue(undefined);
    const passwordHash = createHash("sha256").update("secret-pass").digest("hex");
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user_seed_oku",
          workspaceId: "ws_seed_oku",
          email: "owner@oku.local",
          displayName: "Oku Owner",
          role: "OWNER",
          passwordHash,
          lastLoginAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "user_seed_oku",
          workspaceId: "ws_seed_oku",
          email: "owner@oku.local",
          displayName: "Oku Owner",
          role: "OWNER",
          lastLoginAt: new Date("2026-03-19T00:00:00.000Z"),
        }),
      },
      userSession: {
        create: userSessionCreate,
      },
    };

    const service = new AuthService(prisma as never, encryptionService as never, auditService as never);
    await expect(
      service.login({
        email: "owner@oku.local",
        password: "secret-pass",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({
          email: "owner@oku.local",
          role: "owner",
        }),
      }),
    );
    expect(userSessionCreate).toHaveBeenCalledOnce();
  });

  it("updates a workspace user role", async () => {
    const prisma = {
      user: {
        update: vi.fn().mockResolvedValue({
          id: "user_editor_1",
          workspaceId: "ws_seed_oku",
          email: "editor@oku.local",
          displayName: "Editor",
          role: "REVIEWER",
          lastLoginAt: null,
        }),
      },
    };

    const service = new AuthService(prisma as never, encryptionService as never, auditService as never);
    await expect(
      service.updateWorkspaceUserRole("user_editor_1", {
        role: "reviewer",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "user_editor_1",
        role: "reviewer",
      }),
    );
  });
});
