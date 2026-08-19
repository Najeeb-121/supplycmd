import { describe, it, expect } from 'vitest';
import { buildBOMGraph, propagateDemand, InventoryStatus } from '../simulation/bom-propagation';

const fakeBoms = [
  { id: 1, odooBomId: 101, parentSkuId: 10, parentBomQty: 1, isActive: true },
  { id: 2, odooBomId: 102, parentSkuId: 20, parentBomQty: 1, isActive: true },
  { id: 3, odooBomId: 103, parentSkuId: 21, parentBomQty: 1, isActive: true },
  { id: 4, odooBomId: 104, parentSkuId: 40, parentBomQty: 1, isActive: true },
  { id: 5, odooBomId: 105, parentSkuId: 50, parentBomQty: 1, isActive: true }, 
  { id: 6, odooBomId: 106, parentSkuId: 60, parentBomQty: 1, isActive: true }  
];

const fakeBomLines = [
  // BOM 101: 10 -> 2 units of 11
  { id: 1, bomId: 1, odooLineId: 1001, childSkuId: 11, componentQty: 2, isDeleted: false },
  
  // BOM 102 (Two-level): 20 -> 1 unit of 21, then BOM 103: 21 -> 0.01 units of 22
  { id: 2, bomId: 2, odooLineId: 1002, childSkuId: 21, componentQty: 1, isDeleted: false },
  { id: 3, bomId: 3, odooLineId: 1003, childSkuId: 22, componentQty: 0.01, isDeleted: false },
  
  // BOM 104 (Missing BOM for child): 40 -> 1 unit of 41
  { id: 4, bomId: 4, odooLineId: 1004, childSkuId: 41, componentQty: 1, isDeleted: false },
  
  // BOM Circular: 50 -> 60, 60 -> 50
  { id: 5, bomId: 5, odooLineId: 1005, childSkuId: 60, componentQty: 1, isDeleted: false },
  { id: 6, bomId: 6, odooLineId: 1006, childSkuId: 50, componentQty: 1, isDeleted: false }
];

describe('BOM Propagation (Phase 1)', () => {
  const graph = buildBOMGraph(fakeBoms, fakeBomLines);

  it('Test A: Single-level BOM', () => {
    const salesOrders = [
      { salesOrderId: 1, salesOrderLineId: 1, productId: 10, demandDate: '2026-08-11', remainingQty: 100 }
    ];
    
    const { dependentDemands, warnings } = propagateDemand(salesOrders, graph, {});
    
    expect(warnings.length).toBe(0);
    expect(dependentDemands.length).toBe(1);
    expect(dependentDemands[0].componentProductOdooId).toBe(11);
    expect(dependentDemands[0].requiredQuantity).toBe(200);
    expect(dependentDemands[0].status).toBe("INSUFFICIENT_PRODUCTION_TIMING_DATA");
  });

  it('Test B: Two-level BOM', () => {
    const salesOrders = [
      { salesOrderId: 2, salesOrderLineId: 2, productId: 20, demandDate: '2026-08-11', remainingQty: 100 }
    ];
    
    const { dependentDemands, warnings } = propagateDemand(salesOrders, graph, {});
    
    expect(warnings.length).toBe(0);
    expect(dependentDemands.length).toBe(2);
    
    const child1 = dependentDemands.find(d => d.componentProductOdooId === 21);
    expect(child1?.requiredQuantity).toBe(100);
    
    const child2 = dependentDemands.find(d => d.componentProductOdooId === 22);
    expect(child2?.requiredQuantity).toBe(1);
    expect(child2?.bomLevel).toBe(2);
  });

  it('Test C: Time-phased demand', () => {
    const salesOrders = [
      { salesOrderId: 3, salesOrderLineId: 3, productId: 10, demandDate: '2026-08-01', remainingQty: 100 },
      { salesOrderId: 4, salesOrderLineId: 4, productId: 10, demandDate: '2026-08-05', remainingQty: 200 }
    ];
    
    const { dependentDemands, warnings } = propagateDemand(salesOrders, graph, {});
    
    expect(warnings.length).toBe(0);
    expect(dependentDemands.length).toBe(2);
    
    const d1 = dependentDemands.find(d => d.sourceSalesOrderOdooId === 3);
    expect(d1?.requiredQuantity).toBe(200);
    expect(d1?.requiredDate).toBeNull();
    
    const d2 = dependentDemands.find(d => d.sourceSalesOrderOdooId === 4);
    expect(d2?.requiredQuantity).toBe(400);
    expect(d2?.requiredDate).toBeNull();
  });

  it('Test D: Missing BOM', () => {
    const salesOrders = [
      { salesOrderId: 5, salesOrderLineId: 5, productId: 40, demandDate: '2026-08-11', remainingQty: 100 }
    ];
    
    const { dependentDemands, warnings } = propagateDemand(salesOrders, graph, {});
    
    expect(dependentDemands.length).toBe(1);
    expect(dependentDemands[0].componentProductOdooId).toBe(41);
    expect(warnings.length).toBe(0);
  });

  it('Test E: Circular BOM', () => {
    const salesOrders = [
      { salesOrderId: 6, salesOrderLineId: 6, productId: 50, demandDate: '2026-08-11', remainingQty: 100 }
    ];
    
    const { dependentDemands, warnings } = propagateDemand(salesOrders, graph, {});
    
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Circular BOM detected");
    
    const circularRecord = dependentDemands.find(d => d.status === "CIRCULAR_BOM_DETECTED");
    expect(circularRecord).toBeDefined();
    expect(circularRecord?.componentProductOdooId).toBe(50);
  });

  it('Test F: Existing inventory', () => {
    const salesOrders = [
      { salesOrderId: 7, salesOrderLineId: 7, productId: 20, demandDate: '2026-08-11', remainingQty: 100 }
    ];
    
    const inventory: InventoryStatus = {
      21: { onHand: 40 } 
    };
    
    const { dependentDemands, warnings } = propagateDemand(salesOrders, graph, inventory);
    
    const child1 = dependentDemands.find(d => d.componentProductOdooId === 21);
    expect(child1?.requiredQuantity).toBe(100); 
    
    const child2 = dependentDemands.find(d => d.componentProductOdooId === 22);
    expect(child2?.requiredQuantity).toBe(0.6);
  });

  it('Test G: Provenance preservation', () => {
    const salesOrders = [
      { salesOrderId: 123, salesOrderLineId: 456, productId: 20, demandDate: '2026-08-11', remainingQty: 100 }
    ];
    
    const { dependentDemands } = propagateDemand(salesOrders, graph, {});
    
    const child2 = dependentDemands.find(d => d.componentProductOdooId === 22);
    expect(child2).toBeDefined();
    expect(child2?.sourceFinishedProductOdooId).toBe(20);
    expect(child2?.sourceDemandDate).toBe('2026-08-11');
    expect(child2?.sourceDemandQuantity).toBe(100);
    expect(child2?.sourceSalesOrderOdooId).toBe(123);
    expect(child2?.sourceSalesLineOdooId).toBe(456);
    expect(child2?.bomOdooId).toBe(103);
    expect(child2?.bomLevel).toBe(2);
  });
});
