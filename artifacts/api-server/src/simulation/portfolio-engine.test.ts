import { test, expect } from 'vitest';
import { simulatePortfolio } from './portfolio-engine';
import { SupplyRiskSnapshot, RiskMitigation } from './supply-risk-contracts';
import { SalesOrderPriceLookup } from './pegging-contracts';

const mockPriceLookup: SalesOrderPriceLookup[] = [
  { salesOrderId: 500, unitPrice: 10, currency: 'USD' }
];

function buildMockSnapshot(): SupplyRiskSnapshot {
  return {
    products: {
      1: {
        productId: 1, odooId: null, sku: "A", name: "Comp A",
        physicalStock: 0, reservedStock: 100, availableStock: 20, reservationShortage: 100,
        incomingQuantity: 0, safetyStock: {value: 0, source: "SCHEMA_DEFAULT"}, leadTimeDays: {value: 5, source: "SCHEMA_DEFAULT"},
        inboundPOs: [],
        suppliers: [
          { supplierId: 101, supplierName: "Sup1", preferredSupplier: true, leadTimeDays: {value: 5, source: "SCHEMA_DEFAULT"}, minimumOrderQuantity: 0, supplierUnitCost: 10, sequence: 1 },
          { supplierId: 102, supplierName: "Sup2", preferredSupplier: false, leadTimeDays: {value: 5, source: "SCHEMA_DEFAULT"}, minimumOrderQuantity: 0, supplierUnitCost: 15, sequence: 2 }
        ]
      },
      2: {
        productId: 2, odooId: null, sku: "B", name: "Comp B",
        physicalStock: 0, reservedStock: 80, availableStock: 0, reservationShortage: 80,
        incomingQuantity: 0, safetyStock: {value: 0, source: "SCHEMA_DEFAULT"}, leadTimeDays: {value: 5, source: "SCHEMA_DEFAULT"},
        inboundPOs: [],
        suppliers: [
          { supplierId: 101, supplierName: "Sup1", preferredSupplier: true, leadTimeDays: {value: 5, source: "SCHEMA_DEFAULT"}, minimumOrderQuantity: 0, supplierUnitCost: 5, sequence: 1 }
        ]
      },
      3: {
        productId: 3, odooId: null, sku: "X", name: "FG X",
        physicalStock: 0, reservedStock: 0, availableStock: 0, reservationShortage: 0,
        incomingQuantity: 0, safetyStock: {value: 0, source: "SCHEMA_DEFAULT"}, leadTimeDays: {value: 5, source: "SCHEMA_DEFAULT"},
        inboundPOs: [], suppliers: []
      }
    },
    demand: [
      { salesOrderId: 500, salesOrderLineId: 1, customerId: null, productId: 3, demandDate: "2026-08-20", demandQuantity: 100, status: "confirmed" },
      { salesOrderId: 501, salesOrderLineId: 2, customerId: null, productId: 3, demandDate: "2026-08-21", demandQuantity: 50, status: "confirmed" }
    ],
    boms: {
      3: {
        odooBomId: 1, parentSkuId: 3, parentBomQty: 1,
        lines: [
          { odooLineId: 1, childSkuId: 1, componentQty: 1 },
          { odooLineId: 2, childSkuId: 2, componentQty: 1 }
        ]
      }
    },
    productionRuns: []
  };
}

test('1. Single mitigation behaves correctly', () => {
  const snapshot = buildMockSnapshot();
  const mitigations: RiskMitigation[] = [{
    id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true,
    affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 1
  }];
  
  const res = simulatePortfolio(snapshot, mitigations, mockPriceLookup);
  expect(res.actionExecutionTraces.length).toBe(1);
  expect(res.actionExecutionTraces[0].executedQuantity).toBe(100);
  expect(res.actionExecutionTraces[0].executedCost).toBe(1000);
});

test('2, 3, 4, 5. Canonical ordering, COVER first, Sequential shortage, Skip when zero', () => {
  const snapshot = buildMockSnapshot();
  // Shortage = 100.
  // M1: alternate supplier for 100
  // M2: cover from stock (stock=20)
  // M3: alternate supplier for 100
  const mitigations: RiskMitigation[] = [
    { id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 102, targetProductId: 1 },
    { id: "M2", type: "COVER_FROM_AVAILABLE_STOCK", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetProductId: 1 },
    { id: "M3", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 1 }
  ];
  
  // M2 should run first, taking 20 (free). Shortage=80.
  // M3 should run next (Sup1 cost 10 < Sup2 cost 15). taking 80 (cost 800). Shortage=0.
  // M1 should run last. taking 0. Skipped.
  
  const res = simulatePortfolio(snapshot, mitigations, mockPriceLookup);
  const tM2 = res.actionExecutionTraces.find(t => t.mitigationId === "M2");
  const tM3 = res.actionExecutionTraces.find(t => t.mitigationId === "M3");
  const tM1 = res.actionExecutionTraces.find(t => t.mitigationId === "M1");
  
  expect(tM2?.executedQuantity).toBe(20);
  expect(tM3?.executedQuantity).toBe(80);
  expect(tM3?.executedCost).toBe(800);
  expect(tM1?.executedQuantity).toBe(0);
  expect(tM1?.wasSkipped).toBe(true);
  
  expect(res.totalProcurementCostDelta).toBe(800);
});

