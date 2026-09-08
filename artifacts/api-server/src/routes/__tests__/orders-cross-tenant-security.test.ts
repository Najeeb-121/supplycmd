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
  mockSelectWhere,
  mockUpdateWhere,
  mockUpdateReturning,
  mockInsertValues,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();
  const mockUpdateWhere = vi.fn();
  const mockUpdateReturning = vi.fn();
  const mockInsertValues = vi.fn();

  return {
    mockSelectWhere,
    mockUpdateWhere,
    mockUpdateReturning,
    mockInsertValues,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockSelectWhere,
      })),
    })),

    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mockUpdateWhere,
      })),
    })),

    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  },

  ordersTable: {
    id: "orders.id",
    companyId: "orders.company_id",
    orderDate: "orders.order_date",
  },

  suppliersTable: {
    id: "suppliers.id",
    companyId: "suppliers.company_id",
  },
}));

import ordersRouter from "../orders";

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

  app.use("/api", ordersRouter);

  return app;
}

describe("Orders cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateWhere.mockImplementation(() => ({
      returning: mockUpdateReturning,
    }));
  });

  it("rejects Company A creating an order with Company B supplier", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .post("/api/orders")
      .send({
        supplierId: 200,
        orderDate: "2026-09-08",
        expectedDelivery: "2026-09-15",
        status: "pending",
        totalValue: 1000,
        itemCount: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: {
        supplierId: "Supplier not found",
      },
    });

    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
    expect(mockSelectWhere).toHaveBeenCalledWith({
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

    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("returns 404 when Company A tries to update Company B order", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .patch("/api/orders/300")
      .send({
        status: "confirmed",
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Order not found",
    });

    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockUpdateWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "orders.id",
          value: 300,
        },
        {
          type: "eq",
          column: "orders.company_id",
          value: 1,
        },
      ],
    });
  });
});
