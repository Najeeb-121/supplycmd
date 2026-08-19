import { RiskMitigation } from "./supply-risk-contracts";

export interface PortfolioSimulationRequest {
  baselineSnapshotId: string;
  mitigations: RiskMitigation[];
}

export interface PortfolioActionTrace {
  mitigationId: string;
  type: string;
  executedQuantity: number;
  executedCost: number | "UNKNOWN";
  wasSkipped: boolean;
}

export interface AffectedSalesOrderPortfolio {
  salesOrderId: number;
  missedQuantity: number;
  provenance: "SIMULATION_ALLOCATED";
}

export interface PortfolioCompositionResult {
  totalProcurementCostDelta: number | "UNKNOWN";
  deduplicatedRevenueDelta: number | "UNKNOWN";
  netROI: number | "UNKNOWN";
  
  actionExecutionTraces: PortfolioActionTrace[];
  affectedSalesOrders: AffectedSalesOrderPortfolio[];
  
  provenance: {
    revenue: "CALCULATED" | "UNKNOWN";
    cost: "CALCULATED" | "UNKNOWN";
    roi: "CALCULATED" | "UNKNOWN";
  };
}
