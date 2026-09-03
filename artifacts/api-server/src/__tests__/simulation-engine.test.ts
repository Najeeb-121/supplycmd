import { describe, it, expect } from "vitest";
import { runDailyLoop, ERPSnapshot, ScenarioModifiers } from "../simulation/core";
import { buildScenarioModifiers, calculateFinancials, validateConsistency } from "../simulation/scenarios";
import { ScenarioDef } from "@workspace/db";

// Helper to build a standard snapshot for testing
function buildBaseSnapshot(): ERPSnapshot {
  return {
    productId: 1,
    openingStock: 100,
    dailyDemandRate: 10,
    safetyStock: 50,
    inboundPOs: [
      { id: 101, expectedDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString(), qty: 100, supplierId: 1, status: "purchase" },
      { id: 102, expectedDate: new Date(new Date().setDate(new Date().getDate() + 10)).toISOString(), qty: 200, supplierId: 2, status: "purchase" }
    ],
    scheduledMOs: [],
    salesOrders: []
  };
}

describe("Simulation Engine Core", () => {
  it("TEST 1 & 2: Supplier Delay targets specific supplier POs and isolates others", () => {
    const snap = buildBaseSnapshot();
    const scenario: ScenarioDef = {
      id: "test", type: "SUPPLIER_DELAY", title: "Test", description: "Test",
      parameters: { supplierId: 1, delayDays: 7 }
    };
    const mods = buildScenarioModifiers(scenario, snap);
    expect(mods.poDateShifts?.[101]).toBe(7);
    expect(mods.poDateShifts?.[102]).toBeUndefined();
  });

  it("TEST 3: No Buffer produces stockout", () => {
    const snap = buildBaseSnapshot();
    snap.openingStock = 10; // Only 1 day of buffer
    const mods: ScenarioModifiers = {};
    const trace = runDailyLoop(snap, 10, mods);
    const stockoutDays = trace.filter(r => r.isStockout);
    expect(stockoutDays.length).toBeGreaterThan(0);
  });

  it("TEST 4: Large Future PO does not count on Day 0", () => {
    const snap = buildBaseSnapshot();
    const trace = runDailyLoop(snap, 1, {});
    expect(trace[0].openingStock).toBe(100);
    expect(trace[0].inbound).toBe(0);
  });

  it("TEST 8: Quality Failure rejects affected inbound quantity", () => {
    const snap = buildBaseSnapshot();
    const scenario: ScenarioDef = {
      id: "test", type: "SUPPLIER_QUALITY_FAILURE", title: "Test", description: "Test",
      parameters: { supplierId: 1, failurePct: 50 }
    };
    const mods = buildScenarioModifiers(scenario, snap);
    const trace = runDailyLoop(snap, 10, mods);
    const day5 = trace.find(r => r.day === 5);
    // PO qty is 100, 50% rejection -> 50 qualityLoss, 50 usable inbound
    expect(day5?.qualityLoss).toBe(50);
    expect(day5?.inbound).toBe(50);
  });

  it("TEST 9: Price Shock separates procurement cost without changing inventory", () => {
    const snap = buildBaseSnapshot();
    const scenario: ScenarioDef = {
      id: "test", type: "SUPPLIER_PRICE_SHOCK", title: "Test", description: "Test",
      parameters: { supplierId: 1, shockPct: 20 }
    };
    const mods = buildScenarioModifiers(scenario, snap);

    // Inventory shouldn't change
    const traceWithShock = runDailyLoop(snap, 15, mods);
    const traceWithoutShock = runDailyLoop(snap, 15, {});
    expect(traceWithShock).toEqual(traceWithoutShock);

    // Procurement cost should increase
    const metrics: any = { totalUnmetDemand: 0 };
    const productInfo: any = { unitSellingPrice: { value: 100, status: "VERIFIED" }, unitCost: { value: 50, status: "VERIFIED" } };
    const fins = calculateFinancials(metrics, snap, productInfo, mods);
    // 100 units from supplier 1 * (50 * 1.2 - 50) = 100 * 10 = 1000
    expect(fins.incrementalCost?.value).toBe(1000);
  });

  it("TEST 5 & 6: Missing demand and pricing", () => {
    const snap = buildBaseSnapshot();
    snap.dailyDemandRate = 0; // Missing demand
    const violations = validateConsistency({} as any, { revenueAtRisk: { status: "MISSING", value: null }, grossMarginAtRisk: { status: "MISSING", value: null } } as any, [], snap);
    expect(violations).toContain("INSUFFICIENT_DEMAND_DATA");

    const metrics: any = { totalUnmetDemand: 100 };
    const productInfo: any = { unitSellingPrice: { value: null, status: "MISSING" }, unitCost: { value: null, status: "MISSING" } };
    const fins = calculateFinancials(metrics, snap, productInfo, {});
    expect(fins.revenueAtRisk.value).toBeNull();
    expect(fins.revenueAtRisk.status).toBe("MISSING");
  });

  it("PRODUCTION_LINE_FAILURE blocks one MO once when it uses multiple workcenters", () => {
    const snap = buildBaseSnapshot();

    snap.dailyDemandRate = 0;
    snap.scheduledMOs = [
      {
        id: 201,
        scheduledDate: "2026-09-03",
        dateDeadline: "2026-09-03",
        qty: 500,
        lineIds: [7, 8],
        status: "confirmed",
        moState: "confirmed",
      },
    ];

    const baseline = runDailyLoop(snap, 1, {});
    expect(baseline[0].moOutput).toBe(500);

    const scenario: ScenarioDef = {
      id: "test",
      type: "PRODUCTION_LINE_FAILURE",
      title: "Test",
      description: "Test",
      parameters: {
        lineId: 8,
        downtimeDays: 1,
      },
    };

    const mods = buildScenarioModifiers(scenario, snap);
    const failedLine = runDailyLoop(snap, 1, mods);

    expect(failedLine[0].moOutput).toBe(0);
  });

});
