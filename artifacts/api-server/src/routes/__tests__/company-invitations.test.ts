import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createHash } from "node:crypto";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();

  return {
    ...actual,
    eq: vi.fn((column: unknown, value: unknown) => ({
      type: "eq",
      column,
      value,
    })),
    and: vi.fn((...conditions: unknown[]) => ({
      type: "and",
      conditions,
    })),
  };
});

const {
  mockUserWhere,
  mockInvitationWhere,
  mockInvitationUpdateWhere,
  mockInvitationUpdateSet,
  mockInvitationInsertValues,
} = vi.hoisted(() => {
  const mockUserWhere = vi.fn();
  const mockInvitationWhere = vi.fn();
  const mockInvitationUpdateWhere = vi.fn();
  const mockInvitationUpdateSet = vi.fn(
    (values: Record<string, unknown>) => ({
      where: mockInvitationUpdateWhere,
    }),
  );
  const mockInvitationInsertValues = vi.fn();

  return {
    mockUserWhere,
    mockInvitationWhere,
    mockInvitationUpdateWhere,
    mockInvitationUpdateSet,
    mockInvitationInsertValues,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn((selection?: unknown) => ({
      from: vi.fn((table: unknown) => ({
        where:
          (table as { __kind?: string }).__kind === "users"
            ? mockUserWhere
            : mockInvitationWhere,
      })),
    })),
    insert: vi.fn(() => ({
      values: mockInvitationInsertValues,
    })),
    update: vi.fn(() => ({
      set: mockInvitationUpdateSet,
    })),
  },
  usersTable: {
    __kind: "users",
    id: "users.id",
    companyId: "users.company_id",
    email: "users.email",
    name: "users.name",
    role: "users.role",
  },
  companyInvitationsTable: {
    __kind: "companyInvitations",
    id: "company_invitations.id",
    companyId: "company_invitations.company_id",
    email: "company_invitations.email",
    role: "company_invitations.role",
    expiresAt: "company_invitations.expires_at",
    acceptedAt: "company_invitations.accepted_at",
    createdAt: "company_invitations.created_at",
  },
}));

import companyInvitationsRouter from "../company-invitations";

function createTestApp(companyId = 1): Express {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = {
      id: 11,
      companyId,
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
    };
    next();
  });

  app.use("/api", companyInvitationsRouter);

  return app;
}

describe("Company invitation behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserWhere.mockResolvedValue([]);
    mockInvitationWhere.mockResolvedValue([]);
    mockInvitationInsertValues.mockResolvedValue([]);
    mockInvitationUpdateWhere.mockResolvedValue([]);
  });

  it("lists only users from the authenticated company", async () => {
    mockUserWhere.mockResolvedValueOnce([
      {
        id: 11,
        name: "Company A Owner",
        email: "owner@example.com",
        role: "owner",
      },
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .get("/api/company/users")
      .query({
        companyId: 999,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 11,
        name: "Company A Owner",
        email: "owner@example.com",
        role: "owner",
      },
    ]);

    expect(mockUserWhere).toHaveBeenCalledTimes(1);
    expect(mockUserWhere).toHaveBeenCalledWith({
      type: "eq",
      column: "users.company_id",
      value: 42,
    });
  });

  it("lists only invitations from the authenticated company without exposing token hashes", async () => {
    mockInvitationWhere.mockResolvedValueOnce([
      {
        id: 7,
        email: "invitee@example.com",
        role: "member",
        expiresAt: new Date("2026-09-15T12:00:00.000Z"),
        acceptedAt: null,
        createdAt: new Date("2026-09-08T12:00:00.000Z"),
      },
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .get("/api/company/invitations")
      .query({
        companyId: 999,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 7,
        email: "invitee@example.com",
        role: "member",
        expiresAt: "2026-09-15T12:00:00.000Z",
        acceptedAt: null,
        createdAt: "2026-09-08T12:00:00.000Z",
      },
    ]);

    expect(res.body[0]).not.toHaveProperty("tokenHash");

    expect(mockInvitationWhere).toHaveBeenCalledTimes(1);
    expect(mockInvitationWhere).toHaveBeenCalledWith({
      type: "eq",
      column: "company_invitations.company_id",
      value: 42,
    });
  });

  it("rejects an email that already belongs to a user", async () => {
    mockUserWhere.mockResolvedValueOnce([{ id: 99 }]);

    const app = createTestApp();

    const res = await request(app)
      .post("/api/company/invitations")
      .send({
        email: "ExistingUser@Example.com",
        role: "member",
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "An account with this email already exists",
    });

    expect(mockInvitationInsertValues).not.toHaveBeenCalled();
  });

  it("stores a token hash instead of the raw token", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/api/company/invitations")
      .send({
        email: "NewUser@Example.com",
        role: "member",
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("newuser@example.com");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token).not.toHaveLength(0);

    expect(mockInvitationInsertValues).toHaveBeenCalledTimes(1);

    const inserted = mockInvitationInsertValues.mock.calls[0][0];
    const expectedHash = createHash("sha256")
      .update(res.body.token)
      .digest("hex");

    expect(inserted.tokenHash).toBe(expectedHash);
    expect(inserted.tokenHash).not.toBe(res.body.token);
  });

  it("uses only the authenticated user's company id", async () => {
    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/company/invitations")
      .send({
        email: "tenant@example.com",
        role: "admin",
        companyId: 999,
      });

    expect(res.status).toBe(201);

    const inserted = mockInvitationInsertValues.mock.calls[0][0];

    expect(inserted.companyId).toBe(42);
    expect(inserted.companyId).not.toBe(999);
    expect(inserted.createdByUserId).toBe(11);
  });

  it("rotates the token when resending an existing invitation", async () => {
    mockInvitationWhere.mockResolvedValueOnce([{ id: 7 }]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/company/invitations")
      .send({
        email: "resend@example.com",
        role: "admin",
      });

    expect(res.status).toBe(201);
    expect(mockInvitationInsertValues).not.toHaveBeenCalled();
    expect(mockInvitationUpdateSet).toHaveBeenCalledTimes(1);

    const updated = mockInvitationUpdateSet.mock.calls[0]?.[0];

    expect(updated).toBeDefined();
    if (!updated) {
      throw new Error("Expected invitation update values");
    }
    const expectedHash = createHash("sha256")
      .update(res.body.token)
      .digest("hex");

    expect(updated.tokenHash).toBe(expectedHash);
    expect(updated.acceptedAt).toBeNull();
    expect(updated.role).toBe("admin");
    expect(updated.createdByUserId).toBe(11);
    expect(mockInvitationUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockInvitationUpdateWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "company_invitations.id",
          value: 7,
        },
        {
          type: "eq",
          column: "company_invitations.company_id",
          value: 42,
        },
      ],
    });
  });
});
