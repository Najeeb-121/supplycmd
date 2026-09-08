import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockSearchRead,
  mockTransaction,
  mockTxProductionReturning,
  mockTxWorkOrderValues,
  mockSyncLogValues,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockTxProductionReturning = vi.fn();
  const mockTxWorkOrderValues = vi.fn();

  const mockTx = {
    insert: vi.fn((table: { __kind?: string }) => {
      if (table.__kind === "productionRuns") {
        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() => ({
              returning: mockTxProductionReturning,
            })),
          })),
        };
      }

      if (table.__kind === "productionWorkOrders") {
        return {
          values: mockTxWorkOrderValues,
        };
      }

      throw new Error(`Unexpected transaction insert: ${table.__kind}`);
    }),
  };

  const mockTransaction = vi.fn(
    async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
  );

  const mockSyncLogValues = vi.fn();

  return {
    mockConnectionWhere,
    mockSearchRead,
    mockTransaction,
    mockTxProductionReturning,
    mockTxWorkOrderValues,
    mockSyncLogValues,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: { __kind?: string }) => ({
        where:
          table.__kind === "odooConnections"
            ? mockConnectionWhere
            : vi.fn(),
      })),
    })),

    transaction: mockTransaction,

    insert: vi.fn((table: { __kind?: string }) => ({
      values:
        table.__kind === "odooSyncLog"
          ? mockSyncLogValues
          : vi.fn(),
    })),

    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },

  odooConnectionsTable: {
    __kind: "odooConnections",
    companyId: "odoo_connections.company_id",
    url: "odoo_connections.url",
    db: "odoo_connections.db",
    username: "odoo_connections.username",
    apiKeyEncrypted: "odoo_connections.api_key_encrypted",
  },

  productionRunsTable: {
    __kind: "productionRuns",
    id: "production_runs.id",
    companyId: "production_runs.company_id",
    odooId: "production_runs.odoo_id",
  },

  productionWorkOrdersTable: {
    __kind: "productionWorkOrders",
    id: "production_work_orders.id",
    companyId: "production_work_orders.company_id",
    odooWorkOrderId: "production_work_orders.odoo_work_order_id",
  },

  odooSyncLogTable: {
    __kind: "odooSyncLog",
  },

  inventoryItemsTable: {},
  suppliersTable: {},
  ordersTable: {},
  stockMovementsTable: {},
  demandRecordsTable: {},
  salesOrdersTable: {},
  salesOrderLinesTable: {},
  bomsTable: {},
  bomLinesTable: {},
  purchaseOrderLinesTable: {},
  productSuppliersTable: {},
}));

vi.mock("@workspace/integrations-odoo-server", () => ({
  OdooClient: vi.fn(function MockOdooClient() {
    return {
      searchRead: mockSearchRead,
    };
  }),
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(() => "decrypted-key"),
}));

import integrationsRouter from "../integrations";

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

  app.use("/api", integrationsRouter);

  return app;
}

describe("Odoo production sync atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConnectionWhere.mockResolvedValue([
      {
        url: "https://company-a.odoo.com",
        db: "company-a",
        username: "owner@example.com",
        apiKeyEncrypted: "encrypted-key",
      },
    ]);

    mockTxProductionReturning.mockResolvedValue([{ id: 500 }]);

    mockTxWorkOrderValues.mockImplementation(() => {
      throw new Error("Work order write failed");
    });

    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("fails the manufacturing-order transaction when a work-order write fails", async () => {
    mockSearchRead
      .mockResolvedValueOnce([
        {
          id: 900,
          product_id: [700, "Pepsi Can 355 ml"],
          product_qty: 100,
          qty_producing: 50,
          date_start: "2026-09-08 08:00:00",
          date_deadline: "2026-09-09 08:00:00",
          bom_id: [300, "Pepsi Can BOM"],
          state: "progress",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 901,
          production_id: [900, "MO/0001"],
          workcenter_id: [400, "Can Printing Line"],
          duration_expected: 60,
          duration: 30,
          state: "progress",
        },
      ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/production")
      .send({});

    expect(res.status).toBe(200);

    expect(res.body.synced).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toContain(
      "MO #900: Work order write failed",
    );

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxProductionReturning).toHaveBeenCalledTimes(1);
    expect(mockTxWorkOrderValues).toHaveBeenCalledTimes(1);
  });
});
