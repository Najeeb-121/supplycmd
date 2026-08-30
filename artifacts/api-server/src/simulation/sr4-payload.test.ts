import { test } from 'vitest';
import assert from 'node:assert';
import { SimulationResult } from '@workspace/db';
import { composeWhatIfWithPegging } from './what-if-composition';
import { createSR4Adapter } from './sr4-adapter';
import { WhatIfResult } from './what-if-contracts';

test('SR-4 API Contract: Backward compatible when no what-if data is present', () => {
  const result: Partial<SimulationResult> = {
    scenarioType: 'SUPPLIER_DELAY',
    simulationStatus: 'VALID'
  };

  assert.strictEqual(result.sr4Impact, undefined);
});

test('SR-4 API Contract: Data appears correctly formatted when What-If result exists', () => {
  const mockComposition = {
    baselinePegging: { componentShortageQty: 100, verifiedProcurementCost: 50, verifiedRevenueAtRisk: 1000 },
    scenarioPegging: { componentShortageQty: 20, verifiedProcurementCost: 80, verifiedRevenueAtRisk: 200, affectedSalesOrders: [] },
    downstreamRevenueDelta: -800
  };

  const mockWhatIf: WhatIfResult = {
    actionApplied: { id: 'mock', type: 'ALTERNATE_SUPPLIER', title: 'A', reason: 'B', feasible: true, affectedQuantity: 100, mitigationCost: 30, mitigationCostProvenance: 'UNKNOWN', mitigationDateProvenance: 'UNKNOWN' },
    scenarioValidity: 'VALID',
    baselineMetrics: { residualShortage: 100, inventoryCoverageDays: 0, procurementCost: 0, revenueAtRisk: 'UNKNOWN' },
    scenarioMetrics: { residualShortage: 20, inventoryCoverageDays: 0, procurementCost: 0, revenueAtRisk: 'UNKNOWN' },
    incrementalMetrics: { shortageDelta: -80, procurementCostDelta: 0, revenueAtRiskDelta: 'UNKNOWN' },
    scenarioAssumptions: ['Test assumption'],
    provenance: { costSource: 'CALCULATED', dateSource: 'CALCULATED', expediteCost: 'SCENARIO_ASSUMPTION', supplierCapacity: 'UNKNOWN' }
  } as any;

  const sr4Summary = createSR4Adapter(mockWhatIf, mockComposition as any);

  const result: Partial<SimulationResult> = {
    scenarioType: 'SUPPLIER_DELAY',
    sr4Impact: {
      baselineShortage: sr4Summary.baselineShortage,
      scenarioShortage: sr4Summary.scenarioShortage,
      shortageDelta: sr4Summary.shortageDelta,
      baselineProcurementCost: sr4Summary.baselineProcurementCost,
      scenarioProcurementCost: sr4Summary.scenarioProcurementCost,
      procurementCostDelta: sr4Summary.procurementCostDelta,
      baselineRevenueAtRisk: sr4Summary.baselineRevenueAtRisk,
      scenarioRevenueAtRisk: sr4Summary.scenarioRevenueAtRisk,
      revenueDelta: sr4Summary.revenueDelta,
      supplierCapacityStatus: sr4Summary.supplierCapacityStatus,
      expediteCostStatus: sr4Summary.expediteCostStatus,
      scenarioAssumptions: sr4Summary.scenarioAssumptions,
      affectedSalesOrders: sr4Summary.affectedSalesOrders,
      provenance: sr4Summary.provenance
    }
  };

  assert.strictEqual(result.sr4Impact?.baselineShortage, 100);
  assert.strictEqual(result.sr4Impact?.scenarioShortage, 20);
  assert.strictEqual(result.sr4Impact?.shortageDelta, -80);
  assert.strictEqual(result.sr4Impact?.supplierCapacityStatus, 'UNKNOWN');
  assert.deepStrictEqual(result.sr4Impact?.scenarioAssumptions, ['Test assumption']);
  assert.strictEqual(result.sr4Impact?.provenance.allocation, 'SIMULATION_ALLOCATED');
});
