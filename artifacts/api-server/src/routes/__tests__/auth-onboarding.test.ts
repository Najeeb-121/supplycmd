import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockUserWhere,
  mockInnerJoinWhere,
  mockCompanyReturning,
  mockUserReturning,
  mockUserValues,
  mockCreateSession,
  mockVerifyPassword,
} = vi.hoisted(() => {
  const mockUserWhere = vi.fn();
  const mockInnerJoinWhere = vi.fn();
  const mockCompanyReturning = vi.fn();
  const mockUserReturning = vi.fn();

  const mockUserValues = vi.fn(
    (values: Record<string, unknown>) => ({
      returning: mockUserReturning,
    }),
  );

  const mockCreateSession = vi.fn();
  const mockVerifyPassword = vi.fn();

  return {
    mockUserWhere,
    mockInnerJoinWhere,
    mockCompanyReturning,
    mockUserReturning,
    mockUserValues,
    mockCreateSession,
    mockVerifyPassword,
  };
});

vi.mock("@workspace/db", () => {
  const mockTx = {
    insert: vi.fn((table: { __kind?: string }) => {
      if (table.__kind === "companies") {
        return {
          values: vi.fn(() => ({
            returning: mockCompanyReturning,
          })),
        };
      }

      return {
        values: mockUserValues,
      };
    }),
  };

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: { __kind?: string }) => {
          if (table.__kind === "users") {
            return {
              where: mockUserWhere,
              innerJoin: vi.fn(() => ({
                where: mockInnerJoinWhere,
              })),
            };
          }

          return {
            where: vi.fn(),
          };
        }),
      })),

      transaction: vi.fn(
        async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
      ),

      insert: vi.fn(() => ({
        values: vi.fn(),
      })),

      delete: vi.fn(() => ({
        where: vi.fn(),
      })),
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

    sessionsTable: {
      tokenHash: "sessions.token_hash",
    },
  };
});

vi.mock("../../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../../lib/auth")>(
    "../../lib/auth",
  );

  return {
    ...actual,
    hashPassword: vi.fn(async () => "hashed-password"),
    verifyPassword: mockVerifyPassword,
    createSession: mockCreateSession,
    cookieOptions: vi.fn(() => ({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })),
  };
});

import authRouter from "../auth";
import { normalizeEmail } from "../../lib/auth";

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", authRouter);
  return app;
}

describe("Auth onboarding email normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUserWhere.mockResolvedValue([]);

    mockCompanyReturning.mockResolvedValue([
      {
        id: 42,
        name: "New Company",
      },
    ]);

    mockUserReturning.mockResolvedValue([
      {
        id: 101,
        companyId: 42,
        email: "newuser@example.com",
        name: "New User",
        role: "owner",
      },
    ]);

    mockCreateSession.mockResolvedValue({
      token: "session-token",
      expiresAt: new Date(Date.now() + 60_000),
    });

    mockVerifyPassword.mockResolvedValue(true);
  });

  it("normalizes email values consistently", () => {
    expect(normalizeEmail("  NewUser@Example.COM  ")).toBe(
      "newuser@example.com",
    );
  });

  it("stores a normalized lowercase email during signup", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        companyName: "New Company",
        name: "New User",
        email: "NewUser@Example.COM",
        password: "Password123!",
      });

    expect(res.status).toBe(201);
    expect(mockUserValues).toHaveBeenCalledTimes(1);

    const inserted = mockUserValues.mock.calls[0]?.[0];

    expect(inserted).toBeDefined();
    if (!inserted) {
      throw new Error("Expected signup user values");
    }

    expect(inserted.email).toBe("newuser@example.com");
    expect(inserted.companyId).toBe(42);
    expect(inserted.role).toBe("owner");
  });

  it("rejects a case-insensitive duplicate during signup", async () => {
    mockUserWhere.mockResolvedValueOnce([{ id: 5 }]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        companyName: "Another Company",
        name: "Duplicate User",
        email: "ExistingUser@Example.com",
        password: "Password123!",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: {
        email: "An account with this email already exists",
      },
    });

    expect(mockUserValues).not.toHaveBeenCalled();
  });

  it("logs in with a differently-cased email", async () => {
    mockInnerJoinWhere.mockResolvedValueOnce([
      {
        id: 7,
        email: "MixedCase@Example.com",
        name: "Mixed User",
        role: "owner",
        passwordHash: "stored-hash",
        companyId: 1,
        companyName: "Pepsico",
      },
    ]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "mixedcase@example.COM",
        password: "Password123!",
      });

    expect(res.status).toBe(200);
    expect(mockVerifyPassword).toHaveBeenCalledWith(
      "Password123!",
      "stored-hash",
    );
    expect(mockCreateSession).toHaveBeenCalledWith(7);
  });

  it("trims surrounding whitespace during login", async () => {
    mockInnerJoinWhere.mockResolvedValueOnce([
      {
        id: 8,
        email: "user@example.com",
        name: "User",
        role: "owner",
        passwordHash: "stored-hash",
        companyId: 1,
        companyName: "Pepsico",
      },
    ]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "  USER@example.com  ",
        password: "Password123!",
      });

    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith(8);
  });
});
