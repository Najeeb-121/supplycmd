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
  productName: "Widget Alpha",
  runDate: "2026-07-01",
  plannedUnits: 500,
  actualUnits: 480,
  plannedTimeMin: 240,
  actualTimeMin: 250,
  defects: 5,
  downtimeMin: 10,
};

const fakeRun = { id: 1, ...validBody };

describe("POST /api/production", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("201 – creates production run with a valid body", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRun]);

    const res = await request(app).post("/api/production").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, productName: "Widget Alpha" });
  });

  // ── Required field validation ─────────────────────────────────────────────
  it("400 – rejects when productName is missing", async () => {
    const { productName: _, ...body } = validBody;
    const res = await request(app).post("/api/production").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("productName");
  });

  it("400 – rejects when runDate is missing", async () => {
    const { runDate: _, ...body } = validBody;
    const res = await request(app).post("/api/production").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("runDate");
  });

  it("400 – rejects when plannedUnits is negative", async () => {
    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, plannedUnits: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("plannedUnits");
  });

  it("400 – rejects when actualUnits is negative", async () => {
    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, actualUnits: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("actualUnits");
  });

  it("400 – rejects when defects is negative", async () => {
    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, defects: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("defects");
  });

  it("400 – rejects when plannedTimeMin is negative", async () => {
    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, plannedTimeMin: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("plannedTimeMin");
  });

  // ── Cross-field constraint ─────────────────────────────────────────────────
  it("400 – rejects when defects exceed actualUnits", async () => {
    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, actualUnits: 10, defects: 11 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("defects");
    expect(res.body.errors.defects).toMatch(
      /Defects cannot exceed Actual Units Produced/,
    );
  });

  it("201 – accepts when defects equal actualUnits (boundary)", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRun]);

    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, actualUnits: 10, defects: 10 });

    expect(res.status).toBe(201);
  });

  it("201 – accepts when defects are zero", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRun]);

    const res = await request(app)
      .post("/api/production")
      .send({ ...validBody, defects: 0 });

    expect(res.status).toBe(201);
  });
});
