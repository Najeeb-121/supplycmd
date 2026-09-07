import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const {
  mockConnectionWhere,
  mockSelectFrom,
} = vi.hoisted(() => {
  const mockConnectionWhere = vi.fn();

  const mockSelectFrom = vi.fn(() => ({
    where: mockConnectionWhere,
  }));

  return {
    mockConnectionWhere,
    mockSelectFrom,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: mockSelectFrom,
    })),

    insert: vi.fn(() => ({
      values: vi.fn(),
    })),

    update: vi.fn(() => ({
      set: vi.fn(),
    })),

    delete: vi.fn(() => ({
      where: vi.fn(),
    })),

    transaction: vi.fn(),
  },

  odooConnectionsTable: {
    companyId: "odoo_connections.company_id",
    url: "odoo_connections.url",
    db: "odoo_connections.db",
    username: "odoo_connections.username",
    apiKeyEncrypted: "odoo_connections.api_key_encrypted",
  },

  suppliersTable: {},
  inventoryItemsTable: {},
  odooSyncLogTable: {},
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
  OdooClient: vi.fn(),
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

describe("Odoo tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads only the authenticated company's Odoo connection", async () => {
    mockConnectionWhere.mockResolvedValueOnce([
      {
        url: "https://company-a.odoo.com",
        db: "company-a",
        username: "owner-a@example.com",
      },
    ]);

    const app = createTestApp(42);

    const res = await request(app)
      .get("/api/integrations/odoo/connection")
      .query({
        companyId: 999,
      });

    expect(res.status).toBe(200);

    expect(res.body).toMatchObject({
      connected: true,
      url: "https://company-a.odoo.com",
      db: "company-a",
      username: "owner-a@example.com",
    });

    expect(mockConnectionWhere).toHaveBeenCalledTimes(1);

    const condition = mockConnectionWhere.mock.calls[0]?.[0];

    expect(condition).toBeDefined();
    expect(JSON.stringify(condition)).toContain("42");
    expect(JSON.stringify(condition)).not.toContain("999");
  });

  it("does not fall back to another tenant when the authenticated company has no connection", async () => {
    mockConnectionWhere.mockResolvedValueOnce([]);

    const app = createTestApp(42);

    const res = await request(app)
      .get("/api/integrations/odoo/connection")
      .query({
        companyId: 999,
      });

    expect(res.status).toBe(200);

    expect(res.body).toEqual({
      connected: false,
      url: null,
      db: null,
      username: null,
      error: null,
    });

    expect(mockConnectionWhere).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated tenant for test-connection lookup", async () => {
    mockConnectionWhere.mockResolvedValueOnce([]);

    const app = createTestApp(77);

    const res = await request(app)
      .post("/api/integrations/odoo/test-connection")
      .send({
        companyId: 999,
      });

    expect(res.status).toBe(200);

    expect(res.body).toEqual({
      connected: false,
      odooVersion: null,
      error: "No Odoo connection configured for this company yet",
    });

    expect(mockConnectionWhere).toHaveBeenCalledTimes(1);

    const condition = mockConnectionWhere.mock.calls[0]?.[0];

    expect(condition).toBeDefined();
    expect(JSON.stringify(condition)).toContain("77");
    expect(JSON.stringify(condition)).not.toContain("999");
  });
});
