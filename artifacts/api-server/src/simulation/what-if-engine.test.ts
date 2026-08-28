import { test } from "node:test";
import assert from "node:assert";
import { simulateMitigationAction } from "./what-if-engine";
import { SupplyRiskSnapshot, RiskExposure, RiskMitigation } from "./supply-risk-contracts";

function createMockSnapshot(): SupplyRiskSnapshot {
  return {
    products: {
      100: {
        productId: 100,
        odooId: 100,
        sku: "TEST-1",
        name: "Test Product",
        physicalStock: 0,
        reservedStock: 0,
        availableStock: 50,
        reservationShortage: 100,
        inboundPOs: [
          { poId: 1, odooId: 1, supplierId: 10, productId: 100, orderedQuantity: 50, receivedQuantity: 0, remainingQuantity: 50, expectedArrivalDate: "2099-12-01", status: "confirmed", confirmedForSupply: true, currentlyInbound: true }
        ],
        suppliers: [
          { supplierId: 10, supplierName: "Old Supplier", preferredSupplier: true, leadTimeDays: { value: 5, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 10, sequence: 1 },
          { supplierId: 20, supplierName: "Alt Supplier", preferredSupplier: false, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 2 }
        ],
        leadTimeDays: { value: 5, source: "ODOO_VERIFIED" },
        incomingQuantity: 0,
        safetyStock: { value: 0, source: "UNKNOWN" }
      }
    },
    boms: {},
    demand: [],
    productionRuns: []
  };
}

function createMockExposure(): RiskExposure {
  return {
    scenarioType: "BUFFER_DEPLETION",
    targetSupplierId: 10,
    targetProductId: 100,
    severity: "HIGH",
    affectedQuantity: 0,
    inventoryCoverage: 0,
    residualShortage: 100,
    canAbsorbWithBuffer: false,
    alternateSupplierAvailable: true,
    downstreamImpacts: { dependentProducts: [], delayedMOs: [], affectedSalesOrders: [] },
    exposureReason: "Test",
    inventoryCoveragePercent: 0,
    singleSupplierDependency: false,
    leadTimeVerified: true,
    capacityRisk: "UNKNOWN",
    currentlyInboundQuantity: 50,
    totalSupplierCount: 2
  };
}

test("SR-4.1 What-If Core: ALTERNATE_SUPPLIER isolated baseline and assumptions", () => {
  const snapshot = createMockSnapshot();
  const exposure = createMockExposure();
  const mitigation: RiskMitigation = {
    id: "ALT_20",
    type: "ALTERNATE_SUPPLIER",
    title: "Use Alt Supplier",
    reason: "Testing",
    feasible: true,
    affectedQuantity: 30, // Request 30 units
    targetSupplierId: 20,
    targetSupplierName: "Alt Supplier",
    targetProductId: 100,
    mitigationCostProvenance: "CALCULATED",
    mitigationDateProvenance: "UNKNOWN"
  };

  const snapshotJson = JSON.stringify(snapshot);

  const result = simulateMitigationAction(snapshot, exposure, mitigation);

  // 1. Baseline remains unchanged
  assert.strictEqual(JSON.stringify(snapshot), snapshotJson, "Baseline snapshot was mutated");

  // 2. Scenario is isolated
  assert.strictEqual(result.scenarioValidity, "VALID");

  // 3. ALTERNATE_SUPPLIER injects only the requested quantity
  // 4. Uses verified supplier cost
  // Base procurement cost: 50 inbound * $10 (old supplier) = $500
  // Scenario procurement cost: $500 + (30 requested * $15 alt supplier) = $950
  assert.strictEqual(result.baselineMetrics.procurementCost, 500);
  assert.strictEqual(result.scenarioMetrics.procurementCost, 950);
  assert.strictEqual(result.incrementalMetrics.procurementCostDelta, 450);

  // 12. Incremental math equals scenario minus baseline
  assert.strictEqual(
    result.incrementalMetrics.shortageDelta,
    result.scenarioMetrics.residualShortage - result.baselineMetrics.residualShortage
  );

  // 6. Supplier capacity remains UNKNOWN
  assert.strictEqual(result.provenance.supplierCapacity, "UNKNOWN");

  // 9. No arrival date is claimed without a supportable scenario date.
  assert.strictEqual(result.provenance.dateSource, "UNKNOWN");
  assert(
    result.scenarioAssumptions.includes(
      "Alternate supplier arrival date is not determinable.",
    ),
  );

  // 10. Expedite cost remains UNKNOWN
  assert.strictEqual(result.provenance.expediteCost, "UNKNOWN");

  // 11. Revenue-at-risk remains UNKNOWN
  assert.strictEqual(result.incrementalMetrics.revenueAtRiskDelta, "UNKNOWN");

  // Scenario Assumptions exist
  assert(result.scenarioAssumptions.includes("Alternate supplier quantity is hypothetical."));
});

test("SR-4.1 What-If Core: FOLLOW_UP_INBOUND shifts explicitly supplied date shift", () => {
  const snapshot = createMockSnapshot();
  const exposure = createMockExposure();
  const mitigation: RiskMitigation = {
    id: "FU_10",
    type: "FOLLOW_UP_INBOUND",
    title: "Follow up",
    reason: "Testing",
    feasible: true,
    affectedQuantity: 50,
    availableQuantity: 50,
    mitigationDate: "2026-01-01",
    mitigationCostProvenance: "UNKNOWN",
    mitigationDateProvenance: "EXPECTED_ARRIVAL"
  };

  const result = simulateMitigationAction(snapshot, exposure, mitigation);

  assert.strictEqual(result.scenarioValidity, "VALID");
  assert.strictEqual(result.provenance.dateSource, "SCENARIO_ASSUMPTION");
  assert(result.scenarioAssumptions.includes("Expedited arrival date is a hypothetical scenario assumption."));

  // Cost should not change for follow-up
  assert.strictEqual(result.incrementalMetrics.procurementCostDelta, 0);
});

test("SR-4.1 What-If Core: COVER_FROM_AVAILABLE_STOCK cannot consume more than available stock", () => {
  const snapshot = createMockSnapshot();
  const exposure = createMockExposure();
  // Exposure needs 100, we only have 50 available.
  const mitigation: RiskMitigation = {
    id: "COVER_10",
    type: "COVER_FROM_AVAILABLE_STOCK",
    title: "Cover stock",
    reason: "Testing",
    feasible: true,
    affectedQuantity: 100,
    availableQuantity: 50,
    mitigationCostProvenance: "UNKNOWN",
    mitigationDateProvenance: "UNKNOWN"
  };

  const result = simulateMitigationAction(snapshot, exposure, mitigation);

  assert.strictEqual(result.scenarioValidity, "VALID");
  // Shortage was 100, we injected a dummy PO for Math.min(100, 50) = 50.
  // The scenario shortage should be 50.
  assert.strictEqual(result.baselineMetrics.residualShortage, 100);

  // The key is that it didn't consume 100
  assert.strictEqual(result.scenarioMetrics.residualShortage, result.baselineMetrics.residualShortage - 50);
});

test("SR-4.1 What-If Core: Unsupported actions and Missing data return INVALID", () => {
  const snapshot = createMockSnapshot();
  const exposure = createMockExposure();

  const badMitigation: RiskMitigation = {
    id: "PRIORITIZE_1",
    type: "PRIORITIZE_DOWNSTREAM_DEMAND",
    title: "Prioritize",
    reason: "Testing",
    feasible: true,
    affectedQuantity: 10,
    mitigationCostProvenance: "UNKNOWN",
    mitigationDateProvenance: "UNKNOWN"
  };

  const res1 = simulateMitigationAction(snapshot, exposure, badMitigation);
  assert.strictEqual(res1.scenarioValidity, "INVALID_UNSUPPORTED_ACTION");

  const badMitigation2: RiskMitigation = {
    id: "ALT_99",
    type: "ALTERNATE_SUPPLIER",
    title: "Missing Supplier",
    reason: "Testing",
    feasible: true,
    affectedQuantity: 10,
    targetSupplierId: 99,
    mitigationCostProvenance: "UNKNOWN",
    mitigationDateProvenance: "UNKNOWN"
  };
  const res2 = simulateMitigationAction(snapshot, exposure, badMitigation2);
  assert.strictEqual(res2.scenarioValidity, "INVALID_INSUFFICIENT_DATA");
});
