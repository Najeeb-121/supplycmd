import { DependentDemand } from "./core";

export interface BOMNode {
  odooBomId: number;
  parentSkuId: number;
  parentBomQty: number;
  lines: BOMLineNode[];
}

export interface BOMLineNode {
  odooLineId: number;
  childSkuId: number;
  componentQty: number;
}

export interface InventoryStatus {
  [productId: number]: {
    onHand: number;
    leadTimeDays?: number;
  }
}

export function buildBOMGraph(boms: any[], bomLines: any[]): Record<number, BOMNode> {
  const graph: Record<number, BOMNode> = {};

  for (const bom of boms) {
    if (!bom.isActive) continue;
    if (!bom.parentSkuId) continue; // safety

    // Use Odoo IDs if available, else fallback to internal IDs
    const parentId = bom.parentSkuId;

    if (graph[parentId]) {
      throw new Error(`MULTIPLE_ACTIVE_BOMS_FOR_PARENT:${parentId}`);
    }

    graph[parentId] = {
      odooBomId: bom.odooBomId || bom.id,
      parentSkuId: parentId,
      parentBomQty: bom.parentBomQty ?? 1,
      lines: []
    };
  }

  for (const line of bomLines) {
    if (line.isDeleted) continue;
    const bom = boms.find(b => b.id === line.bomId);
    if (!bom || !bom.parentSkuId) continue;

    const parentId = bom.parentSkuId;

    if (graph[parentId]) {
      graph[parentId].lines.push({
        odooLineId: line.odooLineId || line.id,
        childSkuId: line.childSkuId,
        componentQty: line.componentQty ?? 1
      });
    }
  }

  return graph;
}

export function propagateDemand(
  salesOrders: any[],
  bomGraph: Record<number, BOMNode>,
  initialInventory: InventoryStatus,
  productionRuns: any[] = [],
  inventoryOdooIdByLocalId: Map<number, number> = new Map()
): { dependentDemands: DependentDemand[], warnings: string[] } {
  const dependentDemands: DependentDemand[] = [];
  const warnings: string[] = [];

  // Clone inventory to track consumption
  const inventory: InventoryStatus = JSON.parse(JSON.stringify(initialInventory));

  // Sort sales orders chronologically so earlier demands consume inventory first
  const sortedOrders = [...salesOrders].sort((a, b) => {
    return new Date(a.demandDate).getTime() - new Date(b.demandDate).getTime();
  });

  for (const so of sortedOrders) {
    // Only process valid demand
    if (so.remainingQty <= 0) continue;

    explodeDemand(
      so.productId,
      so.remainingQty,
      so.demandDate,
      {
        sourceFinishedProductOdooId:
          inventoryOdooIdByLocalId.get(so.productId) ?? so.productId,
        sourceDemandDate: so.demandDate,
        sourceDemandQuantity: so.remainingQty,
        sourceSalesOrderOdooId:
          so.salesOrderOdooId ?? so.salesOrderId,
        sourceSalesLineOdooId:
          so.salesOrderLineOdooId ?? so.salesOrderLineId
      },
      1,
      new Set<number>(),
      bomGraph,
      inventory,
      dependentDemands,
      warnings,
      productionRuns,
      inventoryOdooIdByLocalId
    );
  }

  return { dependentDemands, warnings };
}

function explodeDemand(
  productId: number,
  requiredQty: number,
  requiredDate: string | null,
  provenance: {
    sourceFinishedProductOdooId: number;
    sourceDemandDate: string;
    sourceDemandQuantity: number;
    sourceSalesOrderOdooId?: number;
    sourceSalesLineOdooId?: number;
  },
  bomLevel: number,
  visitedProducts: Set<number>,
  bomGraph: Record<number, BOMNode>,
  inventory: InventoryStatus,
  results: DependentDemand[],
  warnings: string[],
  productionRuns: any[] = [],
  inventoryOdooIdByLocalId: Map<number, number> = new Map()
) {
  // 1. Consume existing inventory for this product
  let netQty = requiredQty;
  if (inventory[productId] && inventory[productId].onHand > 0) {
    const consumed = Math.min(inventory[productId].onHand, requiredQty);
    inventory[productId].onHand -= consumed;
    netQty -= consumed;
  }

  if (netQty <= 0) return; // Fully satisfied from stock

  // 2. Check for BOM
  const bom = bomGraph[productId];
  if (!bom) {
    // If no BOM exists but we need more, we just stop exploding
    return;
  }

  // 3. Circular dependency check
  if (visitedProducts.has(productId)) {
    warnings.push(`Circular BOM detected for product ` + productId);
    results.push({
      ...provenance,
      componentProductLocalId: productId,
      componentProductOdooId:
        inventoryOdooIdByLocalId.get(productId) ?? productId,
      requiredQuantity: netQty,
      requiredDate,
      bomOdooId: bom.odooBomId,
      bomLevel,
      status: "CIRCULAR_BOM_DETECTED"
    });
    return;
  }

  const newVisited = new Set(visitedProducts);
  newVisited.add(productId);

  // 4. Explode down to components
  const bomMultiplier = netQty / bom.parentBomQty;

  // Step 3: Use only verified Odoo work-order timing.
  const parentMo = productionRuns.find(
    (productionRun) =>
      productionRun.bomId === bom.odooBomId &&
      Number.isInteger(productionRun.odooId) &&
      productionRun.odooId > 0 &&
      typeof productionRun.plannedTimeMin === "number" &&
      Number.isFinite(productionRun.plannedTimeMin) &&
      productionRun.plannedTimeMin > 0 &&
      typeof productionRun.runDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(productionRun.runDate),
  );

  let childRequiredDate: string | null = null;
  let timingStatus:
    | "VERIFIED_MO_TIMING"
    | "INSUFFICIENT_PRODUCTION_TIMING_DATA" =
    "INSUFFICIENT_PRODUCTION_TIMING_DATA";
  let timingSource = "MISSING";

  if (parentMo) {
    childRequiredDate = parentMo.runDate;
    timingStatus = "VERIFIED_MO_TIMING";
    timingSource = "ODOO_WORKORDER";
  }

  for (const line of bom.lines) {
    const componentQtyNeeded = line.componentQty * bomMultiplier;

    // Add demand record for this component
    results.push({
      ...provenance,
      componentProductLocalId: line.childSkuId,
      componentProductOdooId:
        inventoryOdooIdByLocalId.get(line.childSkuId) ?? line.childSkuId,
      requiredQuantity: componentQtyNeeded,
      requiredDate: childRequiredDate,
      bomOdooId: bom.odooBomId,
      bomLevel,
      status: timingStatus,
      productionTiming: {
        source: timingSource,
        status: timingStatus
      }
    });

    // Recursively explode for the component
    explodeDemand(
      line.childSkuId,
      componentQtyNeeded,
      childRequiredDate,
      provenance,
      bomLevel + 1,
      newVisited,
      bomGraph,
      inventory,
      results,
      warnings,
      productionRuns,
      inventoryOdooIdByLocalId
    );
  }
}
