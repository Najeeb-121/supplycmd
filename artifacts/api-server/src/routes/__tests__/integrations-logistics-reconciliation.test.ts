import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockInventoryWhere,
  mockSearchRead,
  mockMovementValues,
  mockMovementOnConflictDoUpdate,
  mockMovementDeleteWhere,
  mockSyncLogValues,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();
  const mockInventoryWhere = vi.fn();
  const mockSearchRead = vi.fn();

  const mockMovementOnConflictDoUpdate = vi.fn();
  const mockMovementValues = vi.fn(
    (_values: Record<string, unknown>) => ({
      onConflictDoUpdate: mockMovementOnConflictDoUpdate,
    }),
  );

  const mockMovementDeleteWhere = vi.fn();
  const mockSyncLogValues = vi.fn();

  return {
    mockConnectionWhere,
    mockInventoryWhere,
    mockSearchRead,
    mockMovementValues,
    mockMovementOnConflictDoUpdate,
    mockMovementDeleteWhere,
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
        table.__kind === "stockMovements"
          ? mockMovementValues
          : table.__kind === "odooSyncLog"
            ? mockSyncLogValues
            : vi.fn(),
    })),

    delete: vi.fn((table: { __kind?: string }) => ({
      where:
        table.__kind === "stockMovements"
          ? mockMovementDeleteWhere
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
  },

  stockMovementsTable: {
    __kind: "stockMovements",
    id: "stock_movements.id",
    companyId: "stock_movements.company_id",
    odooId: "stock_movements.odoo_id",
  },

  odooSyncLogTable: {
    __kind: "odooSyncLog",
  },

  suppliersTable: {},
  ordersTable: {},
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

function mockLogisticsFetch(
  pickingCode: "incoming" | "outgoing",
): void {
  mockSearchRead
    .mockResolvedValueOnce([
      {
        id: 900,
        product_id: [700, "Aluminium Coil"],
        date: "2026-09-08 07:30:00",
        picking_type_id: [50, "Picking Type"],
        origin_returned_move_id: false,
        quantity: 125,
        product_uom_qty: 999,
        reference: "WH/TEST/0001",
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 50,
        code: pickingCode,
      },
    ]);
}

describe("Odoo logistics reconciliation", () => {
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
      },
    ]);

    mockMovementOnConflictDoUpdate.mockResolvedValue(undefined);
    mockMovementDeleteWhere.mockResolvedValue(undefined);
    mockSyncLogValues.mockResolvedValue(undefined);
  });

  it("uses actual Odoo quantity and stores an outgoing move as a negative delta", async () => {
    mockLogisticsFetch("outgoing");

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/logistics")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(1);
    expect(res.body.failed).toBe(0);

    const stockMoveCall = mockSearchRead.mock.calls[0];

    expect(stockMoveCall?.[0]).toBe("stock.move");
    expect(stockMoveCall?.[2]).toContain("quantity");
    expect(stockMoveCall?.[2]).not.toContain("product_uom_qty");

    expect(mockMovementValues).toHaveBeenCalledTimes(1);

    const inserted = mockMovementValues.mock.calls[0]?.[0];

    expect(inserted.quantityChanged).toBe(-125);
    expect(inserted.quantityChanged).not.toBe(-999);
    expect(inserted.action).toBe("completed");

    expect(mockMovementOnConflictDoUpdate).toHaveBeenCalledTimes(1);

    const conflictArgs =
      mockMovementOnConflictDoUpdate.mock.calls[0]?.[0];

    expect(conflictArgs?.set?.quantityChanged).toBe(-125);
    expect(conflictArgs?.set?.action).toBe("completed");

    expect(mockMovementDeleteWhere).toHaveBeenCalledTimes(1);

    const cleanupCondition =
      mockMovementDeleteWhere.mock.calls[0]?.[0];

    expect(JSON.stringify(cleanupCondition)).toContain("42");
  });

  it("stores an incoming Odoo move as a positive delta", async () => {
    mockLogisticsFetch("incoming");

    const app = createTestApp(42);

    const res = await request(app)
      .post("/api/integrations/odoo/sync/logistics")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(1);
    expect(res.body.failed).toBe(0);

    expect(mockMovementValues).toHaveBeenCalledTimes(1);

    const inserted = mockMovementValues.mock.calls[0]?.[0];

    expect(inserted.quantityChanged).toBe(125);
    expect(inserted.action).toBe("completed");

    const conflictArgs =
      mockMovementOnConflictDoUpdate.mock.calls[0]?.[0];

    expect(conflictArgs?.set?.quantityChanged).toBe(125);
    expect(conflictArgs?.set?.action).toBe("completed");
  });
});
