import { BOMNode } from "./bom-propagation";

export interface DataProvenance<T> {
  value: T | null;
  source:
  | "ODOO_VERIFIED"
  | "ODOO_SUPPLIERINFO"
  | "USER_PROVIDED"
  | "CSV_IMPORT"
  | "CALCULATED_FROM_VERIFIED_INPUTS"
  | "SCHEMA_DEFAULT"
  | "UNKNOWN";
}
export interface InboundSupply {
  poId: number;
  odooId: number | null;
  supplierId: number;
  productId: number;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  expectedArrivalDate: string | null; // YYYY-MM-DD when supportable
  status: string;
  confirmedForSupply: boolean; // True if status is 'confirmed', 'purchase', 'done', etc.
  currentlyInbound: boolean;   // True if confirmedForSupply && remainingQuantity > 0
}

export interface SupplierRiskProfile {
  supplierId: number;
  supplierName: string;
  preferredSupplier: boolean;
  leadTimeDays: DataProvenance<number>;
  minimumOrderQuantity: number | null;
  supplierUnitCost: number | null;
  sequence: number;
  // Future fields (reliability, capacity)
}

export interface ProductInventory {
  productId: number;
  odooId: number | null;
  sku: string;
  name: string;

  physicalStock: number;       // onHand
  reservedStock: number;       // reservedQuantity
  availableStock: number;      // max(onHand - reserved, 0)
  reservationShortage: number; // max(reserved - onHand, 0)

  incomingQuantity: number;    // Aggregate convenience
  safetyStock: DataProvenance<number>;
  leadTimeDays: DataProvenance<number>;

  suppliers: SupplierRiskProfile[];
  inboundPOs: InboundSupply[];
}

export interface DemandRecord {
  salesOrderId: number;
  salesOrderLineId: number;
  customerId: number | null;
  productId: number;
  demandDate: string;
  demandQuantity: number;
  status: string;
}

export interface SupplyRiskSnapshot {
  products: Record<number, ProductInventory>;
  demand: DemandRecord[];
  boms: Record<number, BOMNode>; // Reuses existing bom-propagation structure
  productionRuns: any[];         // Reuses existing MO structure
}

export interface RiskExposure {
  scenarioType: string;
  targetSupplierId?: number;
  targetProductId?: number;

  // Facts
  affectedQuantity: number;
  inventoryCoverage: number;
  residualShortage: number;

  // Mitigation Flags
  canAbsorbWithBuffer: boolean;
  alternateSupplierAvailable: boolean;

  downstreamImpacts: {
    dependentProducts: number[];
    delayedMOs: number[];
    affectedSalesOrders: number[];
  };

  // Additional Deterministic Facts
  exposureReason: string;
  inventoryCoveragePercent: number;
  singleSupplierDependency: boolean;
  leadTimeVerified: boolean;
  capacityRisk: string; // 'UNKNOWN'
  currentlyInboundQuantity: number;
  totalSupplierCount: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
}

export interface RiskMitigation {
  id: string; // Unique identifier, e.g., "ALT_SUPPLIER_502"
  type: "ALTERNATE_SUPPLIER" | "FOLLOW_UP_INBOUND" | "COVER_FROM_AVAILABLE_STOCK" | "PRIORITIZE_DOWNSTREAM_DEMAND" | "MONITOR_UNVERIFIED_LEAD_TIME" | "CAPACITY_DATA_REQUIRED";
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
}

export interface MitigationResult {
  scenarioType: string;
  riskSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  actions: RiskMitigation[];
}
