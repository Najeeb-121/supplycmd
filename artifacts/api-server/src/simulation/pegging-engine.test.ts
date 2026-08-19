import assert from 'node:assert';
import test from 'node:test';
import { calculateDownstreamPegging } from './pegging-engine';
import { SupplyRiskSnapshot } from './supply-risk-contracts';
import { SalesOrderPriceLookup } from './pegging-contracts';

test('Date-based FIFO', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] }
    },
    demand: [
      { salesOrderId: 2, salesOrderLineId: 2, customerId: null, productId: 100, demandDate: '2026-08-15', demandQuantity: 100, status: 'open' },
      { salesOrderId: 1, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const prices: SalesOrderPriceLookup[] = [
    { salesOrderId: 1, unitPrice: 10, currency: 'USD' },
    { salesOrderId: 2, unitPrice: 10, currency: 'USD' }
  ];

  // Total demand = 200 components. Shortage = 100 components. Available = 100.
  // ASC sorting: SO 1 (Aug 10) is fulfilled. SO 2 (Aug 15) absorbs the shortage.
  const result = calculateDownstreamPegging(snapshot, 10, 100, prices);

  assert.strictEqual(result.affectedSalesOrders.length, 1);
  assert.strictEqual(result.affectedSalesOrders[0].salesOrderId, 2);
  assert.strictEqual(result.affectedSalesOrders[0].missedQuantity, 100);
  assert.strictEqual(result.affectedSalesOrders[0].missedRevenue, 1000);
});

test('Same-date Sales Order ID tie-breaking', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] }
    },
    demand: [
      { salesOrderId: 8, salesOrderLineId: 2, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' },
      { salesOrderId: 5, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const prices: SalesOrderPriceLookup[] = [
    { salesOrderId: 5, unitPrice: 10, currency: 'USD' },
    { salesOrderId: 8, unitPrice: 10, currency: 'USD' }
  ];

  const result = calculateDownstreamPegging(snapshot, 10, 100, prices);

  // SO 5 gets fulfilled, SO 8 gets starved
  assert.strictEqual(result.affectedSalesOrders.length, 1);
  assert.strictEqual(result.affectedSalesOrders[0].salesOrderId, 8);
  assert.strictEqual(result.affectedSalesOrders[0].missedQuantity, 100);
});

test('Partial Sales Order starvation', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] }
    },
    demand: [
      { salesOrderId: 1, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const prices: SalesOrderPriceLookup[] = [{ salesOrderId: 1, unitPrice: 10, currency: 'USD' }];

  const result = calculateDownstreamPegging(snapshot, 10, 50, prices);

  assert.strictEqual(result.affectedSalesOrders.length, 1);
  assert.strictEqual(result.affectedSalesOrders[0].missedQuantity, 50);
});

test('One component shared by multiple finished goods', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] },
      200: { odooBomId: 2, parentSkuId: 200, parentBomQty: 1, lines: [{ odooLineId: 2, childSkuId: 10, componentQty: 2 }] }
    },
    demand: [
      { salesOrderId: 1, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-01', demandQuantity: 100, status: 'open' },
      { salesOrderId: 2, salesOrderLineId: 2, customerId: null, productId: 200, demandDate: '2026-08-05', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const prices: SalesOrderPriceLookup[] = [
    { salesOrderId: 1, unitPrice: 10, currency: 'USD' },
    { salesOrderId: 2, unitPrice: 20, currency: 'USD' }
  ];

  // Demand: SO1 = 100 comps, SO2 = 200 comps. Total = 300 comps.
  // Shortage = 150. Available = 150.
  // SO1 (Aug 1) fulfilled (takes 100 comps). Available left = 50.
  // SO2 (Aug 5) gets 50 comps. Needs 200. Starved 150 comps.
  // Since FG2 needs 2 comps/unit, starved FG = 150 / 2 = 75 units.
  const result = calculateDownstreamPegging(snapshot, 10, 150, prices);

  assert.strictEqual(result.affectedSalesOrders.length, 1);
  assert.strictEqual(result.affectedSalesOrders[0].salesOrderId, 2);
  assert.strictEqual(result.affectedSalesOrders[0].missedQuantity, 75);
  assert.strictEqual(result.verifiedRevenueAtRisk, 75 * 20);
});

test('Zero component shortage gracefully returning 0 impacts', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] }
    },
    demand: [
      { salesOrderId: 1, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const prices: SalesOrderPriceLookup[] = [{ salesOrderId: 1, unitPrice: 10, currency: 'USD' }];

  const result = calculateDownstreamPegging(snapshot, 10, 0, prices);

  assert.strictEqual(result.affectedSalesOrders.length, 0);
  assert.strictEqual(result.verifiedRevenueAtRisk, 0);
});

test('Missing price triggers PARTIAL_MISSING_PRICE provenance and UNKNOWN revenue', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] }
    },
    demand: [
      { salesOrderId: 1, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const result = calculateDownstreamPegging(snapshot, 10, 50, []); // No prices

  assert.strictEqual(result.revenueProvenance.status, 'PARTIAL_MISSING_PRICE');
  assert.strictEqual(result.verifiedRevenueAtRisk, 'UNKNOWN');
  assert.strictEqual(result.affectedSalesOrders[0].missedRevenue, 'UNKNOWN');
});

test('SR-4.1 mitigation comparison', () => {
  const snapshot: SupplyRiskSnapshot = {
    products: {},
    boms: {
      100: { odooBomId: 1, parentSkuId: 100, parentBomQty: 1, lines: [{ odooLineId: 1, childSkuId: 10, componentQty: 1 }] }
    },
    demand: [
      { salesOrderId: 1, salesOrderLineId: 1, customerId: null, productId: 100, demandDate: '2026-08-10', demandQuantity: 100, status: 'open' }
    ],
    productionRuns: []
  };

  const prices: SalesOrderPriceLookup[] = [{ salesOrderId: 1, unitPrice: 10, currency: 'USD' }];

  const baselineShortage = 100;
  const mitigationShortage = 20;

  const baselineResult = calculateDownstreamPegging(snapshot, 10, baselineShortage, prices);
  const mitigationResult = calculateDownstreamPegging(snapshot, 10, mitigationShortage, prices);

  assert.strictEqual(baselineResult.verifiedRevenueAtRisk, 1000);
  assert.strictEqual(mitigationResult.verifiedRevenueAtRisk, 200);
  assert.ok((mitigationResult.verifiedRevenueAtRisk as number) < (baselineResult.verifiedRevenueAtRisk as number), 'Mitigation did not reduce revenue risk');
});
