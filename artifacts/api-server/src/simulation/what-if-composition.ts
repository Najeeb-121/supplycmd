import { SupplyRiskSnapshot, RiskExposure } from "./supply-risk-contracts";
import { WhatIfResult } from "./what-if-contracts";
import { DownstreamAllocationImpact, SalesOrderPriceLookup } from "./pegging-contracts";
import { calculateDownstreamPegging } from "./pegging-engine";

export interface CompositionResult {
  baselinePegging: DownstreamAllocationImpact;
  scenarioPegging: DownstreamAllocationImpact;
  downstreamRevenueDelta: number | "UNKNOWN";
}

export function composeWhatIfWithPegging(
  snapshot: SupplyRiskSnapshot,
  exposure: RiskExposure,
  whatIfResult: WhatIfResult,
  priceLookup: SalesOrderPriceLookup[]
): CompositionResult {
  const targetProductId = exposure.targetProductId;
  if (targetProductId === undefined || targetProductId === null) {
    throw new Error("targetProductId is required in RiskExposure to compose downstream pegging.");
  }

  const baselinePegging = calculateDownstreamPegging(
    snapshot,
    targetProductId,
    whatIfResult.baselineMetrics.residualShortage,
    priceLookup
  );

  const scenarioPegging = calculateDownstreamPegging(
    snapshot,
    targetProductId,
    whatIfResult.scenarioMetrics.residualShortage,
    priceLookup
  );

  let downstreamRevenueDelta: number | "UNKNOWN" = "UNKNOWN";

  if (
    scenarioPegging.verifiedRevenueAtRisk !== "UNKNOWN" &&
    baselinePegging.verifiedRevenueAtRisk !== "UNKNOWN"
  ) {
    downstreamRevenueDelta =
      (scenarioPegging.verifiedRevenueAtRisk as number) -
      (baselinePegging.verifiedRevenueAtRisk as number);
  }

  return {
    baselinePegging,
    scenarioPegging,
    downstreamRevenueDelta
  };
}
