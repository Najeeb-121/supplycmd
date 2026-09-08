import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockInventoryWhere,
  mockSearchRead,
  mockInventoryValues,
  mockInventoryOnConflictDoUpdate,
  mockInventoryDeleteWhere,
  mockSyncLogValues,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockInventoryWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockInventoryOnConflictDoUpdate = vi.fn();
  const mockInventoryValues = vi.fn(() => ({
    onConflictDoUpdate: mockInventoryOnConflictDoUpdate,
  }));

  const mockInventoryDeleteWhere = vi.fn();
  const mockSyncLogValues = vi.fn();

  return {
    mockConnectionWhere,
    mockInventoryWhere,
    mockSearchRead,
    mockInventoryValues,
    mockInventoryOnConflictDoUpdate,
    mockInventoryDeleteWhere,
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

    insert: vi.fn((table: { __kind?: string }) => ({
      values:
        table.__kind === "inventoryItems"
          ? mockInventoryValues
          : table.__kind === "odooSyncLog"
            ? mockSyncLogValues
            : vi.fn(),
    })),

    delete: vi.fn((table: { __kind?: string }) => ({
      where:
        table.__kind === "inventoryItems"
          ? mockInventoryDeleteWhere
          : vi.fn(),
    })),

    update: vi.fn(() => ({
      set: vi.fn(),
    })),

    transaction: vi.fn(),
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
    reservedQuantity: "inventory_items.reserved_quantity",
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

function validOdooProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 700,
    name: "Aluminium Coil",
    default_code: "AL-NEW",
    standard_price: 2.35,
    qty_available: 500,
    categ_id: [10, "Raw Materials"],
    product_tmpl_id: [701, "Aluminium Coil"],
    ...overrides,
  };
}

describe("Odoo inventory reconciliation", () => {
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
        reservedQuantity: 25,
      },
    ]);

    mockInventoryOnConflictDoUpdate.mockResolvedValue(undefined);
    mockInventoryDeleteWhere.mockResolvedValue(undefined);
    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("updates SKU from Odoo when an existing inventory item is reconciled", async () => {
    mockSearchRead.mockResolvedValue([
      validOdooProduct({
        default_code: "AL-UPDATED",
      }),
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/inventory")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(1);
    expect(res.body.failed).toBe(0);

    expect(mockInventoryOnConflictDoUpdate).toHaveBeenCalledTimes(1);

    const conflictArgs = mockInventoryOnConflictDoUpdate.mock.calls[0]?.[0];

    expect(conflictArgs?.set?.sku).toBe("AL-UPDATED");
  });

  it("rejects an Odoo product with no valid category instead of fabricating Uncategorized", async () => {
    mockSearchRead.mockResolvedValue([
      validOdooProduct({
        categ_id: false,
      }),
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/inventory")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toContain(
      "Product has an invalid Odoo ID, template ID, name, SKU, or category.",
    );

    expect(mockInventoryValues).not.toHaveBeenCalled();

    expect(
      JSON.stringify(mockInventoryValues.mock.calls),
    ).not.toContain("Uncategorized");
  });
});
