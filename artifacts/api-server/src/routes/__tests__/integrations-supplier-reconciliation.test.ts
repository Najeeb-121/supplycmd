import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockSupplierWhere,
  mockOrdersWhere,
  mockInventoryWhere,
  mockProductSuppliersWhere,
  mockSearchRead,
  mockSupplierValues,
  mockProductSupplierValues,
  mockSyncLogValues,
  mockSupplierDeleteWhere,
  mockProductSupplierDeleteWhere,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockSupplierWhere = vi.fn();
  const mockOrdersWhere = vi.fn();
  const mockInventoryWhere = vi.fn();
  const mockProductSuppliersWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockSupplierValues = vi.fn(() => ({
    onConflictDoUpdate: vi.fn(),
  }));

  const mockProductSupplierValues = vi.fn(() => ({
    onConflictDoUpdate: vi.fn(),
  }));

  const mockSyncLogValues = vi.fn();
  const mockSupplierDeleteWhere = vi.fn();
  const mockProductSupplierDeleteWhere = vi.fn();

  return {
    mockConnectionWhere,
    mockSupplierWhere,
    mockOrdersWhere,
    mockInventoryWhere,
    mockProductSuppliersWhere,
    mockSearchRead,
    mockSupplierValues,
    mockProductSupplierValues,
    mockSyncLogValues,
    mockSupplierDeleteWhere,
    mockProductSupplierDeleteWhere,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: { __kind?: string }) => ({
        where:
          table.__kind === "odooConnections"
            ? mockConnectionWhere
            : table.__kind === "suppliers"
              ? mockSupplierWhere
              : table.__kind === "orders"
                ? mockOrdersWhere
                : table.__kind === "inventoryItems"
                  ? mockInventoryWhere
                  : table.__kind === "productSuppliers"
                    ? mockProductSuppliersWhere
                    : vi.fn(),
      })),
    })),

    insert: vi.fn((table: { __kind?: string }) => ({
      values:
        table.__kind === "suppliers"
          ? mockSupplierValues
          : table.__kind === "productSuppliers"
            ? mockProductSupplierValues
            : table.__kind === "odooSyncLog"
              ? mockSyncLogValues
              : vi.fn(),
    })),

    delete: vi.fn((table: { __kind?: string }) => ({
      where:
        table.__kind === "productSuppliers"
          ? mockProductSupplierDeleteWhere
          : table.__kind === "suppliers"
            ? mockSupplierDeleteWhere
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

  suppliersTable: {
    __kind: "suppliers",
    id: "suppliers.id",
    companyId: "suppliers.company_id",
    odooId: "suppliers.odoo_id",
  },

  ordersTable: {
    __kind: "orders",
    companyId: "orders.company_id",
  },

  inventoryItemsTable: {
    __kind: "inventoryItems",
    id: "inventory_items.id",
    companyId: "inventory_items.company_id",
    odooId: "inventory_items.odoo_id",
    odooProductTemplateId: "inventory_items.odoo_product_template_id",
  },

  productSuppliersTable: {
    __kind: "productSuppliers",
    id: "product_suppliers.id",
    companyId: "product_suppliers.company_id",
    inventoryItemId: "product_suppliers.inventory_item_id",
    supplierId: "product_suppliers.supplier_id",
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
  purchaseOrderLinesTable: {},
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

const supplier = {
  id: 200,
  companyId: 42,
  odooId: 300,
  name: "Supplier A",
  country: "Jordan",
  leadTimeDays: null,
  onTimeDeliveryRate: null,
  qualityScore: null,
  fillRate: null,
};

const inventoryItem = {
  id: 100,
  companyId: 42,
  odooId: 700,
  odooProductTemplateId: 701,
  name: "Aluminium Coil",
  sku: "AL-001",
};

function mockCommonSupplierFetches(productOdooId: number, templateOdooId = 701): void {
  mockSearchRead
    .mockResolvedValueOnce([
      {
        id: 800,
        partner_id: [300, "Supplier A"],
        product_id: [productOdooId, "Aluminium Coil"],
        product_tmpl_id: [templateOdooId, "Aluminium Coil"],
        product_code: "SUP-AL",
        price: 2.35,
        currency_id: [1, "JOD"],
        min_qty: 1,
        delay: 5,
        sequence: 1,
      },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: 300,
        name: "Supplier A",
        country_id: [110, "Jordan"],
      },
    ]);
}

describe("Odoo supplier relationship reconciliation", () => {
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

    mockSupplierWhere.mockResolvedValue([supplier]);
    mockOrdersWhere.mockResolvedValue([]);
    mockInventoryWhere.mockResolvedValue([inventoryItem]);

    mockSupplierDeleteWhere.mockResolvedValue(undefined);
    mockProductSupplierDeleteWhere.mockResolvedValue(undefined);
    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("deletes stale Odoo product-supplier relationships after a complete mapping", async () => {
    mockCommonSupplierFetches(700);

    mockProductSuppliersWhere.mockResolvedValue([
      {
        id: 10,
        companyId: 42,
        inventoryItemId: 100,
        supplierId: 200,
        source: "Odoo",
        sourceEntity: "product.supplierinfo",
      },
      {
        id: 11,
        companyId: 42,
        inventoryItemId: 101,
        supplierId: 200,
        source: "Odoo",
        sourceEntity: "product.supplierinfo",
      },
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/suppliers")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(0);

    expect(mockProductSupplierDeleteWhere).toHaveBeenCalledTimes(1);

    const condition = mockProductSupplierDeleteWhere.mock.calls[0]?.[0];
    expect(condition).toBeDefined();
    expect(JSON.stringify(condition)).toContain("42");
    expect(JSON.stringify(condition)).toContain("11");
  });

  it("preserves stale relationships when supplierinfo mapping is incomplete", async () => {
    mockCommonSupplierFetches(999, 998);

    mockProductSuppliersWhere.mockResolvedValue([
      {
        id: 11,
        companyId: 42,
        inventoryItemId: 101,
        supplierId: 200,
        source: "Odoo",
        sourceEntity: "product.supplierinfo",
      },
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/suppliers")
      .send({});

    expect(res.status).toBe(200);

    expect(mockProductSupplierDeleteWhere).not.toHaveBeenCalled();
  });
});
