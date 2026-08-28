import { SupplyRiskSnapshot } from "./supply-risk-contracts";
import {
  analyzeQualityFailure,
  analyzeSupplierFailure,
  traceDownstreamImpacts
} from "./supply-risk-engine";

// Helper to build a mock snapshot
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
          { poId: 502, odooId: 13, supplierId: 379, productId: 1270, orderedQuantity: 12000, receivedQuantity: 0, remainingQuantity: 12000, expectedArrivalDate: "", status: "draft", confirmedForSupply: false, currentlyInbound: false },
          { poId: 508, odooId: 7, supplierId: 381, productId: 1270, orderedQuantity: 22000, receivedQuantity: 0, remainingQuantity: 22000, expectedArrivalDate: "", status: "cancel", confirmedForSupply: false, currentlyInbound: false },
        ]
      },
      16: {
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
      99: { // Quality failure test mock product
        productId: 99,
        odooId: 99,
        sku: "TEST-QUAL",
        name: "Test Quality",
        physicalStock: 1500,
        reservedStock: 0,
        availableStock: 1500,
        reservationShortage: 0,
        incomingQuantity: 15000,
        safetyStock: { value: 0, source: "SCHEMA_DEFAULT" },
        leadTimeDays: { value: 7, source: "SCHEMA_DEFAULT" },
        suppliers: [
          { supplierId: 1, supplierName: "Sup", preferredSupplier: true, leadTimeDays: { value: 7, source: "SCHEMA_DEFAULT" }, minimumOrderQuantity: 0, supplierUnitCost: 0, sequence: 0 }
        ],
        inboundPOs: [
          { poId: 1, odooId: 1, supplierId: 1, productId: 99, orderedQuantity: 15000, receivedQuantity: 0, remainingQuantity: 15000, expectedArrivalDate: "", status: "confirmed", confirmedForSupply: true, currentlyInbound: true }
        ]
      },
      100: { // Tropicana Orange Juice
        productId: 100,
        odooId: 100,
        sku: "TROP-1L",
        name: "Tropicana Orange Juice 1L",
        physicalStock: 0,
        reservedStock: 0,
        availableStock: 0,
        reservationShortage: 0,
        incomingQuantity: 0,
        safetyStock: { value: 0, source: "SCHEMA_DEFAULT" },
        leadTimeDays: { value: 7, source: "SCHEMA_DEFAULT" },
        suppliers: [],
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

function runTests() {
  const snapshot = buildMockSnapshot();
  let passed = 0;
  let failed = 0;

  function assertEq(label: string, actual: any, expected: any) {
    if (actual === expected) {
      console.log(`[PASS] ${label}`);
      passed++;
    } else {
      console.error(`[FAIL] ${label} - Expected ${expected}, got ${actual}`);
      failed++;
    }
  }

  console.log("=== SR-1.7 DETERMINISTIC TEST SUITE ===\n");

  // Supplier-delay behavior is covered by the time-phased daily simulation tests.

  // TEST 5: Quality failure 10%
  const q10 = analyzeQualityFailure(snapshot, 1, 99, 0.10);
  assertEq("TEST 5: Quality 10% exposure", q10.affectedQuantity, 1500);
  assertEq("TEST 5: Quality 10% coverage", q10.inventoryCoverage, 1500);
  assertEq("TEST 5: Quality 10% shortage", q10.residualShortage, 0);

  // TEST 6: Quality failure 20%
  const q20 = analyzeQualityFailure(snapshot, 1, 99, 0.20);
  assertEq("TEST 6: Quality 20% exposure", q20.affectedQuantity, 3000);
  assertEq("TEST 6: Quality 20% coverage", q20.inventoryCoverage, 1500);
  assertEq("TEST 6: Quality 20% shortage", q20.residualShortage, 1500);

  // TEST 7: Supplier failure (Aluminium Coil)
  const fail = analyzeSupplierFailure(snapshot, 380, 1270);
  assertEq("TEST 7: Supplier failure exposure (filters draft/cancel)", fail.affectedQuantity, 2950);

  // TEST 8: Single supplier (Mountain Dew)
  const mtnDewFail = analyzeSupplierFailure(snapshot, 380, 16);
  assertEq("TEST 8: Mountain Dew singleSupplierDependency = true", mtnDewFail.singleSupplierDependency, true);

  // TEST 9: Multi supplier (Aluminium Coil)
  assertEq("TEST 9: Aluminium Coil singleSupplierDependency = false", fail.singleSupplierDependency, false);

  // TEST 10: Lead time provenance
  assertEq("TEST 10: Mountain Dew leadTimeVerified = true", mtnDewFail.leadTimeVerified, true);

  const tropicanaFail = analyzeSupplierFailure(snapshot, 999, 100);
  assertEq("TEST 10: Tropicana leadTimeVerified = false", tropicanaFail.leadTimeVerified, false);

  // TEST 11: Reservation shortage
  assertEq("TEST 11: Mountain Dew reservationShortage = 1,065,000", snapshot.products[16].reservationShortage, 1065000);
  assertEq("TEST 11: Mountain Dew available = 0", snapshot.products[16].availableStock, 0);

  // TEST 12: No BOM dependency
  const tropDownstream = traceDownstreamImpacts(snapshot, 100);
  assertEq("TEST 12: Tropicana downstreamMOs length", tropDownstream.delayedMOs.length, 0);
  assertEq("TEST 12: Tropicana affectedSalesOrders length", tropDownstream.affectedSalesOrders.length, 0);

  console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runTests();