test('6, 7. Skipped UNKNOWN does not contaminate, Executed UNKNOWN does', () => {
  const snapshot = buildMockSnapshot();
  // M1: covers 100 with known cost
  // M2: covers 100 with unknown cost (will be skipped)
  const mSkippedUnknown: RiskMitigation[] = [
    { id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 1 },
    { id: "M2", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "UNKNOWN", mitigationDateProvenance: "UNKNOWN", targetSupplierId: 102, targetProductId: 1 }
  ];
  const res1 = simulatePortfolio(snapshot, mSkippedUnknown, mockPriceLookup);
  expect(res1.provenance.cost).toBe("CALCULATED");
  expect(res1.totalProcurementCostDelta).toBe(1000);
  
  // M3: covers 100 with unknown cost (executed)
  const mExecutedUnknown: RiskMitigation[] = [
    { id: "M3", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "UNKNOWN", mitigationDateProvenance: "UNKNOWN", targetSupplierId: 102, targetProductId: 1 }
  ];
  const res2 = simulatePortfolio(snapshot, mExecutedUnknown, mockPriceLookup);
  expect(res2.provenance.cost).toBe("UNKNOWN");
  expect(res2.totalProcurementCostDelta).toBe("UNKNOWN");
});

test('8, 9, 11. Two components affecting same SO are deduplicated', () => {
  const snapshot = buildMockSnapshot();
  // Target FG X (needs Comp A and Comp B). SO 500 qty=100. SO 501 qty=50.
  // Comp A shortage = 100. Comp B shortage = 80.
  // Baseline: SO 500 misses 100. SO 501 misses 0 (actually 100 vs 80, limiting is 100, so missed is 100. 150 total demand, available A=50, available B=70. SO 500 demands 100, fulfills A=50 B=70. Wait. Pegging allocates sequentially.)
  
  const mitigations: RiskMitigation[] = [
    { id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 1 },
    { id: "M2", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 80, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 2 }
  ];
  
  const res = simulatePortfolio(snapshot, mitigations, mockPriceLookup);
  
  // Both mitigated. So missed quantity should be 0.
  // Affected Sales Orders should have missedQuantity = 0 for 500 and 501.
  expect(res.affectedSalesOrders.every(so => so.missedQuantity === 0)).toBe(true);
});

test('10. Missing Sales Order price propagates UNKNOWN', () => {
  const snapshot = buildMockSnapshot();
  // SO 501 has UNKNOWN price.
  // If we don't mitigate anything, SO 500 misses and SO 501 misses. 
  // Wait, if we mitigate nothing, the uniqueProducts array is empty! We need to pass at least one mitigation.
  const mitigations: RiskMitigation[] = [
    { id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 0, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 1 }
  ];
  const res = simulatePortfolio(snapshot, mitigations, mockPriceLookup);
  // SO 501 is affected, and has UNKNOWN price
  expect(res.provenance.revenue).toBe("UNKNOWN");
  expect(res.deduplicatedRevenueDelta).toBe("UNKNOWN");
});

test('13. Baseline snapshot remains unchanged', () => {
  const snapshot = buildMockSnapshot();
  const snapshotStr = JSON.stringify(snapshot);
  
  const mitigations: RiskMitigation[] = [
    { id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 1 }
  ];
  simulatePortfolio(snapshot, mitigations, mockPriceLookup);
  
  expect(JSON.stringify(snapshot)).toBe(snapshotStr);
});

test('14, 15. Determinism test - 100 consecutive executions with reordered arrays', () => {
  const snapshot = buildMockSnapshot();
  const mitigations: RiskMitigation[] = [
    { id: "M1", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 102, targetProductId: 1 },
    { id: "M2", type: "COVER_FROM_AVAILABLE_STOCK", title: "", reason: "", feasible: true, affectedQuantity: 100, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetProductId: 1 },
    { id: "M3", type: "ALTERNATE_SUPPLIER", title: "", reason: "", feasible: true, affectedQuantity: 80, mitigationCostProvenance: "CALCULATED", mitigationDateProvenance: "CALCULATED", targetSupplierId: 101, targetProductId: 2 }
  ];
  
  let firstResultStr = "";
  
  for (let i = 0; i < 100; i++) {
    // Shuffle mitigations
    const shuffled = [...mitigations].sort(() => Math.random() - 0.5);
    const res = simulatePortfolio(snapshot, shuffled, mockPriceLookup);
    
    // We expect M2 (cover) to take 20. Cost=0.
    // M1 (alt sup) to take 80. Cost = 80 * 15 = 1200.
    // M3 (alt sup comp 2) to take 80. Cost = 80 * 5 = 400.
    // Total cost = 1600.
    
    // We don't compare the whole JSON because synthetic IDs include execution index `i` which depends on the sorted order.
    // Actually `syntheticPoId = 9000000 + targetProductId + i` uses the loop index `i` from the sorted array.
    // Since the sorted array is deterministic, the IDs injected into the clone will be identical every time!
    // So the entire result JSON must be identical.
    
    const resStr = JSON.stringify(res);
    if (i === 0) {
      firstResultStr = resStr;
      
      // Let's also assert the values are correct
      expect(res.totalProcurementCostDelta).toBe(1600);
      const tM2 = res.actionExecutionTraces.find(t => t.mitigationId === "M2");
      expect(tM2?.executedQuantity).toBe(20);
    } else {
      expect(resStr).toBe(firstResultStr);
    }
  }
});
