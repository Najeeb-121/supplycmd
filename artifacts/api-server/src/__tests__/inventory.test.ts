import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// ── DB mock (hoisted so it runs before any import) ────────────────────────────
const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockWhere2 = vi.fn(); // second .where()
  const mockWhere = vi.fn(() => ({ returning: mockWhere2 }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));

  const mockOrderBy = vi.fn(() => Promise.resolve([]));
  const mockSelectWhere = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
  const mockFrom = vi.fn(() => ({ where: mockSelectWhere, orderBy: mockOrderBy }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  const mockDeleteWhere = vi.fn(() => Promise.resolve([]));
  const mockDeleteFrom = vi.fn(() => ({ where: mockDeleteWhere }));
  const mockDelete = vi.fn(() => ({ from: mockDeleteFrom }));

  return { mockReturning, mockValues, mockInsert, mockSelect, mockSelectWhere, mockFrom, mockOrderBy, mockUpdate, mockDelete };
});

vi.mock("@workspace/db", () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
  },
  inventoryItemsTable: {},
  stockMovementsTable: {},
  ordersTable: {},
  suppliersTable: {},
  demandRecordsTable: {},
  productionRunsTable: {},
}));

import app from "../app.js";
import { isCommittedRelationshipPO } from "../routes/inventory.js";

// ── Minimal valid inventory body ──────────────────────────────────────────────
const validBody = {
  name: "Steel Bearing 10mm",
  sku: "SKU-001",
  category: "Bearings",
  unitOfMeasure: "units",
  unitCost: 2.5,
  currentStock: 100,
  reservedQuantity: 0,
  minStock: 10,
  maxStock: 500,
  annualDemand: 1200,
  leadTimeDays: 7,
  orderingCost: 50,
  holdingCostRate: 0.2,
};

const fakeItem = { id: 1, ...validBody, eoq: 245, safetyStock: 8, reorderPoint: 31 };

describe("POST /api/inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("201 – creates item with a valid body", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeItem]);

    const res = await request(app).post("/api/inventory").set("x-e2e-test-company-id", "1").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, name: "Steel Bearing 10mm" });
  });

  // ── Required field validation ─────────────────────────────────────────────
  it("400 – rejects when name is missing", async () => {
    const { name: _name, ...body } = validBody;
    const res = await request(app).post("/api/inventory").set("x-e2e-test-company-id", "1").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("name");
  });

  it("400 – rejects when sku is missing", async () => {
    const { sku: _sku, ...body } = validBody;
    const res = await request(app).post("/api/inventory").set("x-e2e-test-company-id", "1").send(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("sku");
  });

  it("400 – rejects when currentStock is negative", async () => {
    const res = await request(app)
      .post("/api/inventory").set("x-e2e-test-company-id", "1")
      .send({ ...validBody, currentStock: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("currentStock");
  });

  it("201 – preserves valid decimal stock quantities", async () => {
    mocks.mockReturning.mockResolvedValueOnce([
      { ...fakeItem, currentStock: 12.75 },
    ]);

    const res = await request(app)
      .post("/api/inventory")
      .set("x-e2e-test-company-id", "1")
      .send({ ...validBody, currentStock: 12.75 });

    expect(res.status).toBe(201);
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStock: 12.75,
      }),
    );
  });

  it("400 – rejects when holdingCostRate exceeds 1", async () => {
    const res = await request(app)
      .post("/api/inventory").set("x-e2e-test-company-id", "1")
      .send({ ...validBody, holdingCostRate: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("holdingCostRate");
  });

  it("400 – rejects when leadTimeDays is negative", async () => {
    const res = await request(app)
      .post("/api/inventory").set("x-e2e-test-company-id", "1")
      .send({ ...validBody, leadTimeDays: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("leadTimeDays");
  });

  // ── Cross-field constraint ─────────────────────────────────────────────────
  it("400 – rejects when maxStock < minStock", async () => {
    const res = await request(app)
      .post("/api/inventory").set("x-e2e-test-company-id", "1")
      .send({ ...validBody, minStock: 100, maxStock: 50 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("maxStock");
    expect(res.body.errors.maxStock).toMatch(/Max Stock must be ≥ Min Stock/);
  });

  it("200 – accepts when maxStock equals minStock (boundary)", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeItem]);

    const res = await request(app)
      .post("/api/inventory").set("x-e2e-test-company-id", "1")
      .send({ ...validBody, minStock: 50, maxStock: 50 });

    expect(res.status).toBe(201);
  });

  it("200 – accepts when maxStock is omitted (no constraint applies)", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeItem]);
    const { maxStock: _max, ...body } = validBody;

    const res = await request(app).post("/api/inventory").set("x-e2e-test-company-id", "1").send(body);

    expect(res.status).toBe(201);
  });
});

describe("GET /api/inventory/reorder-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified reservation-shortage fields without unsupported planning values", async () => {
    mocks.mockSelectWhere.mockResolvedValueOnce([
      {
        id: 42,
        name: "Finished Good",
        sku: "FG-001",
        currentStock: 100,
        availableQuantity: 0,
        reservationShortage: 25,
        incomingQuantity: 10,
      },
    ]);

    const res = await request(app).get("/api/inventory/reorder-alerts").set("x-e2e-test-company-id", "1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 42,
        name: "Finished Good",
        sku: "FG-001",
        currentStock: 100,
        availableQuantity: 0,
        reservationShortage: 25,
        incomingQuantity: 10,
        reason: "RESERVATION_SHORTAGE",
      },
    ]);
    expect(res.body[0]).not.toHaveProperty("reorderPoint");
    expect(res.body[0]).not.toHaveProperty("safetyStock");
    expect(res.body[0]).not.toHaveProperty("eoq");
    expect(res.body[0]).not.toHaveProperty("urgency");
  });

  describe("inventory relationship committed inbound rule", () => {
    it("counts only confirmed purchase orders with remaining quantity", () => {
      expect(isCommittedRelationshipPO("confirmed", 1000)).toBe(true);
      expect(isCommittedRelationshipPO("pending", 5603)).toBe(false);
      expect(isCommittedRelationshipPO("cancelled", 900)).toBe(false);
      expect(isCommittedRelationshipPO("confirmed", 0)).toBe(false);
    });
  });
});
