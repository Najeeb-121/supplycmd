import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// ── DB mock ───────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  return { mockReturning, mockValues, mockInsert };
});

vi.mock("@workspace/db", () => ({
  db: {
    insert: mocks.mockInsert,
    select: vi.fn(() => ({ from: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })) })),
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
  productName: "Steel Bearing 10mm",
  period: "2026-07",
  actualDemand: 1200,
  forecastedDemand: 1100,
};

const fakeRecord = { id: 1, ...validBody };

describe("POST /api/demand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("201 – creates demand record with a valid body", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRecord]);

    const res = await request(app).post("/api/demand").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, productName: "Steel Bearing 10mm" });
  });

  // ── Required field validation ─────────────────────────────────────────────
  it("400 – rejects when productName is missing", async () => {
    const { productName: _, ...body } = validBody;
    const res = await request(app).post("/api/demand").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("productName");
  });

  it("400 – rejects when period is missing", async () => {
    const { period: _, ...body } = validBody;
    const res = await request(app).post("/api/demand").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("period");
  });

  it("400 – rejects when period does not match YYYY-MM format", async () => {
    const res = await request(app)
      .post("/api/demand")
      .send({ ...validBody, period: "07-2026" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("period");
    expect(res.body.errors.period).toMatch(/YYYY-MM/);
  });

  it("400 – rejects when period has partial format (YYYY-M)", async () => {
    const res = await request(app)
      .post("/api/demand")
      .send({ ...validBody, period: "2026-7" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("period");
  });

  it("400 – rejects when actualDemand is negative", async () => {
    const res = await request(app)
      .post("/api/demand")
      .send({ ...validBody, actualDemand: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("actualDemand");
  });

  it("400 – rejects when forecastedDemand is negative", async () => {
    const res = await request(app)
      .post("/api/demand")
      .send({ ...validBody, forecastedDemand: -5 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("forecastedDemand");
  });

  it("201 – accepts when actualDemand is zero (boundary)", async () => {
    mocks.mockReturning.mockResolvedValueOnce([{ ...fakeRecord, actualDemand: 0 }]);

    const res = await request(app)
      .post("/api/demand")
      .send({ ...validBody, actualDemand: 0 });

    expect(res.status).toBe(201);
  });
});
