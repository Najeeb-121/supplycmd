import { test } from "vitest";
import { generateMitigations } from "./supply-risk-mitigation";
import { RiskExposure, SupplyRiskSnapshot, ProductInventory } from "./supply-risk-contracts";

const createMockProduct = (overrides: Partial<ProductInventory>): ProductInventory => ({
  productId: 1, odooId: 1, sku: "SKU1", name: "Product 1",
  physicalStock: 0, reservedStock: 0, availableStock: 0, reservationShortage: 0,
  incomingQuantity: 0,
  safetyStock: { value: 0, source: "UNKNOWN" },
  leadTimeDays: { value: 0, source: "UNKNOWN" },
  suppliers: [], inboundPOs: [],
  ...overrides
});

const createMockExposure = (overrides: Partial<RiskExposure>): RiskExposure => ({
  scenarioType: "TEST",
  severity: "HIGH",
  targetProductId: 1,
  targetSupplierId: 100,
  affectedQuantity: 100,
  inventoryCoverage: 0,
  residualShortage: 100,
  canAbsorbWithBuffer: false,
  alternateSupplierAvailable: false,
  downstreamImpacts: { dependentProducts: [], delayedMOs: [], affectedSalesOrders: [] },
  exposureReason: "Test",
  inventoryCoveragePercent: 0,
  singleSupplierDependency: true,
  leadTimeVerified: true,
  capacityRisk: "VERIFIED",
  currentlyInboundQuantity: 0,
  totalSupplierCount: 1,
  ...overrides
});

const snapshot: SupplyRiskSnapshot = { products: {}, demand: [], boms: {}, productionRuns: [] };

function runTest<TResult>(
  name: string,
  setup: () => TResult,
  assertResult: (result: TResult) => void,
) {
  test(name, () => {
    const result = setup();
    assertResult(result);
  });
}

runTest("single supplier", () => {
  const p = createMockProduct({ suppliers: [{ supplierId: 100, supplierName: "A", preferredSupplier: true, leadTimeDays: { value: 5, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 10, sequence: 1 }] });
  const e = createMockExposure({ alternateSupplierAvailable: false });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "ALTERNATE_SUPPLIER")) throw new Error("Should not have alternate supplier");
});

runTest("multiple suppliers (no alternate available)", () => {
  const p = createMockProduct({ suppliers: [{ supplierId: 100, supplierName: "A", preferredSupplier: true, leadTimeDays: { value: 5, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 10, sequence: 1 }] });
  const e = createMockExposure({ alternateSupplierAvailable: false });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "ALTERNATE_SUPPLIER")) throw new Error("Should not have alternate supplier");
});

runTest("no alternate supplier", () => {
  const p = createMockProduct({ suppliers: [] });
  const e = createMockExposure({ alternateSupplierAvailable: false });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "ALTERNATE_SUPPLIER")) throw new Error("Should not have alternate supplier");
});

