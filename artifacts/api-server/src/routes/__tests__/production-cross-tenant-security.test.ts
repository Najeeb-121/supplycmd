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
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn();
  const mockUpdateReturning = vi.fn();

  return {
    mockUpdateWhere,
    mockUpdateReturning,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mockUpdateWhere,
      })),
    })),

    select: vi.fn(),
    insert: vi.fn(),
  },

  productionRunsTable: {
    id: "production_runs.id",
    companyId: "production_runs.company_id",
    runDate: "production_runs.run_date",
  },
}));

import productionRouter from "../production";

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

  app.use("/api", productionRouter);

  return app;
}

describe("Production cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateWhere.mockImplementation(() => ({
      returning: mockUpdateReturning,
    }));
  });

  it("returns 404 when Company A tries to update Company B production run", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .patch("/api/production/400")
      .send({
        actualUnits: 999,
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Production run not found",
    });

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockUpdateWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "production_runs.id",
          value: 400,
        },
        {
          type: "eq",
          column: "production_runs.company_id",
          value: 1,
        },
      ],
    });
  });
});
