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

  salesOrdersTable: {
    companyId: "sales_orders.company_id",
    orderDate: "sales_orders.order_date",
  },

  salesOrderLinesTable: {
    companyId: "sales_order_lines.company_id",
  },
}));

import salesRouter from "../sales";

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

  app.use("/api", salesRouter);

  return app;
}

describe("Sales cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes sales metrics orders and lines to Company A", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .get("/api/sales/metrics");

    expect(res.status).toBe(200);

    expect(mockSelectWhere).toHaveBeenCalledTimes(2);

    expect(mockSelectWhere).toHaveBeenNthCalledWith(1, {
      type: "eq",
      column: "sales_orders.company_id",
      value: 1,
    });

    expect(mockSelectWhere).toHaveBeenNthCalledWith(2, {
      type: "eq",
      column: "sales_order_lines.company_id",
      value: 1,
    });
  });

  it("scopes top-product sales lines to Company A", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .get("/api/sales/top-products");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
    expect(mockSelectWhere).toHaveBeenCalledWith({
      type: "eq",
      column: "sales_order_lines.company_id",
      value: 1,
    });
  });
});