runTest("multiple alternates", () => {
  const p = createMockProduct({
    suppliers: [
      { supplierId: 100, supplierName: "A", preferredSupplier: true, leadTimeDays: { value: 5, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 10, sequence: 1 },
      { supplierId: 101, supplierName: "B", preferredSupplier: false, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 2 },
      { supplierId: 102, supplierName: "C", preferredSupplier: true, leadTimeDays: { value: 6, source: "SCHEMA_DEFAULT" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 3 }
    ]
  });
  const e = createMockExposure({ alternateSupplierAvailable: true });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const alts = res.actions.filter((a: any) => a.type === "ALTERNATE_SUPPLIER");
  if (alts.length !== 2) throw new Error("Expected 2 alternates");
  if (alts[0].targetSupplierId !== 101) throw new Error("Expected sequence sort to put 101 first (seq 2 vs 3)");
});

runTest("partial stock coverage", () => {
  const p = createMockProduct({ availableStock: 40 });
  const e = createMockExposure({ residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const c = res.actions.find((a: any) => a.type === "COVER_FROM_AVAILABLE_STOCK");
  if (!c) throw new Error("Missing stock coverage");
  if (c.availableQuantity !== 40) throw new Error(`Expected availableQuantity 40, got ${c.availableQuantity}`);
});

runTest("full stock coverage", () => {
  const p = createMockProduct({ availableStock: 150 });
  const e = createMockExposure({ residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const c = res.actions.find((a: any) => a.type === "COVER_FROM_AVAILABLE_STOCK");
  if (!c) throw new Error("Missing stock coverage");
  if (c.availableQuantity !== 100) throw new Error(`Expected availableQuantity 100, got ${c.availableQuantity}`);
});

runTest("zero usable stock", () => {
  const p = createMockProduct({ availableStock: 0 });
  const e = createMockExposure({ residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "COVER_FROM_AVAILABLE_STOCK")) throw new Error("Should not have stock coverage");
});

runTest("reservation shortage", () => {
  const p = createMockProduct({ availableStock: 0, physicalStock: 100, reservedStock: 150 });
  const e = createMockExposure({ residualShortage: 50 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "COVER_FROM_AVAILABLE_STOCK")) throw new Error("Should not have stock coverage when available is 0");
});

runTest("inbound supply", () => {
  const p = createMockProduct({
    inboundPOs: [{ poId: 1, odooId: 1, supplierId: 1, productId: 1, orderedQuantity: 50, receivedQuantity: 0, remainingQuantity: 50, expectedArrivalDate: "2026-08-20", status: "purchase", confirmedForSupply: true, currentlyInbound: true }]
  });
  const e = createMockExposure({ currentlyInboundQuantity: 50 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const c = res.actions.find((a: any) => a.type === "FOLLOW_UP_INBOUND");
  if (!c) throw new Error("Missing inbound follow up");
  if (c.availableQuantity !== 50) throw new Error("Expected quantity 50");
  if (c.mitigationDate !== "2026-08-20") throw new Error("Expected expectedArrivalDate");
  if (c.mitigationDateProvenance !== "EXPECTED_ARRIVAL") throw new Error("Expected EXPECTED_ARRIVAL provenance");
});

runTest("no inbound supply", () => {
  const p = createMockProduct({ inboundPOs: [] });
  const e = createMockExposure({ currentlyInboundQuantity: 0 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "FOLLOW_UP_INBOUND")) throw new Error("Should not have inbound follow up");
});

runTest("unverified lead time", () => {
  const p = createMockProduct({});
  const e = createMockExposure({ leadTimeVerified: false });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (!res.actions.some((a: any) => a.type === "MONITOR_UNVERIFIED_LEAD_TIME")) throw new Error("Missing unverified lead time mitigation");
});

runTest("unknown capacity", () => {
  const p = createMockProduct({});
  const e = createMockExposure({ capacityRisk: "UNKNOWN" });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (!res.actions.some((a: any) => a.type === "CAPACITY_DATA_REQUIRED")) throw new Error("Missing capacity required mitigation");
});

runTest("downstream impacts", () => {
  const p = createMockProduct({});
  const e = createMockExposure({ downstreamImpacts: { dependentProducts: [], affectedSalesOrders: [1], delayedMOs: [2] } });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (!res.actions.some((a: any) => a.type === "PRIORITIZE_DOWNSTREAM_DEMAND")) throw new Error("Missing downstream prioritization");
});

runTest("no downstream impacts", () => {
  const p = createMockProduct({});
  const e = createMockExposure({ downstreamImpacts: { dependentProducts: [], affectedSalesOrders: [], delayedMOs: [] } });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (res.actions.some((a: any) => a.type === "PRIORITIZE_DOWNSTREAM_DEMAND")) throw new Error("Should not have downstream prioritization");
});

runTest("quality failure", () => {
  const p = createMockProduct({ suppliers: [{ supplierId: 101, supplierName: "B", preferredSupplier: true, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 1 }] });
  const e = createMockExposure({ alternateSupplierAvailable: true, exposureReason: "Low Quality Score" });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (!res.actions.some((a: any) => a.type === "ALTERNATE_SUPPLIER")) throw new Error("Missing alternate supplier for quality failure");
});

runTest("supplier failure", () => {
  const p = createMockProduct({ suppliers: [{ supplierId: 101, supplierName: "B", preferredSupplier: true, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 1 }] });
  const e = createMockExposure({ alternateSupplierAvailable: true, exposureReason: "Late Delivery" });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  if (!res.actions.some((a: any) => a.type === "ALTERNATE_SUPPLIER")) throw new Error("Missing alternate supplier for supplier failure");
});

runTest("supplier cost known", () => {
  const p = createMockProduct({
    suppliers: [
      { supplierId: 101, supplierName: "B", preferredSupplier: false, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 2 }
    ]
  });
  const e = createMockExposure({ alternateSupplierAvailable: true, residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const a = res.actions.find((a: any) => a.type === "ALTERNATE_SUPPLIER");
  if (!a) throw new Error("Missing alternate supplier mitigation");
  if (a.mitigationCost !== 1500) throw new Error("Cost should be 1500");
  if (a.mitigationCostProvenance !== "CALCULATED") throw new Error("Provenance should be CALCULATED");
});

runTest("supplier cost unknown", () => {
  const p = createMockProduct({
    suppliers: [
      { supplierId: 101, supplierName: "B", preferredSupplier: false, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 2 }
    ]
  });
  const e = createMockExposure({ alternateSupplierAvailable: true, residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const a = res.actions.find((a: any) => a.type === "ALTERNATE_SUPPLIER");
  if (!a) throw new Error("Missing alternate supplier mitigation");
  if (a.mitigationCost !== undefined) throw new Error("Cost should be undefined");
  if (a.mitigationCostProvenance !== "UNKNOWN") throw new Error("Provenance should be UNKNOWN");
});

runTest("no fabricated dates", () => {
  const p = createMockProduct({
    suppliers: [
      { supplierId: 101, supplierName: "B", preferredSupplier: false, leadTimeDays: { value: 0, source: "UNKNOWN" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 2 }
    ]
  });
  const e = createMockExposure({ alternateSupplierAvailable: true, residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const a = res.actions.find((a: any) => a.type === "ALTERNATE_SUPPLIER");
  if (!a) throw new Error("Missing alternate supplier mitigation");
  if (a.mitigationDate !== undefined) throw new Error("Date should be undefined");
  if (a.mitigationDateProvenance !== "UNKNOWN") throw new Error("Provenance should be UNKNOWN");
});

runTest("no fabricated supplier capacity", () => {
  const p = createMockProduct({
    suppliers: [
      { supplierId: 101, supplierName: "B", preferredSupplier: false, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 2 }
    ]
  });
  const e = createMockExposure({ alternateSupplierAvailable: true, residualShortage: 100 });
  return generateMitigations({ ...snapshot, products: { 1: p } }, e);
}, (res) => {
  const a = res.actions.find((a: any) => a.type === "ALTERNATE_SUPPLIER");
  if (!a) throw new Error("Missing alternate supplier mitigation");
  if (a.availableQuantity !== undefined) throw new Error("availableQuantity should be undefined");
});
