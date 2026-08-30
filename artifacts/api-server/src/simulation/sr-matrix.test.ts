import { expect, test } from "vitest";
import { SupplyRiskSnapshot } from "./supply-risk-contracts";
import {
  analyzeQualityFailure,
  analyzeSupplierFailure,
  analyzeDiagnosticRisk
} from "./supply-risk-engine";

function buildMockSnapshot(): SupplyRiskSnapshot {
  return {
    products: {
      1270: {
        productId: 1270,
        odooId: 13,
        sku: "AL-5182",
        name: "Aluminium Coil 5182",
        physicalStock: 1500,
        reservedStock: 1500,
        availableStock: 0,
        reservationShortage: 0,
        incomingQuantity: 2950,
        safetyStock: { value: 0, source: "SCHEMA_DEFAULT" },
        leadTimeDays: { value: 7, source: "ODOO_VERIFIED" },
        suppliers: [
          { supplierId: 380, supplierName: "Hydro Aluminium Deeside", preferredSupplier: true, leadTimeDays: { value: 7, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 0 },
          { supplierId: 381, supplierName: "Alt 1", preferredSupplier: false, leadTimeDays: { value: 7, source: "SCHEMA_DEFAULT" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 1 }
        ],
        inboundPOs: [
          { poId: 523, odooId: 21, supplierId: 380, productId: 1270, orderedQuantity: 2950, receivedQuantity: 0, remainingQuantity: 2950, expectedArrivalDate: "2026-08-23", status: "confirmed", confirmedForSupply: true, currentlyInbound: true },
        ]
      },
      16: { // Mountain Dew (Single Supplier, Reservation Shortage)
        productId: 16,
        odooId: 16,
        sku: "MTN-DEW",
        name: "Mountain Dew Can 355ml",
        physicalStock: 210000,
        reservedStock: 1275000,
        availableStock: 0,
        reservationShortage: 1065000,
        incomingQuantity: 0,
        safetyStock: { value: 0, source: "SCHEMA_DEFAULT" },
        leadTimeDays: { value: 2, source: "ODOO_VERIFIED" },
        suppliers: [
          { supplierId: 380, supplierName: "Hydro Aluminium Deeside", preferredSupplier: true, leadTimeDays: { value: 2, source: "ODOO_VERIFIED" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 0 }
        ],
        inboundPOs: []
      },
      99: { // Test product for Unverified Lead Time
        productId: 99,
        odooId: 99,
        sku: "TEST-PROD",
        name: "Test Prod",
        physicalStock: 1500,
        reservedStock: 0,
        availableStock: 1500,
        reservationShortage: 0,
        incomingQuantity: 0,
        safetyStock: { value: 0, source: "SCHEMA_DEFAULT" },
        leadTimeDays: { value: 7, source: "SCHEMA_DEFAULT" },
        suppliers: [
          { supplierId: 1, supplierName: "Sup", preferredSupplier: true, leadTimeDays: { value: 7, source: "SCHEMA_DEFAULT" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 0 }
        ],
        inboundPOs: []
      }
    },
    demand: [
      { salesOrderId: 1, salesOrderLineId: 1, customerId: 1, productId: 16, demandDate: "2026-08-20", demandQuantity: 1000, status: "confirmed" }
    ],
    boms: {
      16: { odooBomId: 1, parentSkuId: 16, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 15, componentQty: 1 }] },
      15: { odooBomId: 2, parentSkuId: 15, parentBomQty: 1, lines: [{ odooLineId: 2, childSkuId: 1270, componentQty: 0.01 }] }
    },
    productionRuns: [
      { id: 1, odooId: 15, productOdooId: 16, productName: "Mountain Dew", moState: "confirmed", plannedUnits: 385000 },
      { id: 2, odooId: 16, productOdooId: 15, productName: "Printed Can", moState: "confirmed", plannedUnits: 295000 }
    ]
  };
}

function assertEq(
  label: string,
  actual: unknown,
  expected: unknown,
) {
  expect(actual, label).toBe(expected);
}

function runMatrix() {
  console.log("=== SR-1.9 CANONICAL SCENARIO MATRIX ===");
  const snapshot = buildMockSnapshot();

  // SR-01: Single-Supplier Dependency
  // Product 16 (Mountain Dew) has only 1 supplier.
  const sr01 = analyzeDiagnosticRisk(snapshot, "SINGLE_SUPPLIER_RISK", 380, 16);
  assertEq("SR-01: affectedQuantity === 0", sr01.affectedQuantity, 0);
  assertEq("SR-01: singleSupplierDependency === true", sr01.singleSupplierDependency, true);
  assertEq("SR-01: alternateSupplierAvailable === false", sr01.alternateSupplierAvailable, false);
  assertEq("SR-01: severity === HIGH (diagnostic)", sr01.severity, "HIGH"); // Flagged HIGH because single supplier exists

  // SR-02: Alternative Supplier Availability
  // Product 1270 (Aluminium Coil) has 2 suppliers. 380 is target, 381 is alternate.
  const sr02 = analyzeDiagnosticRisk(snapshot, "MULTI_SUPPLIER_RISK", 380, 1270);
  assertEq("SR-02: affectedQuantity === 0", sr02.affectedQuantity, 0);
  assertEq("SR-02: alternateSupplierAvailable === true", sr02.alternateSupplierAvailable, true);
  assertEq("SR-02: singleSupplierDependency === false", sr02.singleSupplierDependency, false);
  assertEq("SR-02: severity === LOW (diagnostic)", sr02.severity, "LOW");

  // SR-03 supplier delay is covered by the time-phased daily simulation tests.

  // SR-04: Lead-Time Provenance Risk
  // Product 99 uses SCHEMA_DEFAULT
  const sr04 = analyzeDiagnosticRisk(snapshot, "UNVERIFIED_LEAD_TIME", 1, 99);
  assertEq("SR-04: leadTimeVerified === false", sr04.leadTimeVerified, false);
  assertEq("SR-04: severity === UNKNOWN (diagnostic)", sr04.severity, "UNKNOWN");

  // SR-05: Capacity Constraint Risk
  const sr05 = analyzeDiagnosticRisk(snapshot, "CAPACITY_CONSTRAINT", 380, 1270);
  assertEq("SR-05: capacityRisk === UNKNOWN", sr05.capacityRisk, "UNKNOWN");
  assertEq("SR-05: severity === UNKNOWN (diagnostic)", sr05.severity, "UNKNOWN");

  // SR-06: Buffer Depletion / Reservation Shortage
  // Product 16 has a reservation shortage of 1,065,000
  const sr06 = analyzeDiagnosticRisk(snapshot, "BUFFER_DEPLETION", 380, 16);
  assertEq("SR-06: affectedQuantity === 0", sr06.affectedQuantity, 0);
  assertEq("SR-06: severity === HIGH (reservation shortage exists)", sr06.severity, "HIGH");

  // SR-07: Quality Failure
  // 10% of 2950 inbound for 1270 = 295
  const sr07 = analyzeQualityFailure(snapshot, 380, 1270, 0.1);
  assertEq("SR-07: affectedQuantity === 295", sr07.affectedQuantity, 295);
  // Stock is physical 1500, reserved 1500 -> available 0. So residual shortage = 295.
  assertEq("SR-07: residualShortage === 295", sr07.residualShortage, 295);

  // SR-08: Complete Supplier Failure
  const sr08 = analyzeSupplierFailure(snapshot, 380, 1270);
  assertEq("SR-08: affectedQuantity === 2950", sr08.affectedQuantity, 2950);
  assertEq("SR-08: residualShortage === 2950", sr08.residualShortage, 2950);
}

test("SR-1.9 canonical scenario matrix", runMatrix);
