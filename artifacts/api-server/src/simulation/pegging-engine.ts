import { SupplyRiskSnapshot, DemandRecord } from "./supply-risk-contracts";
import { BOMNode } from "./bom-propagation";
import { DownstreamAllocationImpact, SalesOrderPriceLookup, AffectedSalesOrder } from "./pegging-contracts";

export function calculateDownstreamPegging(
  snapshot: SupplyRiskSnapshot,
  targetProductId: number,
  componentShortageQty: number,
  priceLookup: SalesOrderPriceLookup[]
): DownstreamAllocationImpact {
  
  if (componentShortageQty <= 0) {
    return {
      componentShortageQty: 0,
      starvedFinishedGoods: [],
      affectedSalesOrders: [],
      revenueProvenance: {
        status: "COMPLETE",
        calculatedRevenue: 0,
        unpricedStarvedQuantity: 0
      },
      verifiedRevenueAtRisk: 0
    };
  }

  // 1. Find all finished goods and their component multipliers
  const multipliers = getFinishedGoodMultipliers(snapshot.boms, targetProductId);

  // 2. Gather open Sales Orders for these finished goods
  const relevantSOs: DemandRecord[] = snapshot.demand.filter(
    so => multipliers.has(so.productId) && so.demandQuantity > 0
  );

  // 3. Sort ASC by demandDate, then ASC by salesOrderId
  const sortedSOs = [...relevantSOs].sort((a, b) => {
    const dateA = new Date(a.demandDate).getTime();
    const dateB = new Date(b.demandDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.salesOrderId - b.salesOrderId;
  });

  // 4. Calculate total component demand
  let totalComponentDemand = 0;
  for (const so of sortedSOs) {
    const multiplier = multipliers.get(so.productId)!;
    totalComponentDemand += so.demandQuantity * multiplier;
  }

  // 5. Calculate available component supply
  let availableComponents = Math.max(totalComponentDemand - componentShortageQty, 0);

  // 6. Allocate supply and determine starved quantities
  const affectedSalesOrders: AffectedSalesOrder[] = [];
  const fgStarvationMap = new Map<number, number>();
  
  let calculatedRevenue = 0;
  let unpricedStarvedQuantity = 0;

  for (const so of sortedSOs) {
    const multiplier = multipliers.get(so.productId)!;
    const componentsNeeded = so.demandQuantity * multiplier;

    let fulfilledComponents = 0;
    if (availableComponents >= componentsNeeded) {
      fulfilledComponents = componentsNeeded;
      availableComponents -= componentsNeeded;
    } else if (availableComponents > 0) {
      fulfilledComponents = availableComponents;
      availableComponents = 0;
    }

    const starvedComponents = componentsNeeded - fulfilledComponents;
    const starvedFgQty = starvedComponents / multiplier;

    if (starvedFgQty > 0) {
      const priceRecord = priceLookup.find(p => p.salesOrderId === so.salesOrderId);
      const verifiedUnitPrice = priceRecord ? priceRecord.unitPrice : "UNKNOWN";
      const currency = priceRecord ? priceRecord.currency : "UNKNOWN";
      
      let missedRevenue: number | "UNKNOWN" = "UNKNOWN";
      if (verifiedUnitPrice !== "UNKNOWN") {
        missedRevenue = starvedFgQty * verifiedUnitPrice;
        calculatedRevenue += missedRevenue;
      } else {
        unpricedStarvedQuantity += starvedFgQty;
      }

      affectedSalesOrders.push({
        salesOrderId: so.salesOrderId,
        productId: so.productId,
        demandDate: so.demandDate,
        originalQuantity: so.demandQuantity,
        missedQuantity: starvedFgQty,
        verifiedUnitPrice,
        missedRevenue,
        currency,
        provenance: "SIMULATION_ALLOCATED"
      });

      const currentFgStarvation = fgStarvationMap.get(so.productId) || 0;
      fgStarvationMap.set(so.productId, currentFgStarvation + starvedFgQty);
    }
  }

  const starvedFinishedGoods = Array.from(fgStarvationMap.entries()).map(([productId, starvedQty]) => ({
    productId,
    starvedQty
  }));

  const revenueStatus = unpricedStarvedQuantity > 0 ? "PARTIAL_MISSING_PRICE" : "COMPLETE";
  const verifiedRevenueAtRisk = revenueStatus === "COMPLETE" ? calculatedRevenue : "UNKNOWN";

  return {
    componentShortageQty,
    starvedFinishedGoods,
    affectedSalesOrders,
    revenueProvenance: {
      status: revenueStatus,
      calculatedRevenue,
      unpricedStarvedQuantity
    },
    verifiedRevenueAtRisk
  };
}

// DFS to trace component to top-level finished goods and calculate conversion multipliers
function getFinishedGoodMultipliers(boms: Record<number, BOMNode>, targetProductId: number): Map<number, number> {
  const multipliers = new Map<number, number>();
  
  function traverse(currentId: number, currentMultiplier: number, visited: Set<number>) {
    if (visited.has(currentId)) return;
    
    let isTopLevel = true;
    for (const parentIdStr of Object.keys(boms)) {
      const parentId = parseInt(parentIdStr, 10);
      const bom = boms[parentId];
      for (const line of bom.lines) {
        if (line.childSkuId === currentId) {
          isTopLevel = false;
          // Sub-components per 1 parent = componentQty / parentBomQty
          const componentsPerParent = currentMultiplier * (line.componentQty / bom.parentBomQty);
          traverse(parentId, componentsPerParent, new Set([...visited, currentId]));
        }
      }
    }
    
    if (isTopLevel && currentId !== targetProductId) {
      multipliers.set(currentId, currentMultiplier);
    } else if (isTopLevel && currentId === targetProductId) {
      multipliers.set(currentId, 1);
    }
  }
  
  traverse(targetProductId, 1, new Set());
  return multipliers;
}
