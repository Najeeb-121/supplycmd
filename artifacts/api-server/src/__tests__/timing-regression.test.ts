import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDailyLoop, ERPSnapshot, DependentDemand } from "../simulation/core";
import { propagateDemand, buildBOMGraph, InventoryStatus, BOMNode } from "../simulation/bom-propagation";

describe("Phase 2: Deterministic Production Timing Layer", () => {
  it("Test A & B & C: Missing timing generates requiredDate = null and status = INSUFFICIENT_PRODUCTION_TIMING_DATA", () => {
    // Setup generic lead time which is NOT verified manufacturing time
    const inventory: InventoryStatus = {
      16: { onHand: 0, leadTimeDays: 2 },
      15: { onHand: 0, leadTimeDays: 1 },
      1270: { onHand: 0, leadTimeDays: 5 }
    };

    const boms: any[] = [
      { id: 1, odooBomId: 101, parentSkuId: 16, parentBomQty: 1, isActive: true },
      { id: 2, odooBomId: 102, parentSkuId: 15, parentBomQty: 1, isActive: true }
    ];

    const bomLines: any[] = [
      { id: 1, odooLineId: 201, bomId: 1, childSkuId: 15, componentQty: 1, isDeleted: false },
      { id: 2, odooLineId: 202, bomId: 2, childSkuId: 1270, componentQty: 0.01, isDeleted: false }
    ];

    const graph = buildBOMGraph(boms, bomLines);

    const salesOrders = [
      {
        salesOrderId: 10,
        salesOrderLineId: 20,
        productId: 16,
        demandDate: "2026-08-11",
        remainingQty: 100
      }
    ];

    const { dependentDemands } = propagateDemand(salesOrders, graph, inventory);

    const p15Demand = dependentDemands.find(d => d.componentProductOdooId === 15);
    const p1270Demand = dependentDemands.find(d => d.componentProductOdooId === 1270);

    expect(p15Demand).toBeDefined();
    expect(p1270Demand).toBeDefined();

    // Since leadTimeDays is generic, it should be treated as INSUFFICIENT
    expect(p15Demand?.status).toBe("INSUFFICIENT_PRODUCTION_TIMING_DATA");
    expect(p15Demand?.requiredDate).toBeNull();
    expect(p15Demand?.productionTiming?.source).toBe("MISSING");

    expect(p1270Demand?.status).toBe("INSUFFICIENT_PRODUCTION_TIMING_DATA");
    expect(p1270Demand?.requiredDate).toBeNull();
    expect(p1270Demand?.productionTiming?.source).toBe("MISSING");

    // Provenance (Test F)
    expect(p1270Demand?.sourceFinishedProductOdooId).toBe(16);
    expect(p1270Demand?.sourceDemandDate).toBe("2026-08-11");
    expect(p1270Demand?.sourceSalesOrderOdooId).toBe(10);
    expect(p1270Demand?.bomOdooId).toBe(102);
  });
  it("Test C2: run date alone does not verify MO timing", () => {
    const graph = buildBOMGraph(
      [
        {
          id: 1,
          odooBomId: 8,
          parentSkuId: 15,
          parentBomQty: 1,
          isActive: true,
        },
      ],
      [
        {
          id: 1,
          odooLineId: 8,
          bomId: 1,
          childSkuId: 1270,
          componentQty: 0.01,
          isDeleted: false,
        },
      ],
    );

    const { dependentDemands } = propagateDemand(
      [
        {
          salesOrderId: 1,
          salesOrderLineId: 1,
          productId: 15,
          demandDate: "2026-08-11",
          remainingQty: 100,
        },
      ],
      graph,
      {},
      [
        {
          id: 41,
          odooId: 41,
          bomId: 8,
          productName:
            "[PSC-SF-001] Printed Can Body Blank 355ml",
          runDate: "2026-08-08",
          plannedTimeMin: null,
        },
      ],
    );

    expect(dependentDemands[0].status).toBe(
      "INSUFFICIENT_PRODUCTION_TIMING_DATA",
    );
    expect(dependentDemands[0].requiredDate).toBeNull();
    expect(dependentDemands[0].productionTiming?.source).toBe(
      "MISSING",
    );
  });

  it("Test C3: verified Odoo work-order timing supplies the required date", () => {
    const graph = buildBOMGraph(
      [
        {
          id: 1,
          odooBomId: 8,
          parentSkuId: 15,
          parentBomQty: 1,
          isActive: true,
        },
      ],
      [
        {
          id: 1,
          odooLineId: 8,
          bomId: 1,
          childSkuId: 1270,
          componentQty: 0.01,
          isDeleted: false,
        },
      ],
    );

    const { dependentDemands } = propagateDemand(
      [
        {
          salesOrderId: 1,
          salesOrderLineId: 1,
          productId: 15,
          demandDate: "2026-08-11",
          remainingQty: 100,
        },
      ],
      graph,
      {},
      [
        {
          id: 41,
          odooId: 41,
          bomId: 8,
          productName:
            "[PSC-SF-001] Printed Can Body Blank 355ml",
          runDate: "2026-08-08",
          plannedTimeMin: 75,
          actualTimeMin: null,
        },
      ],
    );

    expect(dependentDemands[0].status).toBe(
      "VERIFIED_MO_TIMING",
    );
    expect(dependentDemands[0].requiredDate).toBe(
      "2026-08-08",
    );
    expect(dependentDemands[0].productionTiming?.source).toBe(
      "ODOO_WORKORDER",
    );
  });
  it("Test D: Unknown timing does NOT create a false chronological shortage", () => {
    const dependentDemands: DependentDemand[] = [
      {
        componentProductLocalId: 1270,
        componentProductOdooId: 1270,
        requiredQuantity: 2950,
        requiredDate: null,
        sourceFinishedProductOdooId: 16,
        sourceDemandDate: "2026-08-11",
        sourceDemandQuantity: 595000,
        bomOdooId: 101,
        bomLevel: 2,
        status: "INSUFFICIENT_PRODUCTION_TIMING_DATA",
        productionTiming: {
          source: "GENERIC_LEAD_TIME",
          durationDays: 7,
          status: "INSUFFICIENT_PRODUCTION_TIMING_DATA"
        }
      }
    ];

    const snapshot: ERPSnapshot = {
      productId: 1270,
      openingStock: 0,
      dailyDemandRate: 0,
      safetyStock: 0,
      inboundPOs: [],
      scheduledMOs: [],
      salesOrders: [],
      dependentDemands
    };

    // runDailyLoop will loop through 60 days starting today
    // Let's pass empty modifiers
    const records = runDailyLoop(snapshot, 60, {});

    // Total consumption should be 0, because the demand is ignored due to INSUFFICIENT timing
    const totalConsumption = records.reduce((sum, r) => sum + r.consumption, 0);
    expect(totalConsumption).toBe(0);

    // No stockout should be generated
    const anyStockout = records.some(r => r.isStockout);
    expect(anyStockout).toBe(false);
  });
  it("Test D2: dependent demand is consumed only by the matching snapshot product", () => {
    const dependentDemands: DependentDemand[] = [
      {
        componentProductLocalId: 1273,
        componentProductOdooId: 1273,
        requiredQuantity: 385000,
        requiredDate: "2026-08-11",
        sourceFinishedProductOdooId: 1264,
        sourceDemandDate: "2026-08-11",
        sourceDemandQuantity: 595000,
        bomOdooId: 6,
        bomLevel: 1,
        status: "VALID"
      },
      {
        componentProductLocalId: 1270,
        componentProductOdooId: 1270,
        requiredQuantity: 2950,
        requiredDate: "2026-08-11",
        sourceFinishedProductOdooId: 1264,
        sourceDemandDate: "2026-08-11",
        sourceDemandQuantity: 595000,
        bomOdooId: 8,
        bomLevel: 2,
        status: "VALID"
      }
    ];

    const snapshot: ERPSnapshot = {
      productId: 1270,
      openingStock: 10000,
      dailyDemandRate: 0,
      safetyStock: 0,
      inboundPOs: [],
      scheduledMOs: [],
      salesOrders: [],
      dependentDemands
    };

    const records = runDailyLoop(
      snapshot,
      3,
      {},
      new Date("2026-08-10T00:00:00Z")
    );

    const totalConsumption = records.reduce(
      (sum, r) => sum + r.consumption,
      0
    );

    expect(totalConsumption).toBe(2950);
  });
  it("Test E: Baseline/scenario consistency", () => {
    const dependentDemands: DependentDemand[] = [
      {
        componentProductLocalId: 1270,
        componentProductOdooId: 1270,
        requiredQuantity: 2950,
        requiredDate: null,
        sourceFinishedProductOdooId: 16,
        sourceDemandDate: "2026-08-11",
        sourceDemandQuantity: 595000,
        bomOdooId: 101,
        bomLevel: 2,
        status: "INSUFFICIENT_PRODUCTION_TIMING_DATA"
      }
    ];

    const snapshot: ERPSnapshot = {
      productId: 1270,
      openingStock: 0,
      dailyDemandRate: 0,
      safetyStock: 0,
      inboundPOs: [{ id: 1, expectedDate: "2026-08-15", qty: 3000, supplierId: 5, status: "purchase" }],
      scheduledMOs: [],
      salesOrders: [],
      dependentDemands
    };

    const startDate = new Date('2026-08-09');
    const baselineRecords = runDailyLoop(snapshot, 60, {}, startDate);
    const scenarioRecords = runDailyLoop(snapshot, 60, { poDateShifts: { 1: 7 } }, startDate);

    // Both passes receive the same immutable dependent demands. The simulation ignores the demand in both.
    expect(baselineRecords.reduce((s, r) => s + r.consumption, 0)).toBe(0);
    expect(scenarioRecords.reduce((s, r) => s + r.consumption, 0)).toBe(0);

    // Inbound PO shifts (though unused by demand) still happen
    expect(baselineRecords.find(r => r.date === "2026-08-15")?.inbound).toBe(3000);
    expect(scenarioRecords.find(r => r.date === "2026-08-22")?.inbound).toBe(3000);
  });
});
