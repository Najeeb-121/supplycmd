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
  estimatedSavings: number | "UNKNOWN";       // Monetary value or UNKNOWN
  confidenceScore: number | "UNKNOWN";        // 0-100
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
    scenarioType: string;
    targetSupplierId?: number;
    targetProductId?: number;
    affectedQuantity: number;
    inventoryCoverage: number;
    residualShortage: number;
    canAbsorbWithBuffer: boolean;
    alternateSupplierAvailable: boolean;
    downstreamImpacts: {
      dependentProducts: number[];
      delayedMOs: number[];
      affectedSalesOrders: number[];
    };
    exposureReason: string;
    inventoryCoveragePercent: number;
    singleSupplierDependency: boolean;
    leadTimeVerified: boolean;
    capacityRisk: string;
    currentlyInboundQuantity: number;
    totalSupplierCount: number;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  }>;

  contingencyExposures: Array<{
    scenarioType: string;
    targetSupplierId?: number;
    targetProductId?: number;
    affectedQuantity: number;
    inventoryCoverage: number;
    residualShortage: number;
    canAbsorbWithBuffer: boolean;
    alternateSupplierAvailable: boolean;
    downstreamImpacts: {
      dependentProducts: number[];
      delayedMOs: number[];
      affectedSalesOrders: number[];
    };
    exposureReason: string;
    inventoryCoveragePercent: number;
    singleSupplierDependency: boolean;
    leadTimeVerified: boolean;
    capacityRisk: string;
    currentlyInboundQuantity: number;
    totalSupplierCount: number;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  }>;

  contingencyMitigations: Array<{
    id: string;
    type:
    | "ALTERNATE_SUPPLIER"
    | "FOLLOW_UP_INBOUND"
    | "COVER_FROM_AVAILABLE_STOCK"
    | "PRIORITIZE_DOWNSTREAM_DEMAND"
    | "MONITOR_UNVERIFIED_LEAD_TIME"
    | "CAPACITY_DATA_REQUIRED";
    title: string;
    reason: string;
    feasible: boolean;
    affectedQuantity: number;
    availableQuantity?: number;
    mitigationCost?: number;
    mitigationCostProvenance: "CALCULATED" | "UNKNOWN";
    mitigationDate?: string;
    mitigationDateProvenance: "CALCULATED" | "EXPECTED_ARRIVAL" | "UNKNOWN";
    targetSupplierId?: number;
    targetSupplierName?: string;
    targetProductId?: number;
  }>;

  candidateMitigations: Array<{
    id: string;
    type:
    | "ALTERNATE_SUPPLIER"
    | "FOLLOW_UP_INBOUND"
    | "COVER_FROM_AVAILABLE_STOCK"
    | "PRIORITIZE_DOWNSTREAM_DEMAND"
    | "MONITOR_UNVERIFIED_LEAD_TIME"
    | "CAPACITY_DATA_REQUIRED";
    title: string;
    reason: string;
    feasible: boolean;
    affectedQuantity: number;
    availableQuantity?: number;
    mitigationCost?: number;
    mitigationCostProvenance: "CALCULATED" | "UNKNOWN";
    mitigationDate?: string;
    mitigationDateProvenance: "CALCULATED" | "EXPECTED_ARRIVAL" | "UNKNOWN";
    targetSupplierId?: number;
    targetSupplierName?: string;
    targetProductId?: number;
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
  totalEstimatedSavings: number | "UNKNOWN";
  modelVersion: string;
  analysisStatus: "idle" | "analysing" | "complete";
  deterministicContext: DeterministicAIContext | null;
}
