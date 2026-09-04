import { describe, it, expect } from 'vitest';
import {
  runDailyLoop,
  extractLoopMetrics,
  calculateIncrementalOperationalMetrics,
  ERPSnapshot
} from '../simulation/core';
import { buildScenarioModifiers, calculateFinancials } from '../simulation/scenarios';

const baseSnapshot: ERPSnapshot = {
  productId: 1,
  openingStock: 100,
  dailyDemandRate: 10,
  safetyStock: 0,
  inboundPOs: [{ id: 1, expectedDate: '2026-08-15T12:00:00.000Z', qty: 50, supplierId: 99, status: 'purchase' }],
  scheduledMOs: [],
  salesOrders: []
};

const fakeGraphProduct = {
  id: 1,
  name: { value: 'Product', status: 'VERIFIED', source: 'ERP', confidence: 'HIGH' },
  unitSellingPrice: { value: 100, status: 'VERIFIED', source: 'ERP', confidence: 'HIGH' },
  unitCost: { value: 60, status: 'VERIFIED', source: 'ERP', confidence: 'HIGH' },
  safetyStockQty: { value: 0, status: 'VERIFIED', source: 'ERP', confidence: 'HIGH' },
  reorderPoint: { value: 0, status: 'VERIFIED', source: 'ERP', confidence: 'HIGH' }
};

describe('Incremental Impact Simulation', () => {
  it('Test A: No baseline shortage + supplier delay causes shortage', () => {
    const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    const startDate = new Date('2026-08-06T12:00:00.000Z');
    // Horizon 14 days (Day 0 to 14 = 15 days). Total demand = 150.
    // PO arrives Day 9. 
    const baselineTrace = runDailyLoop(snapshot, 14, {}, startDate);
    const baselineMetrics = extractLoopMetrics(baselineTrace, snapshot);
    expect(baselineMetrics.totalUnmetDemand).toBe(0);

    const modifiers = { poDateShifts: { 1: 5 } }; // PO arrives Day 14
    const scenarioTrace = runDailyLoop(snapshot, 14, modifiers, startDate);
    const scenarioMetrics = extractLoopMetrics(scenarioTrace, snapshot);
    // Short on Days 10, 11, 12, 13 = 4 days * 10 = 40
    expect(scenarioMetrics.totalUnmetDemand).toBe(40);
  });

  it('Test B: Existing baseline shortage + delay makes it worse', () => {
    const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    snapshot.openingStock = 50;
    const startDate = new Date('2026-08-06T12:00:00.000Z');
    // Horizon 14 days (15 total). Total demand = 150.
    // Opening 50 + PO 50 = 100. Baseline shortage = 50 (Days 5-8 short, PO on Day 9, then runs out again Day 14).
    const baselineTrace = runDailyLoop(snapshot, 14, {}, startDate);
    const baselineMetrics = extractLoopMetrics(baselineTrace, snapshot);
    expect(baselineMetrics.totalUnmetDemand).toBe(50); // 150 - 100 = 50

    const modifiers = { poDateShifts: { 1: 5 } }; // PO on Day 14
    const scenarioTrace = runDailyLoop(snapshot, 14, modifiers, startDate);
    const scenarioMetrics = extractLoopMetrics(scenarioTrace, snapshot);
    // Short Days 5-13 (9 days * 10 = 90). Day 14 gets 50, consumes 10, so no short on Day 14.
    expect(scenarioMetrics.totalUnmetDemand).toBe(90);

    const incrementalUnmetDemand = Math.max(0, scenarioMetrics.totalUnmetDemand - baselineMetrics.totalUnmetDemand);
    expect(incrementalUnmetDemand).toBe(40); // 90 - 50 = 40
  });

  it('Test C: Existing baseline shortage + delay has no additional effect', () => {
    const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    snapshot.openingStock = 50;
    const startDate = new Date('2026-08-06T12:00:00.000Z');
    const baselineTrace = runDailyLoop(snapshot, 7, {}, startDate);
    const baselineMetrics = extractLoopMetrics(baselineTrace, snapshot);
    expect(baselineMetrics.totalUnmetDemand).toBe(30);

    const modifiers = { poDateShifts: { 1: 10 } };
    const scenarioTrace = runDailyLoop(snapshot, 7, modifiers, startDate);
    const scenarioMetrics = extractLoopMetrics(scenarioTrace, snapshot);
    expect(scenarioMetrics.totalUnmetDemand).toBe(30);
  });

  it('Test D: No demand', () => {
    const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    snapshot.dailyDemandRate = 0;
    const startDate = new Date('2026-08-06T12:00:00.000Z');
    const baselineTrace = runDailyLoop(snapshot, 20, {}, startDate);
    const baselineMetrics = extractLoopMetrics(baselineTrace, snapshot);
    expect(baselineMetrics.coverageDays).toBe('NOT_APPLICABLE');
  });

  it('Test E: Missing unit cost', () => {
    const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    const productInfo = JSON.parse(JSON.stringify(fakeGraphProduct));
    productInfo.unitCost = { value: null, status: 'MISSING', source: 'ERP', confidence: 'LOW' };
    const financials = calculateFinancials(100, snapshot, productInfo, {});
    expect(financials.grossMarginAtRisk.status).toBe('MISSING');
    expect(financials.grossMarginAtRisk.value).toBeNull();
  });

  it('Test F: Beneficial demand reduction preserves negative operational deltas', () => {
    const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
    snapshot.openingStock = 50;
    snapshot.inboundPOs = [];

    const startDate = new Date('2026-08-06T12:00:00.000Z');

    const baselineTrace = runDailyLoop(snapshot, 9, {}, startDate);
    const baselineMetrics = extractLoopMetrics(baselineTrace, snapshot);

    const scenarioTrace = runDailyLoop(
      snapshot,
      9,
      { demandMultiplier: 0.5 },
      startDate
    );
    const scenarioMetrics = extractLoopMetrics(scenarioTrace, snapshot);

    const incremental = calculateIncrementalOperationalMetrics(
      baselineMetrics,
      scenarioMetrics
    );

    expect(baselineMetrics.totalUnmetDemand).toBe(50);
    expect(scenarioMetrics.totalUnmetDemand).toBe(0);

    expect(incremental.incrementalUnmetDemand).toBe(-50);
    expect(incremental.incrementalShortage).toBe(-10);
    expect(incremental.incrementalStockoutDuration).toBe(-5);
  });

});
