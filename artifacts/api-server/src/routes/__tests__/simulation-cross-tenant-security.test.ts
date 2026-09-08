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
  mockSelect,
  mockSelectWhere,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();

  const mockSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: mockSelectWhere,
    })),
  }));

  return {
    mockSelect,
    mockSelectWhere,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
  },

  suppliersTable: {},
  inventoryItemsTable: {
    id: "inventory_items.id",
    odooId: "inventory_items.odoo_id",
    name: "inventory_items.name",
    currentStock: "inventory_items.current_stock",
    sellingPrice: "inventory_items.selling_price",
    unitCost: "inventory_items.unit_cost",
    safetyStock: "inventory_items.safety_stock",
    reorderPoint: "inventory_items.reorder_point",
    companyId: "inventory_items.company_id",
  },
  ordersTable: {},
  purchaseOrderLinesTable: {},
  salesOrdersTable: {},
  salesOrderLinesTable: {},
  odooConnectionsTable: {},
  productSuppliersTable: {},
  bomsTable: {},
  bomLinesTable: {},
  productionRunsTable: {},
  productionWorkOrdersTable: {},
}));

import simulationRouter from "../simulation";

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

  app.use("/api", simulationRouter);

  return app;
}

describe("Simulation cross-tenant security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when Company A tries to simulate Company B product", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);

    const app = createTestApp(1);

    const res = await request(app)
      .post("/api/simulation/run")
      .send({
        scenario: {
          id: "cross-tenant-product",
          type: "SUPPLIER_DELAY",
          title: "Cross-Tenant Product Attack",
          description: "Must not access another company's product",
          parameters: {
            productId: 900,
            supplierId: 700,
            delayDays: 7,
          },
        },
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "Product not found",
    });

    expect(mockSelectWhere).toHaveBeenCalledTimes(1);

    expect(mockSelectWhere).toHaveBeenCalledWith({
      type: "and",
      conditions: [
        {
          type: "eq",
          column: "inventory_items.id",
          value: 900,
        },
        {
          type: "eq",
          column: "inventory_items.company_id",
          value: 1,
        },
      ],
    });

    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
