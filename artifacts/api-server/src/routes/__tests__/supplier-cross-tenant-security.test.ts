import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

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
  mockUpdateWhere,
  mockUpdateReturning,
  mockDeleteWhere,
  mockDeleteReturning,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn();
  const mockUpdateReturning = vi.fn();
  const mockDeleteWhere = vi.fn();
  const mockDeleteReturning = vi.fn();

  return {
    mockUpdateWhere,
    mockUpdateReturning,
    mockDeleteWhere,
    mockDeleteReturning,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mockUpdateWhere,
      })),
    })),

    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),

    select: vi.fn(),
    insert: vi.fn(),
  },

  suppliersTable: {
    id: "suppliers.id",
    companyId: "suppliers.company_id",
  },
}));

import suppliersRouter from "../suppliers";

function createTestApp(companyId: number): Express {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = {
      id: 1,
      companyId,
      email: `owner-${companyId}@example.com`,
      name: "Owner",
      role: "owner",
    };

    next();
  });

  app.use("/api", suppliersRouter);

  return app;
}

describe("Supplier cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateWhere.mockImplementation(() => ({
      returning: mockUpdateReturning,
    }));

    mockDeleteWhere.mockImplementation(() => ({
      returning: mockDeleteReturning,
    }));
  });

  it("returns 404 when Company A tries to update Company B supplier", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .patch("/api/suppliers/200")
      .send({
        name: "Blocked Cross-Tenant Update",
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Supplier not found",
    });

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockUpdateWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "suppliers.id",
          value: 200,
        },
        {
          type: "eq",
          column: "suppliers.company_id",
          value: 1,
        },
      ],
    });
  });

  it("returns 404 when Company A tries to delete Company B supplier", async () => {
    mockDeleteReturning.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .delete("/api/suppliers/200")
      .send();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Supplier not found",
    });

    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "suppliers.id",
          value: 200,
        },
        {
          type: "eq",
          column: "suppliers.company_id",
          value: 1,
        },
      ],
    });
  });
});
