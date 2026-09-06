import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn();

  const mockInnerJoin = vi.fn(() => ({
    where: mockWhere,
  }));

  const mockFrom = vi.fn(() => ({
    innerJoin: mockInnerJoin,
  }));

  const mockSelect = vi.fn(() => ({
    from: mockFrom,
  }));

  return {
    mockWhere,
    mockInnerJoin,
    mockFrom,
    mockSelect,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: mocks.mockSelect,
  },
  sessionsTable: {
    userId: "user_id",
    tokenHash: "token_hash",
    expiresAt: "expires_at",
  },
  usersTable: {
    id: "id",
    companyId: "company_id",
    email: "email",
    name: "name",
    role: "role",
  },
}));

vi.mock("../lib/auth", () => ({
  SESSION_COOKIE_NAME: "supplycmd_session",
  hashToken: vi.fn(() => "hashed-token"),
}));

import { requireAuth, requireRole } from "../middlewares/require-auth";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it("allows a user whose role is permitted", () => {
    const req = {
      user: {
        id: 1,
        companyId: 1,
        email: "owner@example.com",
        name: "Owner",
        role: "owner",
      },
    } as Request;

    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    const middleware = requireRole("owner", "admin");
    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a user whose role is not permitted", () => {
    const req = {
      user: {
        id: 2,
        companyId: 1,
        email: "member@example.com",
        name: "Member",
        role: "member",
      },
    } as Request;

    const status = vi.fn();
    const json = vi.fn();
    status.mockReturnValue({ json });

    const res = {
      status,
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    const middleware = requireRole("owner", "admin");
    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects when no authenticated user is present", () => {
    const req = {} as Request;

    const status = vi.fn();
    const json = vi.fn();
    status.mockReturnValue({ json });

    const res = {
      status,
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    const middleware = requireRole("owner");
    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an authenticated session when the stored user role is invalid", async () => {
    mocks.mockWhere.mockResolvedValueOnce([
      {
        userId: 7,
        companyId: 3,
        email: "invalid-role@example.com",
        name: "Invalid Role User",
        role: "superadmin",
      },
    ]);

    const req = {
      cookies: {
        supplycmd_session: "raw-token",
      },
      headers: {},
    } as unknown as Request;

    const status = vi.fn();
    const json = vi.fn();

    status.mockReturnValue({ json });

    const res = {
      status,
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Invalid user role" });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});
