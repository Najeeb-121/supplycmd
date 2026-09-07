import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockInventoryWhere,
  mockSupplierWhere,
  mockSearchRead,
  mockTransaction,
  mockTxOrderReturning,
  mockTxDeleteWhere,
  mockTxLineValues,
  mockSyncLogValues,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockInventoryWhere = vi.fn();
  const mockSupplierWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockTxOrderReturning = vi.fn();
  const mockTxDeleteWhere = vi.fn();
  const mockTxLineValues = vi.fn();

  const mockTx = {
    insert: vi.fn((table: { __kind?: string }) => {
      if (table.__kind === "orders") {
        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() => ({
              returning: mockTxOrderReturning,
            })),
          })),
        };
      }

      if (table.__kind === "purchaseOrderLines") {
        return {
          values: mockTxLineValues,
        };
      }

      throw new Error(`Unexpected transaction insert: ${table.__kind}`);
    }),

    delete: vi.fn((table: { __kind?: string }) => {
      if (table.__kind !== "purchaseOrderLines") {
        throw new Error(`Unexpected transaction delete: ${table.__kind}`);
      }

      return {
        where: mockTxDeleteWhere,
      };
    }),
  };

  const mockTransaction = vi.fn(
    async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
  );

  const mockSyncLogValues = vi.fn();

  return {
    mockConnectionWhere,
    mockInventoryWhere,
    mockSupplierWhere,
    mockSearchRead,
    mockTransaction,
    mockTxOrderReturning,
    mockTxDeleteWhere,
    mockTxLineValues,
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
              : table.__kind === "suppliers"
                ? mockSupplierWhere
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

  suppliersTable: {
    __kind: "suppliers",
    id: "suppliers.id",
    companyId: "suppliers.company_id",
    odooId: "suppliers.odoo_id",
  },

  ordersTable: {
    __kind: "orders",
    id: "orders.id",
    companyId: "orders.company_id",
    odooId: "orders.odoo_id",
  },

  purchaseOrderLinesTable: {
    __kind: "purchaseOrderLines",
    companyId: "purchase_order_lines.company_id",
    orderId: "purchase_order_lines.order_id",
  },

  odooSyncLogTable: {
    __kind: "odooSyncLog",
  },

  stockMovementsTable: {},
  productionRunsTable: {},
  productionWorkOrdersTable: {},
  demandRecordsTable: {},
  salesOrdersTable: {},
  salesOrderLinesTable: {},
  bomsTable: {},
  bomLinesTable: {},
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

describe("Odoo procurement sync atomicity", () => {
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
        odooId: 700,
        name: "Aluminium Coil",
        sku: "AL-001",
      },
    ]);

    mockSupplierWhere.mockResolvedValue([
      {
        id: 200,
        companyId: 42,
        odooId: 300,
        name: "Supplier A",
      },
    ]);

    mockTxOrderReturning.mockResolvedValue([{ id: 500 }]);
    mockTxDeleteWhere.mockResolvedValue(undefined);
    mockTxLineValues.mockResolvedValue(undefined);
    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("fails the PO transaction instead of inventing a currency when Odoo omits currency", async () => {
    mockSearchRead
      .mockResolvedValueOnce([
        {
          id: 900,
          name: "PO0001",
          partner_id: [300, "Supplier A"],
          amount_total: 1000,
          state: "purchase",
          date_order: "2026-09-07 10:00:00",
          date_planned: "2026-09-10 10:00:00",
          order_line: [901],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 901,
          order_id: [900, "PO0001"],
          product_id: [700, "Aluminium Coil"],
          product_qty: 10,
          qty_received: 0,
          price_unit: 100,
          currency_id: false,
          date_planned: "2026-09-10 10:00:00",
        },
      ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/procurement")
      .send({});

    expect(res.status).toBe(200);

    expect(res.body.synced).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toEqual([
      "PO #900: PO line #901: Currency was not provided by Odoo.",
    ]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxDeleteWhere).toHaveBeenCalledTimes(1);
    expect(mockTxLineValues).not.toHaveBeenCalled();
  });
});
