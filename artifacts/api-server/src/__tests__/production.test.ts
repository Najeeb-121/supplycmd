import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// ── DB mock ───────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  return {
    mockReturning,
    mockValues,
    mockInsert,
    mockWhere,
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    insert: mocks.mockInsert,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve([])),
        where: mocks.mockWhere,
      })),
    })),
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
function postProduction(body: object) {
  return request(app)
    .post("/api/production")
    .set("x-e2e-test-company-id", "1")
    .send(body);
}
function getOeeMetrics() {
  return request(app)
    .get("/api/production/metrics/oee")
    .set("x-e2e-test-company-id", "1");
}
describe("POST /api/production", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("201 – creates production run with a valid body", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRun]);

    const res = await postProduction(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, productName: "Widget Alpha" });
  });

  // ── Required field validation ─────────────────────────────────────────────
  it("400 – rejects when productName is missing", async () => {
    const { productName: _, ...body } = validBody;
    const res = await postProduction(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("productName");
  });

  it("400 – rejects when runDate is missing", async () => {
    const { runDate: _, ...body } = validBody;
    const res = await postProduction(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("runDate");
  });

  it("400 – rejects when plannedUnits is negative", async () => {
    const res = await postProduction({ ...validBody, plannedUnits: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("plannedUnits");
  });

  it("400 – rejects when actualUnits is negative", async () => {
    // actualUnits negative
    const res = await postProduction({ ...validBody, actualUnits: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("actualUnits");
  });

  it("400 – rejects when defects is negative", async () => {
    // defects negative
    const res = await postProduction({ ...validBody, defects: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("defects");
  });

  it("400 – rejects when plannedTimeMin is negative", async () => {
    // plannedTimeMin negative
    const res = await postProduction({ ...validBody, plannedTimeMin: -1 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("plannedTimeMin");
  });

  // ── Cross-field constraint ─────────────────────────────────────────────────
  it("400 – rejects when defects exceed actualUnits", async () => {
    // defects exceed actualUnits
    const res = await postProduction({ ...validBody, actualUnits: 10, defects: 11 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
    expect(res.body.errors).toHaveProperty("defects");
    expect(res.body.errors.defects).toMatch(
      /Defects cannot exceed Actual Units Produced/,
    );
  });

  it("201 – accepts when defects equal actualUnits (boundary)", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRun]);

    // defects equal actualUnits
    const res = await postProduction({ ...validBody, actualUnits: 10, defects: 10 });

    expect(res.status).toBe(201);
  });

  it("201 – accepts when defects are zero", async () => {
    mocks.mockReturning.mockResolvedValueOnce([fakeRun]);

    // defects are zero
    const res = await postProduction({ ...validBody, defects: 0 });

    expect(res.status).toBe(201);
  });
});
describe("GET /api/production/metrics/oee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null metrics when no production runs exist", async () => {
    mocks.mockWhere.mockResolvedValueOnce([]);

    const res = await getOeeMetrics();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      oeePercent: null,
      availabilityPercent: null,
      performancePercent: null,
      qualityPercent: null,
      avgTaktTimeSec: null,
      avgCycleTimeSec: null,
      throughputPerHour: null,
      totalRuns: 0,
    });
  });

  it("does not fabricate OEE from missing timing and quality data", async () => {
    mocks.mockWhere.mockResolvedValueOnce([
      {
        ...fakeRun,
        plannedTimeMin: null,
        actualTimeMin: null,
        defects: null,
        downtimeMin: null,
      },
    ]);

    const res = await getOeeMetrics();

    expect(res.status).toBe(200);
    expect(res.body.oeePercent).toBeNull();
    expect(res.body.availabilityPercent).toBeNull();
    expect(res.body.performancePercent).toBe(96);
    expect(res.body.qualityPercent).toBeNull();
    expect(res.body.avgTaktTimeSec).toBeNull();
    expect(res.body.avgCycleTimeSec).toBeNull();
    expect(res.body.throughputPerHour).toBeNull();
    expect(res.body.totalRuns).toBe(1);
  });

  it("calculates metrics when all required values are known", async () => {
    mocks.mockWhere.mockResolvedValueOnce([fakeRun]);

    const res = await getOeeMetrics();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      oeePercent: 95,
      availabilityPercent: 100,
      performancePercent: 96,
      qualityPercent: 99,
      avgTaktTimeSec: 28.8,
      avgCycleTimeSec: 31.3,
      throughputPerHour: 115.2,
      totalRuns: 1,
    });
  });
});
