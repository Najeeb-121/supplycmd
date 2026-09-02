import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDeterministicDecision } from '../simulation/sr6-decision-bridge';
import * as snapshotBuilder from '../simulation/supply-risk-snapshot';
import { SupplyRiskSnapshot } from '../simulation/supply-risk-contracts';

vi.mock('../simulation/supply-risk-snapshot', () => ({
  buildSupplyRiskSnapshot: vi.fn()
}));

describe('SR-6 Decision Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates deterministic mitigation candidates and exact financial metrics (Steps A, B, C)', async () => {
    const mockSnapshot: SupplyRiskSnapshot = {
      products: {
        100: {
          productId: 100,
          odooId: 100,
          sku: 'SKU-1',
          name: 'Test Product 1',
          physicalStock: 10,
          reservedStock: 50,
          availableStock: 0,
          reservationShortage: 40,
          incomingQuantity: 0,
          safetyStock: { value: 0, source: 'SCHEMA_DEFAULT' },
          leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
          suppliers: [
            {
              supplierId: 200,
              supplierName: 'Test Sup',
              preferredSupplier: true,
              leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
              minimumOrderQuantity: 10,
              supplierUnitCost: 100,
              sequence: 1
            }
          ],
          inboundPOs: []
        }
      },
      demand: [
        {
          salesOrderId: 300,
          salesOrderLineId: 400,
          customerId: null,
          productId: 100,
          demandDate: '2026-08-20',
          demandQuantity: 50,
          status: 'sale'
        }
      ],
      boms: {},
      productionRuns: []
    };

    vi.spyOn(snapshotBuilder, 'buildSupplyRiskSnapshot').mockResolvedValue({ snapshot: mockSnapshot, priceLookup: [] } as any);

    const result = await generateDeterministicDecision(1);

    // A. Real supplier-risk produces deterministic mitigation candidates
    expect(result.baselineRiskDetected).toBe(true);
    expect(result.baselineExposures.length).toBe(1);

    // B. Candidates are passed into the frozen SR-5 engine
    expect(result.portfolioResult).not.toBeNull();

    // C. The resulting financial metrics are exactly those returned by SR-5
    // 40 units * $100 = $4000 procurement cost delta. Revenue delta UNKNOWN because priceLookup is empty. ROI = UNKNOWN.
    expect(result.portfolioResult?.totalProcurementCostDelta).toBe(4000);
    expect(result.portfolioResult?.deduplicatedRevenueDelta).toBe("UNKNOWN");
    expect(result.portfolioResult?.netROI).toBe("UNKNOWN");

    // F. No fallback dollar values are generated
    // G. No synthetic dates are generated

    // Let's find the ALT_SUPPLIER mitigation (which is deterministic)
    const altSupplierAction = result.candidateMitigations.find(m => m.type === "ALTERNATE_SUPPLIER");
    expect(altSupplierAction).toBeDefined();
    if (altSupplierAction) {
      expect(altSupplierAction.mitigationCost).toBe(4000);
      expect(altSupplierAction.mitigationDate).toBeUndefined(); // Deterministic preservation of UNKNOWN
      expect(altSupplierAction.mitigationDateProvenance).toBe("UNKNOWN");
    }
  });

  it('preserves UNKNOWN for missing supplier costs (Step D)', async () => {
    const mockSnapshot: SupplyRiskSnapshot = {
      products: {
        100: {
          productId: 100,
          odooId: 100,
          sku: 'SKU-1',
          name: 'Test Product 1',
          physicalStock: 0,
          reservedStock: 10,
          availableStock: 0,
          reservationShortage: 10,
          incomingQuantity: 0,
          safetyStock: { value: 0, source: 'SCHEMA_DEFAULT' },
          leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
          suppliers: [
            {
              supplierId: 200,
              supplierName: 'Test Sup',
              preferredSupplier: true,
              leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
              minimumOrderQuantity: 10,
              supplierUnitCost: undefined as any, // Missing
              sequence: 1
            }
          ],
          inboundPOs: []
        }
      },
      demand: [],
      boms: {},
      productionRuns: []
    };

    vi.spyOn(snapshotBuilder, 'buildSupplyRiskSnapshot').mockResolvedValue({ snapshot: mockSnapshot, priceLookup: [] } as any);

    const result = await generateDeterministicDecision(1);

    const altSupplierAction = result.candidateMitigations.find(m => m.type === "ALTERNATE_SUPPLIER");
    expect(altSupplierAction).toBeDefined();
    if (altSupplierAction) {
      expect(altSupplierAction.mitigationCostProvenance).toBe("UNKNOWN");
    }
    expect(result.portfolioResult?.totalProcurementCostDelta).toBe("UNKNOWN");
    expect(result.portfolioResult?.netROI).toBe("UNKNOWN");
  });

  it('regression test proving that identical inputs produce identical mitigation dates/results across repeated executions', async () => {
    const mockSnapshot: SupplyRiskSnapshot = {
      products: {
        100: {
          productId: 100,
          odooId: 100,
          sku: 'SKU-1',
          name: 'Test Product 1',
          physicalStock: 0,
          reservedStock: 10,
          availableStock: 0,
          reservationShortage: 10,
          incomingQuantity: 0,
          safetyStock: { value: 0, source: 'SCHEMA_DEFAULT' },
          leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
          suppliers: [
            {
              supplierId: 200,
              supplierName: 'Test Sup',
              preferredSupplier: true,
              leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
              minimumOrderQuantity: 10,
              supplierUnitCost: 50,
              sequence: 1
            }
          ],
          inboundPOs: []
        }
      },
      demand: [],
      boms: {},
      productionRuns: []
    };

    vi.spyOn(snapshotBuilder, 'buildSupplyRiskSnapshot').mockResolvedValue({ snapshot: mockSnapshot, priceLookup: [] } as any);

    const result1 = await generateDeterministicDecision(1);
    const result2 = await generateDeterministicDecision(1);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));

    // Specifically test that the UNKNOWN date deterministic behavior is stable
    const alt1 = result1.candidateMitigations.find(m => m.type === "ALTERNATE_SUPPLIER");
    const alt2 = result2.candidateMitigations.find(m => m.type === "ALTERNATE_SUPPLIER");
    expect(alt1?.mitigationDateProvenance).toBe("UNKNOWN");
    expect(alt1?.mitigationDate).toBeUndefined();
    expect(alt2?.mitigationDateProvenance).toBe("UNKNOWN");
    expect(alt2?.mitigationDate).toBeUndefined();

    expect(mockSnapshot.products[100].reservationShortage).toBe(10); // J. Not modified
  });

  it('keeps confirmed-inbound supplier failure as contingency only', async () => {
    const mockSnapshot: SupplyRiskSnapshot = {
      products: {
        100: {
          productId: 100,
          odooId: 100,
          sku: 'SKU-1',
          name: 'Test Product 1',
          physicalStock: 0,
          reservedStock: 0,
          availableStock: 0,
          reservationShortage: 0,
          incomingQuantity: 700,
          safetyStock: { value: 0, source: 'SCHEMA_DEFAULT' },
          leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
          suppliers: [
            {
              supplierId: 200,
              supplierName: 'Primary Supplier',
              preferredSupplier: true,
              leadTimeDays: { value: 5, source: 'ODOO_SUPPLIERINFO' },
              minimumOrderQuantity: 500,
              supplierUnitCost: 2.35,
              sequence: 1
            },
            {
              supplierId: 201,
              supplierName: 'Alternate Supplier',
              preferredSupplier: false,
              leadTimeDays: { value: 2, source: 'ODOO_SUPPLIERINFO' },
              minimumOrderQuantity: 300,
              supplierUnitCost: 2.62,
              sequence: 2
            }
          ],
          inboundPOs: [
            {
              poId: 1,
              odooId: 401,
              supplierId: 200,
              productId: 100,
              orderedQuantity: 700,
              receivedQuantity: 0,
              remainingQuantity: 700,
              expectedArrivalDate: '2026-09-07',
              status: 'purchase',
              confirmedForSupply: true,
              currentlyInbound: true
            }
          ]
        }
      },
      demand: [],
      boms: {},
      productionRuns: []
    };

    vi.spyOn(snapshotBuilder, 'buildSupplyRiskSnapshot')
      .mockResolvedValue({ snapshot: mockSnapshot, priceLookup: [] } as any);

    const result = await generateDeterministicDecision(1);

    expect(result.baselineExposures).toHaveLength(0);
    expect(result.candidateMitigations).toHaveLength(0);
    expect(result.portfolioResult).toBeNull();

    expect(result.contingencyExposures).toHaveLength(1);
    expect(result.contingencyExposures[0].scenarioType).toBe('SINGLE_SOURCE_FAILURE');
    expect(result.contingencyExposures[0].targetSupplierId).toBe(200);
    expect(result.contingencyExposures[0].affectedQuantity).toBe(700);

    const alternate = result.contingencyMitigations.find(
      (mitigation) => mitigation.type === 'ALTERNATE_SUPPLIER'
    );

    expect(alternate).toBeDefined();
    expect(alternate?.targetSupplierId).toBe(201);
  });

  it('does not create supplier-failure contingency for non-current inbound', async () => {
    const mockSnapshot: SupplyRiskSnapshot = {
      products: {
        100: {
          productId: 100,
          odooId: 100,
          sku: 'SKU-1',
          name: 'Test Product 1',
          physicalStock: 0,
          reservedStock: 0,
          availableStock: 0,
          reservationShortage: 0,
          incomingQuantity: 700,
          safetyStock: { value: 0, source: 'SCHEMA_DEFAULT' },
          leadTimeDays: { value: 5, source: 'SCHEMA_DEFAULT' },
          suppliers: [
            {
              supplierId: 200,
              supplierName: 'Primary Supplier',
              preferredSupplier: true,
              leadTimeDays: { value: 5, source: 'ODOO_SUPPLIERINFO' },
              minimumOrderQuantity: 500,
              supplierUnitCost: 2.35,
              sequence: 1
            }
          ],
          inboundPOs: [
            {
              poId: 1,
              odooId: 401,
              supplierId: 200,
              productId: 100,
              orderedQuantity: 700,
              receivedQuantity: 0,
              remainingQuantity: 700,
              expectedArrivalDate: '2026-09-07',
              status: 'pending',
              confirmedForSupply: false,
              currentlyInbound: false
            }
          ]
        }
      },
      demand: [],
      boms: {},
      productionRuns: []
    };

    vi.spyOn(snapshotBuilder, 'buildSupplyRiskSnapshot')
      .mockResolvedValue({ snapshot: mockSnapshot, priceLookup: [] } as any);

    const result = await generateDeterministicDecision(1);

    expect(result.baselineExposures).toHaveLength(0);
    expect(result.contingencyExposures).toHaveLength(0);
    expect(result.contingencyMitigations).toHaveLength(0);
    expect(result.candidateMitigations).toHaveLength(0);
    expect(result.portfolioResult).toBeNull();
  });

});
