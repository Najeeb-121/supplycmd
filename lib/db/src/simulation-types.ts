export type DataStatus = "VERIFIED" | "DERIVED" | "ESTIMATED" | "INSUFFICIENT" | "MISSING" | "INVALID";
export type SimulationStatus = "VALID" | "PARTIAL" | "INVALID" | "BLOCKED" | "INSUFFICIENT_DATA" | "NOT_EXECUTED";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface DataValue<T> {
  value: T | null;
  status: DataStatus;
  source: string;
  sampleSize?: number;
  confidence: ConfidenceLevel;
}

export interface DayRecord {
  day: number;
  date: string;
  openingStock: number;
  inbound: number;
  moOutput: number;
  consumption: number;
  qualityLoss: number;
  closingStock: number;
  shortageUnits: number;
  isStockout: boolean;
  sourceType: "ERP_VERIFIED" | "DERIVED" | "SIMULATION_ASSUMPTION";
  notes?: string;
}

export interface SimulationParameters {
  supplierId?: number;
  productId?: number;
  customerId?: number;
  delayDays?: number;
  failurePct?: number;
  discoveryDay?: number;
  shockPct?: number;
  additionalDays?: number;
  surgePct?: number;
  collapsePct?: number;
  downtimeDays?: number;
  lineId?: number;
  warehouseId?: number;
  disruptionDays?: number;
  country?: string;
  escalationPct?: number;
  peakMultiplier?: number;
  troughMultiplier?: number;
}

export interface ScenarioDef {
  id: string;
  type: string;
  title: string;
  description: string;
  parameters: SimulationParameters;
}

export interface MitigationOption {
  id: string;
  title: string;
  eligibility: "ELIGIBLE" | "PARTIALLY_ELIGIBLE" | "NOT_ELIGIBLE";
  recoveryDay?: number | null;
  addedCost?: DataValue<number>;
  unitsCovered?: number;
  leadTimeDays?: number;
  otifImpact?: { before: number; after: number };
  aiScore?: {
    total: number;
    service: number;
    finance: number;
    speed: number;
    feasibility: number;
  };
  explanation?: {
    action: string;
    reason: string;
    tradeoff: string;
    dataSource: string;
  };
}

export interface SimulationResult {
  scenarioType: string;
  simulationStatus: SimulationStatus;
  dataConfidence: ConfidenceLevel;
  violations?: string[];
  errorCode?: string;
  errorMessage?: string;
  
  relationship?: {
    supplierId: number;
    supplierName: string;
    productId: number;
    productName: string;
    relationshipExists: boolean;
    matchingPOCount: number;
    matchingPOQuantity: number;
    matchingPOs: any[];
  };
  
  graph: {
    product: {
      id: number;
      name: DataValue<string>;
      unitSellingPrice: DataValue<number>;
      unitCost: DataValue<number>;
      safetyStockQty: DataValue<number>;
      reorderPoint: DataValue<number>;
    };
    supplier?: {
      id: number;
      name: DataValue<string>;
      leadTimeDays: DataValue<number>;
      unitPrice: DataValue<number>;
    };
    alternateSuppliers: {
      id: number;
      name: string;
      leadTimeDays: number;
      unitPrice: number;
      openPOQty: number;
      openPOExpectedDate: string;
    }[];
    customers: {
      id: number;
      name: string;
      affectedSoQty: number;
    }[];
  };

  auditTrace: DayRecord[];
  dependentDemands?: any[];
  productionSchedule?: {
    hasBomDependencies?: boolean;
    scenarioType?: string;
    targetProductId?: number;
    p1270: { grossRequirement: number; onHand: number; netShortage: number; shortageAvailabilityDate: string; provenance: string };
    p15: { plannedStart: string; plannedCompletion: string; actualStart: string; actualCompletion: string; delayDays: number; provenance: string };
    p16: { plannedStart: string; plannedCompletion: string; actualStart: string; actualCompletion: string; delayDays: number; provenance: string };
    salesOrder: { dueDate: string; simulatedCompletion: string; deliveryDelayDays: number; provenance: string };
  };
  
  supplyRisk?: any;
  
  baselineMetrics: {
    firstStockoutDay: number | null;
    stockoutDuration: number;
    totalUnmetDemand: number;
    recoveryDate: string | null;
    maxShortageUnits: number;
    coverageDays: number | "UNKNOWN" | "NOT_APPLICABLE";
    peakInventoryDay: number;
    totalDemand: number;
  };

  scenarioMetrics: {
    firstStockoutDay: number | null;
    stockoutDuration: number;
    totalUnmetDemand: number;
    recoveryDate: string | null;
    maxShortageUnits: number;
    coverageDays: number | "UNKNOWN" | "NOT_APPLICABLE";
    peakInventoryDay: number;
    totalDemand: number;
  };

  incrementalMetrics: {
    incrementalUnmetDemand: number;
    incrementalShortage: number;
    incrementalStockoutDuration: number;
    incrementalRevenueAtRisk: DataValue<number>;
    incrementalGrossMarginAtRisk: DataValue<number>;
    incrementalProcurementCost?: DataValue<number>;
    incrementalInventoryCarryingCost?: DataValue<number>;
  };

  metrics: {
    firstStockoutDay: number | null;
    stockoutDuration: number;
    totalUnmetDemand: number;
    recoveryDate: string | null;
    maxShortageUnits: number;
    coverageDays: number | "UNKNOWN" | "NOT_APPLICABLE";
    peakInventoryDay: number;
    totalDemand: number;
  };

  financials: {
    revenueAtRisk: DataValue<number>;
    grossMarginAtRisk: DataValue<number>;
    incrementalCost?: DataValue<number>;
    inventoryCarryingCost?: DataValue<number>;
    c2cCycle?: DataValue<number>;
  };
  
  operations: {
    otifPct: DataValue<number>;
    fillRatePct: DataValue<number>;
  };

  mitigations: MitigationOption[];
  
  sr4Impact?: {
    baselineShortage: number;
    scenarioShortage: number;
    shortageDelta: number;
    baselineProcurementCost: number;
    scenarioProcurementCost: number;
    procurementCostDelta: number;
    baselineRevenueAtRisk: string;
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
  };
}
