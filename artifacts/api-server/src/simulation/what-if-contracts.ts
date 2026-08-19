import { RiskMitigation } from "./supply-risk-contracts";

export interface WhatIfResult {
  actionApplied: RiskMitigation;

  scenarioValidity:
    | "VALID"
    | "INVALID_UNSUPPORTED_ACTION"
    | "INVALID_INSUFFICIENT_DATA";

  baselineMetrics: {
    residualShortage: number;
    inventoryCoverageDays: number;
    procurementCost: number;
    revenueAtRisk: "UNKNOWN";
  };

  scenarioMetrics: {
    residualShortage: number;
    inventoryCoverageDays: number;
    procurementCost: number;
    revenueAtRisk: "UNKNOWN";
  };

  incrementalMetrics: {
    shortageDelta: number;
    procurementCostDelta: number;
    revenueAtRiskDelta: "UNKNOWN";
  };

  scenarioAssumptions: string[];

  provenance: {
    costSource: "CALCULATED" | "UNKNOWN";
    dateSource:
      | "EXPECTED_ARRIVAL"
      | "SCENARIO_ASSUMPTION"
      | "UNKNOWN";
    expediteCost: "UNKNOWN";
    supplierCapacity: "UNKNOWN";
  };
}
