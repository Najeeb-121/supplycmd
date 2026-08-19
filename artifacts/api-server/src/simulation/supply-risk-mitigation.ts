import { SupplyRiskSnapshot, RiskExposure, RiskMitigation, MitigationResult } from "./supply-risk-contracts";

export function generateMitigations(snapshot: SupplyRiskSnapshot, exposure: RiskExposure): MitigationResult {
  const actions: RiskMitigation[] = [];
  const { targetProductId, targetSupplierId, affectedQuantity, residualShortage } = exposure;
  const product = targetProductId ? snapshot.products[targetProductId] : undefined;

  // 1. COVER_FROM_AVAILABLE_STOCK
  // Do not generate a stock-coverage mitigation when residualShortage === 0
  if (product && residualShortage > 0 && product.availableStock > 0) {
    actions.push({
      id: "COVER_FROM_AVAILABLE_STOCK",
      type: "COVER_FROM_AVAILABLE_STOCK",
      title: "Cover from Available Stock",
      reason: `Usable stock (${product.availableStock} units) can cover part or all of the remaining shortage.`,
      feasible: true,
      affectedQuantity: residualShortage,
      availableQuantity: Math.min(residualShortage, product.availableStock),
      mitigationCostProvenance: "UNKNOWN",
      mitigationDateProvenance: "UNKNOWN"
    });
  }

  // 2. INBOUND MITIGATION (FOLLOW_UP_INBOUND)
  if (exposure.currentlyInboundQuantity > 0 && product) {
    let earliestDate: string | undefined = undefined;
    for (const po of product.inboundPOs) {
      if (po.currentlyInbound && po.expectedArrivalDate) {
        if (!earliestDate || po.expectedArrivalDate < earliestDate) {
          earliestDate = po.expectedArrivalDate;
        }
      }
    }

    actions.push({
      id: "FOLLOW_UP_INBOUND",
      type: "FOLLOW_UP_INBOUND",
      title: "Follow-Up Inbound Supply",
      reason: `Currently inbound quantity (${exposure.currentlyInboundQuantity} units) exists. Actual acceleration requires operational confirmation.`,
      feasible: true,
      affectedQuantity: residualShortage,
      availableQuantity: exposure.currentlyInboundQuantity,
      mitigationCostProvenance: "UNKNOWN",
      mitigationDate: earliestDate,
      mitigationDateProvenance: earliestDate ? "EXPECTED_ARRIVAL" : "UNKNOWN"
    });
  }

  // 3. ALTERNATE_SUPPLIER
  if (product && exposure.alternateSupplierAvailable) {
    const alternates = product.suppliers.filter(s => s.supplierId !== targetSupplierId);
    
    // Sort by sequence (lowest first) then preferred supplier
    alternates.sort((a, b) => {
      const seqA = a.sequence ?? 999;
      const seqB = b.sequence ?? 999;
      if (seqA !== seqB) return seqA - seqB;
      if (a.preferredSupplier && !b.preferredSupplier) return -1;
      if (!a.preferredSupplier && b.preferredSupplier) return 1;
      return 0;
    });

    for (const alt of alternates) {
      let cost: number | undefined = undefined;
      let costProv: "CALCULATED" | "UNKNOWN" = "UNKNOWN";

      if (alt.supplierUnitCost > 0 && residualShortage > 0) {
        cost = residualShortage * alt.supplierUnitCost;
        costProv = "CALCULATED";
      }

      let date: string | undefined = undefined;
      let dateProv: "CALCULATED" | "UNKNOWN" = "UNKNOWN";

      if (alt.leadTimeDays && alt.leadTimeDays.value > 0) {
        date = undefined;
        dateProv = "UNKNOWN";
      }

      actions.push({
        id: `ALT_SUPPLIER_${alt.supplierId}`,
        type: "ALTERNATE_SUPPLIER",
        title: `Source from Alternate Supplier: ${alt.supplierName}`,
        reason: `Supplier ${alt.supplierName} is available as an alternate source.`,
        feasible: true,
        affectedQuantity: residualShortage,
        mitigationCost: cost,
        mitigationCostProvenance: costProv,
        mitigationDate: date,
        mitigationDateProvenance: dateProv,
        targetSupplierId: alt.supplierId,
        targetSupplierName: alt.supplierName,
        targetProductId: targetProductId
      });
    }
  }

  // 4. PRIORITIZE_DOWNSTREAM_DEMAND
  const { affectedSalesOrders, delayedMOs } = exposure.downstreamImpacts;
  if (affectedSalesOrders.length > 0 || delayedMOs.length > 0) {
    actions.push({
      id: "PRIORITIZE_DOWNSTREAM_DEMAND",
      type: "PRIORITIZE_DOWNSTREAM_DEMAND",
      title: "Prioritize Downstream Demand",
      reason: `There are ${affectedSalesOrders.length} affected sales orders and ${delayedMOs.length} delayed MOs to prioritize.`,
      feasible: true,
      affectedQuantity: residualShortage,
      mitigationCostProvenance: "UNKNOWN",
      mitigationDateProvenance: "UNKNOWN"
    });
  }

  // 5. MONITOR_UNVERIFIED_LEAD_TIME
  if (exposure.leadTimeVerified === false) {
    actions.push({
      id: "MONITOR_UNVERIFIED_LEAD_TIME",
      type: "MONITOR_UNVERIFIED_LEAD_TIME",
      title: "Monitor Unverified Lead Time",
      reason: "Lead time is unverified and relies on a system default.",
      feasible: true,
      affectedQuantity: affectedQuantity,
      mitigationCostProvenance: "UNKNOWN",
      mitigationDateProvenance: "UNKNOWN"
    });
  }

  // 6. CAPACITY_DATA_REQUIRED
  if (exposure.capacityRisk === "UNKNOWN") {
    actions.push({
      id: "CAPACITY_DATA_REQUIRED",
      type: "CAPACITY_DATA_REQUIRED",
      title: "Gather Supplier Capacity Data",
      reason: "Supplier capacity data is currently unknown.",
      feasible: true,
      affectedQuantity: affectedQuantity,
      mitigationCostProvenance: "UNKNOWN",
      mitigationDateProvenance: "UNKNOWN"
    });
  }

  return {
    scenarioType: exposure.scenarioType,
    riskSeverity: exposure.severity,
    actions
  };
}
