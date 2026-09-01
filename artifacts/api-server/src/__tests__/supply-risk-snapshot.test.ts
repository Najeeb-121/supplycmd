import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupplyRiskSnapshot } from '../simulation/supply-risk-snapshot';

vi.mock('@workspace/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue([]),
  }
}));

import { db } from '@workspace/db';

describe('buildSupplyRiskSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes products without an odooId', async () => {
    const mockItems = [
      { id: 1, companyId: 1, odooId: 100, sku: 'PROD1', name: 'Prod 1', currentStock: 10, safetyStock: 0, leadTimeDays: 7, leadTimeSource: 'SCHEMA_DEFAULT' },
      { id: 2, companyId: 1, odooId: null, sku: 'PROD2', name: 'Prod 2', currentStock: 5, safetyStock: 0, leadTimeDays: 7, leadTimeSource: 'SCHEMA_DEFAULT' }
    ];

    (db as any).where
      .mockReturnValueOnce(mockItems)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const { snapshot } = await buildSupplyRiskSnapshot(1);

    expect(snapshot.products[100]).toBeDefined();
    expect(snapshot.products[100].name).toBe('Prod 1');
    expect(Object.keys(snapshot.products).length).toBe(1);
    expect(snapshot.products[100].leadTimeDays.source).toBe('SCHEMA_DEFAULT');
  });

  it('marks null supplier cost as UNKNOWN via undefined/null mapping', async () => {
    const mockItems = [
      { id: 1, companyId: 1, odooId: 100, sku: 'PROD1', name: 'Prod 1', currentStock: 10, safetyStock: 0, leadTimeDays: 7, leadTimeSource: 'SCHEMA_DEFAULT' }
    ];
    const mockRawSuppliers = [
      { id: 10, companyId: 1, odooId: 200, name: 'Sup 1', leadTimeDays: null }
    ];
    const mockProdSuppliers = [
      { id: 1, companyId: 1, inventoryItemId: 1, supplierId: 10, supplierUnitCost: null, leadTimeDays: null }
    ];

    (db as any).where
      .mockReturnValueOnce(mockItems)
      .mockReturnValueOnce(mockRawSuppliers)
      .mockReturnValueOnce(mockProdSuppliers)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const { snapshot } = await buildSupplyRiskSnapshot(1);

    const supplier = snapshot.products[100].suppliers[0];
    expect(supplier.supplierId).toBe(200);
    expect(supplier.supplierUnitCost).toBeNull();
    expect(supplier.leadTimeDays.value).toBeNull();
    expect(supplier.leadTimeDays.source).toBe("UNKNOWN");
  });

  it('handles demand mapping properly and excludes missing dates', async () => {
    const mockItems = [
      { id: 1, companyId: 1, odooId: 100, sku: 'PROD1', name: 'Prod 1', currentStock: 10, safetyStock: 0, leadTimeDays: 7, leadTimeSource: 'SCHEMA_DEFAULT' }
    ];
    const mockSos = [
      { id: 5, companyId: 1, odooId: 50, customerId: 99, status: 'sale' }
    ];
    const mockSoLines = [
      { id: 6, companyId: 1, orderId: 5, inventoryItemId: 1, odooId: 60, remainingQuantity: 5, expectedDate: '2026-08-20', unitPrice: null, currency: 'USD' },
      { id: 7, companyId: 1, orderId: 5, inventoryItemId: 1, odooId: 61, remainingQuantity: 5, expectedDate: null, unitPrice: 10, currency: 'USD' }
    ];

    (db as any).where
      .mockReturnValueOnce(mockItems)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(mockSos)
      .mockReturnValueOnce(mockSoLines);

    const { snapshot, priceLookup } = await buildSupplyRiskSnapshot(1);

    expect(snapshot.demand.length).toBe(1);
    expect(snapshot.demand[0].demandDate).toBe('2026-08-20');
    expect(snapshot.demand[0].salesOrderId).toBe(50);
    expect(snapshot.demand[0].salesOrderLineId).toBe(60);

    expect(priceLookup.length).toBe(1);
    expect(priceLookup[0].unitPrice).toBe(0); // My implementation currently maps null to 0 for PriceLookup. Wait, the prompt said: "missing supplier cost → UNKNOWN ... missing demand date → excluded". Actually it didn't specify what to do with sales order line unitPrice missing.
  });

  it('excludes cancelled procurement from inbound supply', async () => {
    const mockItems = [
      {
        id: 1,
        companyId: 1,
        odooId: 100,
        sku: 'AL-COIL-5182',
        name: 'Aluminium Coil 5182-H19',
        currentStock: 500,
        safetyStock: 0,
        leadTimeDays: 7,
        leadTimeSource: 'SCHEMA_DEFAULT'
      }
    ];

    const mockRawSuppliers = [
      {
        id: 10,
        companyId: 1,
        odooId: 200,
        name: 'Supplier 1'
      }
    ];

    const mockPos = [
      { id: 20, companyId: 1, odooId: 300, status: 'confirmed' },
      { id: 21, companyId: 1, odooId: 301, status: 'cancelled' },
      { id: 22, companyId: 1, odooId: 302, status: 'confirmed' }
    ];

    const mockPoLines = [
      {
        id: 30,
        companyId: 1,
        orderId: 20,
        inventoryItemId: 1,
        supplierId: 10,
        odooId: 400,
        orderedQuantity: 900,
        receivedQuantity: 0,
        remainingQuantity: 900,
        expectedDate: '2026-09-05',
        status: 'cancelled'
      },
      {
        id: 31,
        companyId: 1,
        orderId: 21,
        inventoryItemId: 1,
        supplierId: 10,
        odooId: 401,
        orderedQuantity: 800,
        receivedQuantity: 0,
        remainingQuantity: 800,
        expectedDate: '2026-09-06',
        status: 'confirmed'
      },
      {
        id: 32,
        companyId: 1,
        orderId: 22,
        inventoryItemId: 1,
        supplierId: 10,
        odooId: 402,
        orderedQuantity: 700,
        receivedQuantity: 0,
        remainingQuantity: 700,
        expectedDate: '2026-09-07',
        status: 'confirmed'
      }
    ];

    (db as any).where
      .mockReturnValueOnce(mockItems)
      .mockReturnValueOnce(mockRawSuppliers)
      .mockReturnValueOnce([])
      .mockReturnValueOnce(mockPos)
      .mockReturnValueOnce(mockPoLines)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const { snapshot } = await buildSupplyRiskSnapshot(1);

    expect(snapshot.products[100].inboundPOs).toHaveLength(1);
    expect(snapshot.products[100].inboundPOs[0].odooId).toBe(402);
    expect(snapshot.products[100].inboundPOs[0].remainingQuantity).toBe(700);
    expect(snapshot.products[100].inboundPOs[0].supplierId).toBe(200);
  });

});
