import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// ── DB mock ───────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockSupplierWhere = vi.fn(() => Promise.resolve([]));
  const mockFrom = vi.fn(() => ({ where: mockSupplierWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return { mockReturning, mockValues, mockInsert, mockSelect, mockFrom, mockSupplierWhere };
});

vi.mock("@workspace/db", () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
  },
  inventoryItemsTable: {},
  stockMovementsTable: {},
  ordersTable: {},
  suppliersTable: {},
  demandRecordsTable: {},
  productionRunsTable: {},
}));

import app from "../app.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const validBody = {
  supplierId: 1,
  totalValue: 1500,
  orderDate: "2026-07-01",
  expectedDelivery: "2026-07-15",
  itemCount: 5,
};

const fakeSupplier = { id: 1, name: "Acme Corp", country: "US" };
const fakeOrder = { id: 10, ...validBody, supplierName: "Acme Corp", status: "pending" };

describe("POST /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("201 – creates order with a valid body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.mockSupplierWhere.mockResolvedValueOnce([fakeSupplier] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.mockReturning.mockResolvedValueOnce([fakeOrder] as any);

    const res = await request(app).post("/api/orders").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 10, supplierName: "Acme Corp" });
  });

  // ── Required field validation ─────────────────────────────────────────────
  it("400 – rejects when supplierId is missing", async () => {
    const { supplierId: _, ...body } = validBody;
    const res = await request(app).post("/api/orders").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("supplierId");
  });

  it("400 – rejects when itemCount is less than 1", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ ...validBody, itemCount: 0 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("itemCount");
  });

  it("400 – rejects when totalValue is negative", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ ...validBody, totalValue: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("totalValue");
  });

  it("400 – rejects when orderDate is missing", async () => {
    const { orderDate: _, ...body } = validBody;
    const res = await request(app).post("/api/orders").send(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("orderDate");
  });

  // ── Cross-field constraint ─────────────────────────────────────────────────
  it("400 – rejects when expectedDelivery is before orderDate", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ ...validBody, orderDate: "2026-07-15", expectedDelivery: "2026-07-01" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("expectedDelivery");
    expect(res.body.errors.expectedDelivery).toMatch(
      /Delivery date must be on or after the order date/,
    );
  });

  it("201 – accepts when expectedDelivery equals orderDate (same day)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.mockSupplierWhere.mockResolvedValueOnce([fakeSupplier] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.mockReturning.mockResolvedValueOnce([fakeOrder] as any);

    const res = await request(app)
      .post("/api/orders")
      .send({ ...validBody, orderDate: "2026-07-01", expectedDelivery: "2026-07-01" });

    expect(res.status).toBe(201);
  });

  // ── Business rule (supplier not found) ────────────────────────────────────
  it("400 – rejects when supplier does not exist", async () => {
    mocks.mockSupplierWhere.mockResolvedValueOnce([]); // no supplier found

    const res = await request(app).post("/api/orders").send(validBody);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("supplierId");
    expect(res.body.errors.supplierId).toMatch(/Supplier not found/);
  });
});
