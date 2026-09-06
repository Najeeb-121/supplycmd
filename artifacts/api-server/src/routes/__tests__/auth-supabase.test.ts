import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const {
  selectWhereMock,
  selectFromMock,
  selectMock,
  verifySupabaseAccessTokenMock,
} = vi.hoisted(() => {
  const selectWhereMock = vi.fn();
  const selectFromMock = vi.fn(() => ({
    where: selectWhereMock,
  }));
  const selectMock = vi.fn(() => ({
    from: selectFromMock,
  }));
  const verifySupabaseAccessTokenMock = vi.fn();

  return {
    selectWhereMock,
    selectFromMock,
    selectMock,
    verifySupabaseAccessTokenMock,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: selectMock,
  },
  usersTable: {
    id: "users.id",
    companyId: "users.company_id",
    email: "users.email",
    name: "users.name",
    role: "users.role",
    supabaseUserId: "users.supabase_user_id",
  },
  sessionsTable: {
    userId: "sessions.user_id",
    tokenHash: "sessions.token_hash",
    expiresAt: "sessions.expires_at",
  },
}));

vi.mock("../../lib/supabase", () => ({
  verifySupabaseAccessToken: verifySupabaseAccessTokenMock,
}));

import { requireAuth } from "../../middlewares/require-auth";

function createTestApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  return app;
}

describe("Supabase requireAuth", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("preserves the non-production E2E company header path", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    const response = await request(app)
      .get("/api/auth/me")
      .set("x-e2e-test-company-id", "7");

    process.env.NODE_ENV = previousNodeEnv;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 1,
      companyId: 7,
      email: "e2e-test@pepsico.local",
      role: "owner",
    });

    expect(verifySupabaseAccessTokenMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid Supabase bearer token", async () => {
    verifySupabaseAccessTokenMock.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid Supabase session",
    });

    expect(verifySupabaseAccessTokenMock).toHaveBeenCalledWith(
      "invalid-token",
    );
  });

  it("rejects a valid Supabase user that is not linked locally", async () => {
    verifySupabaseAccessTokenMock.mockResolvedValue({
      id: "53e9d377-96e1-4588-ac1b-444f8ccfce78",
      email: "new@example.com",
    });

    selectWhereMock.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer valid-unlinked-token");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Supabase user is not linked to a SupplyCMD account",
    });
  });

  it("maps a linked Supabase identity to the local SupplyCMD user and company", async () => {
    verifySupabaseAccessTokenMock.mockResolvedValue({
      id: "53e9d377-96e1-4588-ac1b-444f8ccfce78",
      email: "linked@example.com",
    });

    selectWhereMock.mockResolvedValue([
      {
        userId: 5,
        companyId: 9,
        email: "linked@example.com",
        name: "Linked User",
        role: "owner",
      },
    ]);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer valid-linked-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 5,
      companyId: 9,
      email: "linked@example.com",
      name: "Linked User",
      role: "owner",
    });
  });
});
