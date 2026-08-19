import { ERPSnapshot, runDailyLoop, extractLoopMetrics, ScenarioModifiers } from "./core";
import { SimulationResult, ScenarioDef, DataValue, SimulationStatus, ConfidenceLevel, MitigationOption } from "@workspace/db";

// Helper to calculate confidence based on sample size
export function determineConfidence(sampleSize: number | undefined, isVerified: boolean): ConfidenceLevel {
  if (!isVerified && !sampleSize) return "LOW";
  if (isVerified) return "HIGH";
  if (sampleSize !== undefined) {
    if (sampleSize >= 30) return "HIGH";
    if (sampleSize >= 10) return "MEDIUM";
    return "LOW";
  }
  return "LOW";
}

export function buildScenarioModifiers(scenario: ScenarioDef, snapshot: ERPSnapshot): ScenarioModifiers {
  const mods: ScenarioModifiers = {};
  const params = scenario.parameters;

  switch (scenario.type) {
    // Group A
    case "SUPPLIER_DELAY":
      if (params.supplierId && params.delayDays) {
        mods.poDateShifts = {};
        for (const po of snapshot.inboundPOs) {
          if (po.supplierId === params.supplierId && po.status !== "done" && po.status !== "cancel") {
            mods.poDateShifts[po.id] = params.delayDays;
          }
        }
      }
      break;
    case "SUPPLIER_QUALITY_FAILURE":
      if (params.supplierId && params.failurePct) {
        mods.qualityRejectionRate = params.failurePct / 100;
        mods.qualitySupplierId = params.supplierId;
      }
      break;
    case "SINGLE_SOURCE_FAILURE":
      if (params.supplierId) {
        mods.poRemoveSupplier = params.supplierId;
      }
      break;
    case "SUPPLIER_PRICE_SHOCK":
      if (params.supplierId && params.shockPct) {
        // Track for financials, but doesn't change physical inventory
        mods.priceShockMultiplier = 1 + (params.shockPct / 100);
        mods.priceShockSupplierId = params.supplierId;
      }
      break;
    
    // Group B
    case "DEMAND_SURGE":
      if (params.surgePct) {
        mods.demandMultiplier = 1 + (params.surgePct / 100);
        if (params.customerId) {
          mods.demandMultiplierCustomer = params.customerId;
        }
      }
      break;
    case "DEMAND_COLLAPSE":
      if (params.collapsePct) {
        mods.demandMultiplier = 1 - (params.collapsePct / 100);
      }
      break;
    case "SEASONALITY_SHOCK":
      if (params.peakMultiplier && params.troughMultiplier) {
        // Simplified seasonality
        mods.seasonality = { 8: params.peakMultiplier, 9: params.troughMultiplier };
      }
      break;

    // Group C
    case "PRODUCTION_LINE_FAILURE":
      if (params.downtimeDays) {
        mods.moLineDowntime = { lineId: params.lineId || 1, startDay: 0, endDay: params.downtimeDays };
      }
      break;
  }

  return mods;
}

export function calculateFinancials(
  incrementalUnmetDemand: number,
  snapshot: ERPSnapshot,
  productInfo: SimulationResult["graph"]["product"],
  modifiers?: ScenarioModifiers
): SimulationResult["financials"] {
  const unitSellingPrice = productInfo.unitSellingPrice.value;
  const unitCost = productInfo.unitCost.value;

  const revStatus = productInfo.unitSellingPrice.status === "VERIFIED" ? "VERIFIED" : "MISSING";
  const costStatus = productInfo.unitCost.status === "VERIFIED" ? "VERIFIED" : "MISSING";

  const revVal = (unitSellingPrice !== null && unitSellingPrice !== undefined && revStatus === "VERIFIED") ? incrementalUnmetDemand * unitSellingPrice : null;
  const marginVal = (unitSellingPrice !== null && unitSellingPrice !== undefined && unitCost !== null && unitCost !== undefined && revStatus === "VERIFIED" && costStatus === "VERIFIED") 
    ? (incrementalUnmetDemand * (unitSellingPrice - unitCost)) 
    : null;

  let incrementalProcCost = 0;
  if (modifiers?.priceShockMultiplier && modifiers?.priceShockSupplierId && unitCost !== null) {
    const affectedQty = snapshot.inboundPOs
      .filter(po => po.supplierId === modifiers.priceShockSupplierId)
      .reduce((sum, po) => sum + po.qty, 0);
    incrementalProcCost = affectedQty * (unitCost * modifiers.priceShockMultiplier - unitCost);
  }

  return {
    revenueAtRisk: {
      value: revVal,
      status: revStatus,
      source: "Simulation",
      confidence: "HIGH"
    },
    grossMarginAtRisk: {
      value: marginVal,
      status: (revStatus === "VERIFIED" && costStatus === "VERIFIED") ? "VERIFIED" : "MISSING",
      source: "Simulation",
      confidence: "HIGH"
    },
    incrementalCost: {
      value: incrementalProcCost,
      status: incrementalProcCost > 0 ? "VERIFIED" : "DERIVED",
      source: "Simulation",
      confidence: "HIGH"
    },
    inventoryCarryingCost: {
      value: null,
      status: "MISSING",
      source: "Simulation",
      confidence: "LOW"
    }
  };
}

// Ensure consistency before allowing AI narration
export function validateConsistency(
  scenarioMetrics: ReturnType<typeof extractLoopMetrics>,
  financials: SimulationResult["financials"],
  mitigations: MitigationOption[],
  snapshot: ERPSnapshot
): string[] {
  const violations: string[] = [];

  if (snapshot.dailyDemandRate === 0) {
    violations.push("INSUFFICIENT_DEMAND_DATA");
  }

  // CHECK 1: No stockout but firstStockoutDay != null
  if (scenarioMetrics.firstStockoutDay !== null && scenarioMetrics.totalUnmetDemand === 0) {
    violations.push("First stockout day is set but unmet demand is 0");
  }

  // CHECK 3: revenueAtRisk = 0 AND unmetDemand > 0 (only if verified)
  if (financials.revenueAtRisk.status === "VERIFIED" && financials.revenueAtRisk.value === 0 && scenarioMetrics.totalUnmetDemand > 0) {
    violations.push("Revenue at risk is $0 despite > 0 unmet demand and VERIFIED price");
  }

  return violations;
}
