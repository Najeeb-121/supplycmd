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
  };
});

const {
  mockSelectWhere,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();

  return {
    mockSelectWhere,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockSelectWhere,
      })),
    })),
  },

  bomsTable: {
    companyId: "boms.company_id",
  },

  bomLinesTable: {
    companyId: "bom_lines.company_id",
  },
}));

import manufacturingRouter from "../manufacturing";

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

  app.use("/api", manufacturingRouter);

  return app;
}

describe("Manufacturing cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes BoM and component reads to Company A", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .get("/api/manufacturing/boms");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    expect(mockSelectWhere).toHaveBeenCalledTimes(2);

    expect(mockSelectWhere).toHaveBeenNthCalledWith(1, {
      type: "eq",
      column: "boms.company_id",
      value: 1,
    });

    expect(mockSelectWhere).toHaveBeenNthCalledWith(2, {
      type: "eq",
      column: "bom_lines.company_id",
      value: 1,
    });
  });

  it("scopes manufacturing KPI inputs to Company A", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .get("/api/manufacturing/kpis");

    expect(res.status).toBe(200);

    expect(mockSelectWhere).toHaveBeenCalledTimes(2);

    expect(mockSelectWhere).toHaveBeenNthCalledWith(1, {
      type: "eq",
      column: "boms.company_id",
      value: 1,
    });

    expect(mockSelectWhere).toHaveBeenNthCalledWith(2, {
      type: "eq",
      column: "bom_lines.company_id",
      value: 1,
    });
  });
});
