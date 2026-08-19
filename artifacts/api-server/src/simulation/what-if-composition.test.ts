import assert from 'node:assert';
import test from 'node:test';
import { composeWhatIfWithPegging } from './what-if-composition';
import { SupplyRiskSnapshot, RiskExposure } from './supply-risk-contracts';
import { WhatIfResult } from './what-if-contracts';
import { SalesOrderPriceLookup } from './pegging-contracts';

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

const exposure: RiskExposure = {
  scenarioType: 'test',
  targetProductId: 10,
  affectedQuantity: 100,
  inventoryCoverage: 0,
  residualShortage: 100,
  canAbsorbWithBuffer: false,
  alternateSupplierAvailable: true,
  downstreamImpacts: { dependentProducts: [], delayedMOs: [], affectedSalesOrders: [] },
  exposureReason: 'test',
  inventoryCoveragePercent: 0,
  singleSupplierDependency: false,
  leadTimeVerified: true,
  capacityRisk: 'UNKNOWN',
  currentlyInboundQuantity: 0,
  totalSupplierCount: 2,
  severity: 'MEDIUM'
};

const priceLookup: SalesOrderPriceLookup[] = [
  { salesOrderId: 1, unitPrice: 10, currency: 'USD' }
];

function createMockWhatIf(baselineShortage: number, scenarioShortage: number): WhatIfResult {
  return {
    actionApplied: { 
      id: 'mock_action_1',
      type: 'ALTERNATE_SUPPLIER', 
      title: 'Mock Action',
      reason: 'Mock reason',
      feasible: true,
      affectedQuantity: 100,
      mitigationCost: 0, 
      mitigationCostProvenance: 'UNKNOWN',
      mitigationDateProvenance: 'UNKNOWN'
    },
    scenarioValidity: 'VALID',
    baselineMetrics: { residualShortage: baselineShortage, inventoryCoverageDays: 0, procurementCost: 0, revenueAtRisk: 'UNKNOWN' },
    scenarioMetrics: { residualShortage: scenarioShortage, inventoryCoverageDays: 0, procurementCost: 0, revenueAtRisk: 'UNKNOWN' },
    incrementalMetrics: { shortageDelta: scenarioShortage - baselineShortage, procurementCostDelta: 0, revenueAtRiskDelta: 'UNKNOWN' },
    scenarioAssumptions: [],
    provenance: { costSource: 'UNKNOWN', dateSource: 'SCENARIO_ASSUMPTION', expediteCost: 'UNKNOWN', supplierCapacity: 'UNKNOWN' }
  };
}

test('Baseline pegging uses baseline shortage and scenario pegging uses scenario shortage', () => {
  const whatIf = createMockWhatIf(100, 50);
  const result = composeWhatIfWithPegging(snapshot, exposure, whatIf, priceLookup);
  
  assert.strictEqual(result.baselinePegging.componentShortageQty, 100);
  assert.strictEqual(result.scenarioPegging.componentShortageQty, 50);
});

test('Alternate supplier reducing shortage reduces downstream simulated revenue impact', () => {
  const whatIf = createMockWhatIf(100, 50);
  const result = composeWhatIfWithPegging(snapshot, exposure, whatIf, priceLookup);
  
  // Baseline: shortage 100 -> missed revenue 1000
  assert.strictEqual(result.baselinePegging.verifiedRevenueAtRisk, 1000);
  // Scenario: shortage 50 -> missed revenue 500
  assert.strictEqual(result.scenarioPegging.verifiedRevenueAtRisk, 500);
  // Delta: 500 - 1000 = -500
  assert.strictEqual(result.downstreamRevenueDelta, -500);
});

test('No shortage produces zero downstream impact', () => {
  const whatIf = createMockWhatIf(0, 0);
  const result = composeWhatIfWithPegging(snapshot, exposure, whatIf, priceLookup);
  
  assert.strictEqual(result.baselinePegging.componentShortageQty, 0);
  assert.strictEqual(result.baselinePegging.verifiedRevenueAtRisk, 0);
  assert.strictEqual(result.scenarioPegging.componentShortageQty, 0);
  assert.strictEqual(result.scenarioPegging.verifiedRevenueAtRisk, 0);
  assert.strictEqual(result.downstreamRevenueDelta, 0);
});

test('Missing price propagates UNKNOWN', () => {
  const whatIf = createMockWhatIf(100, 50);
  const result = composeWhatIfWithPegging(snapshot, exposure, whatIf, []); // empty prices
  
  assert.strictEqual(result.baselinePegging.verifiedRevenueAtRisk, 'UNKNOWN');
  assert.strictEqual(result.scenarioPegging.verifiedRevenueAtRisk, 'UNKNOWN');
  assert.strictEqual(result.downstreamRevenueDelta, 'UNKNOWN');
});

test('Missing targetProductId throws an error', () => {
  const badExposure = { ...exposure, targetProductId: undefined };
  const whatIf = createMockWhatIf(100, 50);
  
  assert.throws(() => {
    composeWhatIfWithPegging(snapshot, badExposure, whatIf, priceLookup);
  }, /targetProductId is required/);
});
