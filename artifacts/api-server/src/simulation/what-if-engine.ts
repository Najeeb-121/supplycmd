import { SupplyRiskSnapshot, RiskExposure, RiskMitigation } from "./supply-risk-contracts";
import { WhatIfResult } from "./what-if-contracts";

export function simulateMitigationAction(
  snapshot: SupplyRiskSnapshot,
  exposure: RiskExposure,
  mitigation: RiskMitigation
): WhatIfResult {
  const targetProductId = exposure.targetProductId;

  const baseResult: WhatIfResult = {
    actionApplied: mitigation,
    scenarioValidity: "VALID",
    baselineMetrics: {
      residualShortage: exposure.residualShortage,
      inventoryCoverageDays: exposure.inventoryCoverage,
      procurementCost: 0,
      revenueAtRisk: "UNKNOWN"
    },
    scenarioMetrics: {
      residualShortage: exposure.residualShortage,
      inventoryCoverageDays: exposure.inventoryCoverage,
      procurementCost: 0,
      revenueAtRisk: "UNKNOWN"
    },
    incrementalMetrics: {
      shortageDelta: 0,
      procurementCostDelta: 0,
      revenueAtRiskDelta: "UNKNOWN"
    },
    scenarioAssumptions: [],
    provenance: {
      costSource: "UNKNOWN",
      dateSource: "UNKNOWN",
      expediteCost: "UNKNOWN",
      supplierCapacity: "UNKNOWN"
    }
  };

  if (!targetProductId) {
    baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
    return baseResult;
  }

  const product = snapshot.products[targetProductId];
  if (!product) {
    baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
    return baseResult;
  }

  // Deep clone to isolate scenario
  const scenarioSnapshot: SupplyRiskSnapshot = JSON.parse(JSON.stringify(snapshot));
  const scenarioProduct = scenarioSnapshot.products[targetProductId];

  // Calculate baseline procurement cost (cost of existing inbound POs attempting to cover)
  let baselineProcurementCost = 0;
  for (const po of product.inboundPOs) {
    if (po.currentlyInbound && po.supplierId && po.remainingQuantity > 0) {
      const sup = product.suppliers.find(s => s.supplierId === po.supplierId);
      if (sup && sup.supplierUnitCost) {
        baselineProcurementCost += po.remainingQuantity * sup.supplierUnitCost;
      }
    }
  }
  baseResult.baselineMetrics.procurementCost = baselineProcurementCost;
  baseResult.scenarioMetrics.procurementCost = baselineProcurementCost;

  let scenarioProcurementCost = baselineProcurementCost;
  let scenarioShortage = exposure.residualShortage;

  if (mitigation.type === "ALTERNATE_SUPPLIER") {
    const targetSupplierId = mitigation.targetSupplierId;
    if (!targetSupplierId) {
      baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
      return baseResult;
    }

    const alternateSupplier = product.suppliers.find(s => s.supplierId === targetSupplierId);
    if (!alternateSupplier) {
      baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
      return baseResult;
    }

    const qtyToOrder = Math.min(exposure.residualShortage, mitigation.affectedQuantity);

    if (qtyToOrder > 0) {
      // Inject hypothetical PO
      const arrivalDate =
        mitigation.mitigationDate != null &&
          mitigation.mitigationDateProvenance !== "UNKNOWN"
          ? mitigation.mitigationDate
          : null;

      const syntheticPoId =
        -(targetProductId * 1_000_000 + targetSupplierId);

      scenarioProduct.inboundPOs.push({
        poId: syntheticPoId,
        odooId: null,
        supplierId: targetSupplierId,
        productId: targetProductId,
        orderedQuantity: qtyToOrder,
        receivedQuantity: 0,
        remainingQuantity: qtyToOrder,
        expectedArrivalDate: arrivalDate,
        status: "confirmed",
        confirmedForSupply: true,
        currentlyInbound: true
      });

      scenarioShortage = Math.max(0, exposure.residualShortage - qtyToOrder);

      // Calculate the scenario procurement cost addition
      if (
        alternateSupplier.supplierUnitCost != null &&
        alternateSupplier.supplierUnitCost > 0
      ) {
        scenarioProcurementCost +=
          qtyToOrder * alternateSupplier.supplierUnitCost;
        baseResult.provenance.costSource = "CALCULATED";
      } else {
        baseResult.provenance.costSource = "UNKNOWN";
      }
    }

    baseResult.scenarioAssumptions.push("Alternate supplier quantity is hypothetical.");
    baseResult.scenarioAssumptions.push("Supplier capacity is not verified.");

    if (
      mitigation.mitigationDate != null &&
      mitigation.mitigationDateProvenance !== "UNKNOWN"
    ) {
      baseResult.scenarioAssumptions.push(
        "Arrival date is supplied by the mitigation scenario.",
      );
      baseResult.provenance.dateSource = "SCENARIO_ASSUMPTION";
    } else {
      baseResult.scenarioAssumptions.push(
        "Alternate supplier arrival date is not determinable.",
      );
      baseResult.provenance.dateSource = "UNKNOWN";
    }

  } else if (mitigation.type === "FOLLOW_UP_INBOUND") {
    if (!mitigation.mitigationDate) {
      baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
      return baseResult;
    }

    const earliestPo = scenarioProduct.inboundPOs
      .filter(
        (po) =>
          po.currentlyInbound &&
          po.expectedArrivalDate != null,
      )
      .sort(
        (a, b) =>
          a.expectedArrivalDate!.localeCompare(b.expectedArrivalDate!) ||
          a.poId - b.poId,
      )[0];

    if (earliestPo) {
      earliestPo.expectedArrivalDate = mitigation.mitigationDate;
      // Following up an existing PO doesn't reduce the total mathematical shortage in SR-3, it only changes the date.
      // Since SR-4.1 doesn't implement time-phased pegging, the residualShortage scalar remains the same.
    } else {
      baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
      return baseResult;
    }

    baseResult.scenarioAssumptions.push("Expedited arrival date is a hypothetical scenario assumption.");
    baseResult.scenarioAssumptions.push("Actual logistics capacity is not verified.");
    baseResult.provenance.dateSource = "SCENARIO_ASSUMPTION";

  } else if (mitigation.type === "COVER_FROM_AVAILABLE_STOCK") {
    const qtyToCover = Math.min(exposure.residualShortage, scenarioProduct.availableStock);
    if (qtyToCover <= 0) {
      baseResult.scenarioValidity = "INVALID_INSUFFICIENT_DATA";
      return baseResult;
    }

    // Simulate consuming stock by reducing availableStock and residualShortage
    scenarioProduct.availableStock -= qtyToCover;
    scenarioShortage = Math.max(0, exposure.residualShortage - qtyToCover);

    baseResult.provenance.dateSource = "SCENARIO_ASSUMPTION";
    baseResult.scenarioAssumptions.push("Available stock coverage is hypothetically allocated.");

  } else {
    baseResult.scenarioValidity = "INVALID_UNSUPPORTED_ACTION";
    return baseResult;
  }

  baseResult.scenarioMetrics.residualShortage = scenarioShortage;
  baseResult.scenarioMetrics.procurementCost = scenarioProcurementCost;

  baseResult.incrementalMetrics.shortageDelta = baseResult.scenarioMetrics.residualShortage - baseResult.baselineMetrics.residualShortage;
  baseResult.incrementalMetrics.procurementCostDelta = baseResult.scenarioMetrics.procurementCost - baseResult.baselineMetrics.procurementCost;

  return baseResult;
}
