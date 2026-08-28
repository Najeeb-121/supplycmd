import { SupplyRiskSnapshot, RiskMitigation } from "./supply-risk-contracts";
import { PortfolioCompositionResult, PortfolioActionTrace, AffectedSalesOrderPortfolio } from "./portfolio-contracts";
import { calculateDownstreamPegging } from "./pegging-engine";
import { SalesOrderPriceLookup } from "./pegging-contracts";

function getPriority(type: string): number {
  switch (type) {
    case "COVER_FROM_AVAILABLE_STOCK": return 1;
    case "FOLLOW_UP_INBOUND": return 2;
    case "ALTERNATE_SUPPLIER": return 3;
    default: return 99;
  }
}

export function simulatePortfolio(
  baselineSnapshot: SupplyRiskSnapshot,
  mitigations: RiskMitigation[],
  priceLookup: SalesOrderPriceLookup[]
): PortfolioCompositionResult {
  // 1. Deep clone baseline
  const scenarioSnapshot: SupplyRiskSnapshot = JSON.parse(JSON.stringify(baselineSnapshot));

  // 2. Canonical Sort
  const sortedMitigations = [...mitigations].sort((a, b) => {
    const pA = getPriority(a.type);
    const pB = getPriority(b.type);
    if (pA !== pB) return pA - pB;

    if (a.type === "ALTERNATE_SUPPLIER" && b.type === "ALTERNATE_SUPPLIER") {
      const productA = baselineSnapshot.products[a.targetProductId!];
      const supA = productA?.suppliers.find(s => s.supplierId === a.targetSupplierId);
      const costA =
        supA?.supplierUnitCost ?? Number.MAX_SAFE_INTEGER;

      const productB = baselineSnapshot.products[b.targetProductId!];
      const supB = productB?.suppliers.find(s => s.supplierId === b.targetSupplierId);
      const costB =
        supB?.supplierUnitCost ?? Number.MAX_SAFE_INTEGER;

      if (costA !== costB) return costA - costB;
    }

    return a.id.localeCompare(b.id);
  });

  const actionExecutionTraces: PortfolioActionTrace[] = [];
  let totalProcurementCostDelta: number | "UNKNOWN" = 0;
  let isCostUnknown = false;

  // Track shortages per component
  const dynamicShortages = new Map<number, number>();

  for (const productIdStr of Object.keys(scenarioSnapshot.products)) {
    const productId = Number(productIdStr);
    const p = scenarioSnapshot.products[productId];
    dynamicShortages.set(productId, p.reservationShortage);
  }

  // 3. Sequentially apply
  for (let i = 0; i < sortedMitigations.length; i++) {
    const action = sortedMitigations[i];
    const targetProductId = action.targetProductId;
    if (!targetProductId) continue;

    const product = scenarioSnapshot.products[targetProductId];
    if (!product) continue;

    let currentShortage = dynamicShortages.get(targetProductId) || 0;

    if (currentShortage <= 0) {
      actionExecutionTraces.push({
        mitigationId: action.id,
        type: action.type,
        executedQuantity: 0,
        executedCost: 0,
        wasSkipped: true
      });
      continue;
    }

    let executedQty = 0;
    let executedCost: number | "UNKNOWN" = 0;

    if (action.type === "COVER_FROM_AVAILABLE_STOCK") {
      executedQty = Math.min(currentShortage, product.availableStock);
      if (executedQty > 0) {
        product.availableStock -= executedQty;
        currentShortage -= executedQty;
        executedCost = 0;
      }
    } else if (action.type === "FOLLOW_UP_INBOUND") {
      // Find earliest PO and shift date
      const earliestPo = product.inboundPOs
        .filter(
          (po) =>
            po.currentlyInbound &&
            po.expectedArrivalDate != null,
        )
        .sort(
          (a, b) =>
            a.expectedArrivalDate!.localeCompare(
              b.expectedArrivalDate!,
            ) ||
            a.poId - b.poId,
        )[0];
      if (earliestPo && action.mitigationDate) {
        earliestPo.expectedArrivalDate = action.mitigationDate;
      }
      // mathematical shortage quantity does not change for FOLLOW_UP_INBOUND
      executedQty = Math.min(currentShortage, action.affectedQuantity);
      executedCost = action.mitigationCostProvenance === "UNKNOWN" ? "UNKNOWN" : (action.mitigationCost || 0);
    } else if (action.type === "ALTERNATE_SUPPLIER") {
      executedQty = Math.min(currentShortage, action.affectedQuantity);
      if (executedQty > 0) {
        currentShortage -= executedQty;
        const sup = product.suppliers.find(s => s.supplierId === action.targetSupplierId);

        const arrivalDate =
          action.mitigationDate != null &&
            action.mitigationDateProvenance !== "UNKNOWN"
            ? action.mitigationDate
            : null;

        const syntheticPoId = 9000000 + targetProductId + i;

        product.inboundPOs.push({
          poId: syntheticPoId,
          odooId: null,
          supplierId: action.targetSupplierId!,
          productId: targetProductId,
          orderedQuantity: executedQty,
          receivedQuantity: 0,
          remainingQuantity: executedQty,
          expectedArrivalDate: arrivalDate,
          status: "confirmed",
          confirmedForSupply: true,
          currentlyInbound: true
        });

        if (
          action.mitigationCostProvenance === "UNKNOWN" ||
          !sup ||
          sup.supplierUnitCost == null
        ) {
          executedCost = "UNKNOWN";
        } else {
          executedCost = executedQty * sup.supplierUnitCost;
        }
      }
    }

    dynamicShortages.set(targetProductId, currentShortage);

    if (executedQty > 0) {
      if (executedCost === "UNKNOWN") {
        isCostUnknown = true;
        totalProcurementCostDelta = "UNKNOWN";
      } else if (!isCostUnknown) {
        (totalProcurementCostDelta as number) += executedCost;
      }
    }

    actionExecutionTraces.push({
      mitigationId: action.id,
      type: action.type,
      executedQuantity: executedQty,
      executedCost: executedCost,
      wasSkipped: executedQty <= 0
    });
  }

  // 4. Determine final shortage per unique component and invoke pegging
  const baselineRevenueCache = new Map<number, number>();
  const scenarioSalesOrdersMap = new Map<number, {
    missedQuantity: number,
    verifiedUnitPrice: number | "UNKNOWN"
  }>();

  let baselineRevenueTotal = 0;
  let isBaselineRevenueUnknown = false;

  const uniqueProducts = Array.from(new Set(sortedMitigations.map(m => m.targetProductId).filter(p => p !== undefined))) as number[];

  for (const productId of uniqueProducts) {
    const productBaselineShortage = baselineSnapshot.products[productId]?.reservationShortage || 0;
    const baselinePegging = calculateDownstreamPegging(baselineSnapshot, productId, productBaselineShortage, priceLookup);

    for (const so of baselinePegging.affectedSalesOrders) {
      const existing = baselineRevenueCache.get(so.salesOrderId);
      if (existing === undefined) {
        baselineRevenueCache.set(so.salesOrderId, so.missedQuantity);
        if (so.verifiedUnitPrice === "UNKNOWN") {
          isBaselineRevenueUnknown = true;
        } else {
          baselineRevenueTotal += so.missedQuantity * (so.verifiedUnitPrice as number);
        }
      } else {
        if (so.missedQuantity > existing) {
          if (so.verifiedUnitPrice !== "UNKNOWN") {
            baselineRevenueTotal += (so.missedQuantity - existing) * (so.verifiedUnitPrice as number);
          }
          baselineRevenueCache.set(so.salesOrderId, so.missedQuantity);
        }
      }
    }

    const productScenarioShortage = dynamicShortages.get(productId) || 0;
    const scenarioPegging = calculateDownstreamPegging(scenarioSnapshot, productId, productScenarioShortage, priceLookup);

    for (const so of scenarioPegging.affectedSalesOrders) {
      const existing = scenarioSalesOrdersMap.get(so.salesOrderId);
      if (existing === undefined) {
        scenarioSalesOrdersMap.set(so.salesOrderId, {
          missedQuantity: so.missedQuantity,
          verifiedUnitPrice: so.verifiedUnitPrice
        });
      } else {
        if (so.missedQuantity > existing.missedQuantity) {
          existing.missedQuantity = so.missedQuantity;
        }
      }
    }
  }

  let scenarioRevenueTotal = 0;
  let isScenarioRevenueUnknown = false;

  const finalAffectedSOs: AffectedSalesOrderPortfolio[] = [];
  Array.from(scenarioSalesOrdersMap.entries()).forEach(([soId, data]) => {
    finalAffectedSOs.push({
      salesOrderId: soId,
      missedQuantity: data.missedQuantity,
      provenance: "SIMULATION_ALLOCATED" as const
    });
    if (data.verifiedUnitPrice === "UNKNOWN") {
      isScenarioRevenueUnknown = true;
    } else {
      scenarioRevenueTotal += data.missedQuantity * (data.verifiedUnitPrice as number);
    }
  });

  let deduplicatedRevenueDelta: number | "UNKNOWN" = "UNKNOWN";
  if (!isBaselineRevenueUnknown && !isScenarioRevenueUnknown) {
    deduplicatedRevenueDelta = scenarioRevenueTotal - baselineRevenueTotal;
  }

  let netROI: number | "UNKNOWN" = "UNKNOWN";
  if (deduplicatedRevenueDelta !== "UNKNOWN" && totalProcurementCostDelta !== "UNKNOWN") {
    netROI = -deduplicatedRevenueDelta - (totalProcurementCostDelta as number);
  }

  return {
    totalProcurementCostDelta,
    deduplicatedRevenueDelta,
    netROI,
    actionExecutionTraces,
    affectedSalesOrders: finalAffectedSOs,
    provenance: {
      revenue: (isBaselineRevenueUnknown || isScenarioRevenueUnknown) ? "UNKNOWN" : "CALCULATED",
      cost: isCostUnknown ? "UNKNOWN" : "CALCULATED",
      roi: netROI === "UNKNOWN" ? "UNKNOWN" : "CALCULATED"
    }
  };
}
