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
  mockDeleteWhere,
  mockDeleteReturning,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();
  const mockUpdateWhere = vi.fn();
  const mockDeleteWhere = vi.fn();
  const mockDeleteReturning = vi.fn();

  return {
    mockSelectWhere,
    mockUpdateWhere,
    mockDeleteWhere,
    mockDeleteReturning,
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
        where: vi.fn(() => ({
          returning: mockUpdateWhere,
        })),
      })),
    })),

    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),

    insert: vi.fn(),
  },

  inventoryItemsTable: {
    id: "inventory_items.id",
    companyId: "inventory_items.company_id",
  },

  stockMovementsTable: {},
  productSuppliersTable: {},
  purchaseOrderLinesTable: {},
  suppliersTable: {},
}));

import inventoryRouter from "../inventory";

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

  app.use("/api", inventoryRouter);

  return app;
}

describe("Inventory cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteWhere.mockImplementation(() => ({
      returning: mockDeleteReturning,
    }));
  });

  it("returns 404 when Company A requests Company B inventory item ID", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .get("/api/inventory/200")
      .send();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Inventory item not found",
    });

    expect(mockSelectWhere).toHaveBeenCalledTimes(1);
    expect(mockSelectWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "inventory_items.id",
          value: 200,
        },
        {
          type: "eq",
          column: "inventory_items.company_id",
          value: 1,
        },
      ],
    });
  });

  it("returns 404 and does not update when Company A targets Company B inventory item ID", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .patch("/api/inventory/200")
      .send({
        currentStock: 999,
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Inventory item not found",
    });
    expect(mockUpdateWhere).not.toHaveBeenCalled();
    expect(mockSelectWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "inventory_items.id",
          value: 200,
        },
        {
          type: "eq",
          column: "inventory_items.company_id",
          value: 1,
        },
      ],
    });
  });

  it("returns 404 when Company A tries to delete Company B inventory item ID", async () => {
    mockDeleteReturning.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .delete("/api/inventory/200")
      .send();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Inventory item not found",
    });

    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "inventory_items.id",
          value: 200,
        },
        {
          type: "eq",
          column: "inventory_items.company_id",
          value: 1,
        },
      ],
    });
  });
});
