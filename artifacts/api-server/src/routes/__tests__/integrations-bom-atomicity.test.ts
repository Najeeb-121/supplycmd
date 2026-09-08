import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockInventoryWhere,
  mockSearchRead,
  mockTransaction,
  mockTxBomReturning,
  mockTxBomLineValues,
  mockSyncLogValues,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockInventoryWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockTxBomReturning = vi.fn();
  const mockTxBomLineValues = vi.fn();

  const mockTx = {
    insert: vi.fn((table: { __kind?: string }) => {
      if (table.__kind === "boms") {
        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() => ({
              returning: mockTxBomReturning,
            })),
          })),
        };
      }

      if (table.__kind === "bomLines") {
        return {
          values: mockTxBomLineValues,
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
    mockInventoryWhere,
    mockSearchRead,
    mockTransaction,
    mockTxBomReturning,
    mockTxBomLineValues,
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
    odooProductTemplateId: "inventory_items.odoo_product_template_id",
  },

  bomsTable: {
    __kind: "boms",
    id: "boms.id",
    companyId: "boms.company_id",
    odooBomId: "boms.odoo_bom_id",
  },

  bomLinesTable: {
    __kind: "bomLines",
    companyId: "bom_lines.company_id",
    odooLineId: "bom_lines.odoo_line_id",
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
  salesOrdersTable: {},
  salesOrderLinesTable: {},
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

describe("Odoo BOM sync atomicity", () => {
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
        odooProductTemplateId: 600,
        sku: "PEPSI-355",
      },
      {
        id: 101,
        companyId: 42,
        odooId: 701,
        odooProductTemplateId: 601,
        sku: "AL-001",
      },
    ]);

    mockTxBomReturning.mockResolvedValue([
      {
        id: 500,
      },
    ]);

    mockTxBomLineValues.mockImplementation(() => {
      throw new Error("BOM line write failed");
    });

    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("fails the BOM transaction when a component-line write fails", async () => {
    mockSearchRead
      .mockResolvedValueOnce([
        {
          id: 900,
          product_tmpl_id: [600, "Pepsi Can 355 ml"],
          product_qty: 1,
          type: "normal",
          active: true,
          sequence: 10,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 901,
          bom_id: [900, "Pepsi Can BOM"],
          product_id: [701, "Aluminium Coil"],
          product_qty: 0.014,
          uom_id: [1, "kg"],
        },
      ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/boms")
      .send({});

    expect(res.status).toBe(200);

    expect(res.body.synced).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toContain(
      "BOM #900: BOM line write failed",
    );

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxBomReturning).toHaveBeenCalledTimes(1);
    expect(mockTxBomLineValues).toHaveBeenCalledTimes(1);
  });
});
