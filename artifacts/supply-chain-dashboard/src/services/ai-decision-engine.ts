/**
 * AI Decision Engine Types
 * Types used across the AI Decision Engine real-time evaluation.
 */

export type RecommendationType =
  | "reorder_material"
  | "delay_purchase_order"
  | "increase_production_capacity"
  | "transfer_inventory"
  | "reduce_safety_stock"
  | "flag_slow_moving"
  | "supplier_delay_detected"
  | "predict_stockout"
  | string;

export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export type RecommendationStatus =
  | "new"
  | "acknowledged"
  | "in_progress"
  | "applied"
  | "dismissed";

export type Department =
  | "Procurement"
  | "Warehouse"
  | "Production"
  | "Supply Chain"
  | "Finance"
  | "Logistics";

export interface DataPoint {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  /** One-line action headline */
  title: string;
  /** Full actionable recommendation text */
  recommendation: string;
  /** Narrative explaining the operational impact */
  businessImpact: string;
  estimatedSavings: number | "UNKNOWN";       // USD or UNKNOWN
  confidenceScore: number;        // 0-100
  /** Chain-of-thought reasoning bullet string */
  reasoning: string;
  affectedDepartment: Department;
  status: RecommendationStatus;
  generatedAt: Date;
  /** ERP entity that surfaced this signal */
  sourceEntity: string;
  /** Supporting data points shown on the card */
  dataPoints: DataPoint[];
}

export interface DeterministicAIContext {
  baselineRiskDetected: boolean;
  baselineExposures: Array<{
    riskId: string;
    productId: number;
    severity: string;
    type: string;
    exposureType?: string;
    financialImpact?: number | "UNKNOWN";
  }>;
  candidateMitigations: Array<{
    id: string;
    targetRiskId: string;
    type: string;
    description: string;
    estimatedCost: number | "UNKNOWN";
    estimatedRecoveryTime: number | "UNKNOWN";
    affectedOrders: number[];
  }>;
  portfolioResult: {
    totalProcurementCostDelta: number | "UNKNOWN";
    deduplicatedRevenueDelta: number | "UNKNOWN";
    netROI: number | "UNKNOWN";
  } | null;
  provenance: {
    mitigationGeneration: "DETERMINISTIC";
    financialSimulation: "DETERMINISTIC";
  };
}

export interface DecisionEngineState {
  recommendations: Recommendation[];
  lastAnalysedAt: Date;
  cycleCount: number;
  totalEstimatedSavings: number | "UNKNOWN";
  modelVersion: string;
  analysisStatus: "idle" | "analysing" | "complete";
  deterministicContext: DeterministicAIContext | null;
}
