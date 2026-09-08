import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockInventoryWhere,
  mockSearchRead,
  mockTransaction,
  mockTxSalesOrderReturning,
  mockTxSalesLineValues,
  mockSyncLogValues,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockInventoryWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockTxSalesOrderReturning = vi.fn();
  const mockTxSalesLineValues = vi.fn();

  const mockTx = {
    insert: vi.fn((table: { __kind?: string }) => {
      if (table.__kind === "salesOrders") {
        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() => ({
              returning: mockTxSalesOrderReturning,
            })),
          })),
        };
      }

      if (table.__kind === "salesOrderLines") {
        return {
          values: mockTxSalesLineValues,
        };
      }

      throw new Error(`Unexpected transaction insert: ${table.__kind}`);
    }),

    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  };

  const mockTransaction = vi.fn(
    async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
  );

  const mockSyncLogValues = vi.fn();

  return {
    mockConnectionWhere,
    mockInventoryWhere,
    mockSearchRead,
    mockTransaction,
    mockTxSalesOrderReturning,
    mockTxSalesLineValues,
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
            : table.__kind === "inventoryItems"
              ? mockInventoryWhere
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

  inventoryItemsTable: {
    __kind: "inventoryItems",
    id: "inventory_items.id",
    companyId: "inventory_items.company_id",
    odooId: "inventory_items.odoo_id",
  },

  salesOrdersTable: {
    __kind: "salesOrders",
    id: "sales_orders.id",
    companyId: "sales_orders.company_id",
    odooId: "sales_orders.odoo_id",
  },

  salesOrderLinesTable: {
    __kind: "salesOrderLines",
    companyId: "sales_order_lines.company_id",
    odooId: "sales_order_lines.odoo_id",
    orderId: "sales_order_lines.order_id",
  },

  odooSyncLogTable: {
    __kind: "odooSyncLog",
  },

  suppliersTable: {},
  ordersTable: {},
  stockMovementsTable: {},
  productionRunsTable: {},
  productionWorkOrdersTable: {},
  demandRecordsTable: {},
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

describe("Odoo sales sync atomicity", () => {
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

    mockInventoryWhere.mockResolvedValue([
      {
        id: 100,
        companyId: 42,
        odooId: 701,
        name: "Pepsi Can 355 ml",
        sku: "PEPSI-355",
      },
    ]);

    mockTxSalesOrderReturning.mockResolvedValue([
      {
        id: 500,
      },
    ]);

    mockTxSalesLineValues.mockImplementation(() => {
      throw new Error("Sales line write failed");
    });

    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("fails the sales-order transaction when a line write fails", async () => {
    mockSearchRead
      .mockResolvedValueOnce([
        {
          id: 900,
          name: "SO900",
          partner_id: [300, "Petra Retail Group"],
          amount_untaxed: 1000,
          amount_tax: 160,
          amount_total: 1160,
          currency_id: [1, "JOD"],
          state: "sale",
          date_order: "2026-09-08 09:00:00",
          commitment_date: "2026-09-10 09:00:00",
          order_line: [901],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 901,
          order_id: [900, "SO900"],
          product_id: [701, "Pepsi Can 355 ml"],
          name: "Pepsi Can 355 ml",
          product_uom_qty: 100,
          qty_delivered: 0,
          qty_invoiced: 0,
          price_unit: 10,
          discount: 0,
          price_subtotal: 1000,
          currency_id: [1, "JOD"],
          state: "sale",
        },
      ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/sales")
      .send({});

    expect(res.status).toBe(200);

    expect(res.body.synced).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toContain(
      "SO #900: Sales line write failed",
    );

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxSalesOrderReturning).toHaveBeenCalledTimes(1);
    expect(mockTxSalesLineValues).toHaveBeenCalledTimes(1);
  });
});