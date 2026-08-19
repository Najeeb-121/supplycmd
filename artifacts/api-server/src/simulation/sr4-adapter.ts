import { CompositionResult } from "./what-if-composition";
import { WhatIfResult } from "./what-if-contracts";

export interface SR4ExecutiveSummary {
  baselineShortage: number;
  scenarioShortage: number;
  shortageDelta: number;
  
  baselineProcurementCost: number;
  scenarioProcurementCost: number;
  procurementCostDelta: number;

  baselineRevenueAtRisk: string; // "$1000" or "UNKNOWN"
  scenarioRevenueAtRisk: string;
  revenueDelta: string; 

  supplierCapacityStatus: string;
  expediteCostStatus: string;

  scenarioAssumptions: string[];

  affectedSalesOrders: {
    salesOrderId: number;
    missedQuantity: number;
    provenance: "SIMULATION_ALLOCATED";
  }[];

  provenance: {
    revenue: "CALCULATED" | "PARTIAL_MISSING_PRICE";
    shortage: "CALCULATED";
    allocation: "SIMULATION_ALLOCATED";
    assumptions: "SCENARIO_ASSUMPTION";
  };
}

export function createSR4Adapter(
  whatIf: WhatIfResult,
  composition: CompositionResult
): SR4ExecutiveSummary {
  const formatRevenue = (rev: number | "UNKNOWN") => {
    if (rev === "UNKNOWN") return "UNKNOWN";
    return `$${rev}`;
  };

  return {
    baselineShortage: whatIf.baselineMetrics.residualShortage,
    scenarioShortage: whatIf.scenarioMetrics.residualShortage,
    shortageDelta: whatIf.incrementalMetrics.shortageDelta,

    baselineProcurementCost: whatIf.baselineMetrics.procurementCost,
    scenarioProcurementCost: whatIf.scenarioMetrics.procurementCost,
    procurementCostDelta: whatIf.incrementalMetrics.procurementCostDelta,

    baselineRevenueAtRisk: formatRevenue(composition.baselinePegging.verifiedRevenueAtRisk),
    scenarioRevenueAtRisk: formatRevenue(composition.scenarioPegging.verifiedRevenueAtRisk),
    revenueDelta: formatRevenue(composition.downstreamRevenueDelta),

    supplierCapacityStatus: whatIf.provenance.supplierCapacity === "UNKNOWN" ? "UNKNOWN" : whatIf.provenance.supplierCapacity,
    expediteCostStatus: whatIf.provenance.expediteCost === "UNKNOWN" ? "UNKNOWN" : whatIf.provenance.expediteCost,

    scenarioAssumptions: whatIf.scenarioAssumptions,

    affectedSalesOrders: composition.scenarioPegging.affectedSalesOrders.map(so => ({
      salesOrderId: so.salesOrderId,
      missedQuantity: so.missedQuantity,
      provenance: "SIMULATION_ALLOCATED" as const
    })),

    provenance: {
      revenue: composition.scenarioPegging.verifiedRevenueAtRisk === "UNKNOWN" || composition.baselinePegging.verifiedRevenueAtRisk === "UNKNOWN" ? "PARTIAL_MISSING_PRICE" : "CALCULATED",
      shortage: "CALCULATED",
      allocation: "SIMULATION_ALLOCATED",
      assumptions: "SCENARIO_ASSUMPTION"
    }
  };
}
