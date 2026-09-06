import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createHash } from "node:crypto";

const {
  mockInvitationWhere,
  mockExistingUserWhere,
  mockCompanyWhere,
  mockAcceptedInvitationReturning,
  mockUserReturning,
  mockUserValues,
  mockTransaction,
  mockCreateSession,
} = vi.hoisted(() => {
  const mockInvitationWhere = vi.fn();
  const mockExistingUserWhere = vi.fn();
  const mockCompanyWhere = vi.fn();
  const mockAcceptedInvitationReturning = vi.fn();
  const mockUserReturning = vi.fn();
  const mockUserValues = vi.fn(
    (values: Record<string, unknown>) => ({
      returning: mockUserReturning,
    }),
  );
  const mockCreateSession = vi.fn();

  const mockTx = {
    select: vi.fn(() => ({
      from: vi.fn((table: { __kind?: string }) => ({
        where:
          table.__kind === "users"
            ? mockExistingUserWhere
            : mockCompanyWhere,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockAcceptedInvitationReturning,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: mockUserValues,
    })),
  };

  const mockTransaction = vi.fn(
    async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
  );

  return {
    mockInvitationWhere,
    mockExistingUserWhere,
    mockCompanyWhere,
    mockAcceptedInvitationReturning,
    mockUserReturning,
    mockUserValues,
    mockTransaction,
    mockCreateSession,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockInvitationWhere,
        innerJoin: vi.fn(() => ({
          where: vi.fn(),
        })),
      })),
    })),
    transaction: mockTransaction,
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },

  companyInvitationsTable: {
    __kind: "invitations",
    id: "company_invitations.id",
    companyId: "company_invitations.company_id",
    email: "company_invitations.email",
    role: "company_invitations.role",
    tokenHash: "company_invitations.token_hash",
    expiresAt: "company_invitations.expires_at",
    acceptedAt: "company_invitations.accepted_at",
  },

  usersTable: {
    __kind: "users",
    id: "users.id",
    companyId: "users.company_id",
    email: "users.email",
    passwordHash: "users.password_hash",
    name: "users.name",
    role: "users.role",
  },

  companiesTable: {
    __kind: "companies",
    id: "companies.id",
    name: "companies.name",
  },

  sessionsTable: {
    tokenHash: "sessions.token_hash",
  },
}));

vi.mock("../../lib/auth", () => ({
  SESSION_COOKIE_NAME: "session_token",

  hashToken: (token: string) =>
    createHash("sha256").update(token).digest("hex"),

  hashPassword: vi.fn(async () => "hashed-password"),

  verifyPassword: vi.fn(),

  createSession: mockCreateSession,

  cookieOptions: vi.fn(() => ({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  })),
}));

import authRouter from "../auth";

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
  return app;
}

function validInvitation() {
  return {
    id: 7,
    companyId: 42,
    email: "InvitedUser@Example.com",
    role: "member",
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
  };
}

describe("Invitation acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockInvitationWhere.mockResolvedValue([validInvitation()]);
    mockExistingUserWhere.mockResolvedValue([]);
    mockAcceptedInvitationReturning.mockResolvedValue([{ id: 7 }]);

    mockUserReturning.mockResolvedValue([
      {
        id: 101,
        companyId: 42,
        email: "inviteduser@example.com",
        name: "Invited User",
        role: "member",
      },
    ]);

    mockCompanyWhere.mockResolvedValue([
      {
        id: 42,
        name: "Tenant Company",
      },
    ]);

    mockCreateSession.mockResolvedValue({
      token: "session-token",
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  it("creates the user from invitation tenant and role only", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: "raw-invitation-token",
        name: "Invited User",
        password: "Password123!",
        companyId: 999,
        email: "attacker@example.com",
        role: "owner",
      });

    expect(res.status).toBe(201);

    expect(mockUserValues).toHaveBeenCalledTimes(1);

    const inserted = mockUserValues.mock.calls[0]?.[0];

    expect(inserted).toBeDefined();
    if (!inserted) {
      throw new Error("Expected inserted user values");
    }

    expect(inserted.companyId).toBe(42);
    expect(inserted.email).toBe("inviteduser@example.com");
    expect(inserted.role).toBe("member");
    expect(inserted.name).toBe("Invited User");

    expect(inserted.companyId).not.toBe(999);
    expect(inserted.email).not.toBe("attacker@example.com");
    expect(inserted.role).not.toBe("owner");

    expect(res.body.companyId).toBe(42);
    expect(res.body.companyName).toBe("Tenant Company");
    expect(res.body.role).toBe("member");
  });

  it("rejects an expired invitation", async () => {
    mockInvitationWhere.mockResolvedValueOnce([
      {
        ...validInvitation(),
        expiresAt: new Date(Date.now() - 60_000),
      },
    ]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: "expired-token",
        name: "Invited User",
        password: "Password123!",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invitation is invalid or expired",
    });

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an already accepted invitation", async () => {
    mockInvitationWhere.mockResolvedValueOnce([
      {
        ...validInvitation(),
        acceptedAt: new Date(),
      },
    ]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: "used-token",
        name: "Invited User",
        password: "Password123!",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invitation is invalid or expired",
    });

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects acceptance when the email already belongs to a user", async () => {
    mockExistingUserWhere.mockResolvedValueOnce([{ id: 55 }]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: "valid-token",
        name: "Invited User",
        password: "Password123!",
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "An account with this email already exists",
    });

    expect(mockUserValues).not.toHaveBeenCalled();
  });

  it("rejects a concurrent or reused invitation claim", async () => {
    mockAcceptedInvitationReturning.mockResolvedValueOnce([]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: "race-token",
        name: "Invited User",
        password: "Password123!",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invitation is invalid or expired",
    });

    expect(mockUserValues).not.toHaveBeenCalled();
  });

  it("creates a session cookie after successful acceptance", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: "valid-token",
        name: "Invited User",
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledWith(101);

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(String(cookies)).toContain("session_token=session-token");
  });
});
