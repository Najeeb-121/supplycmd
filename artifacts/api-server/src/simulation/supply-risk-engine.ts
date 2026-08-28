import { SupplyRiskSnapshot, RiskExposure, ProductInventory, SupplierRiskProfile } from "./supply-risk-contracts";
import { BOMNode } from "./bom-propagation";

export function calculateRiskSeverity(exposure: Omit<RiskExposure, 'severity'>): RiskExposure["severity"] {
  if (exposure.residualShortage > 0) {
    const hasDownstreamImpact =
      exposure.downstreamImpacts.dependentProducts.length > 0 ||
      exposure.downstreamImpacts.delayedMOs.length > 0 ||
      exposure.downstreamImpacts.affectedSalesOrders.length > 0;

    if (hasDownstreamImpact) return "CRITICAL";
    return "HIGH";
  }

  if (exposure.affectedQuantity > 0 && exposure.canAbsorbWithBuffer) {
    return "MEDIUM";
  }

  if (exposure.affectedQuantity === 0) {
    return "LOW";
  }

  return "UNKNOWN";
}

function extractGeneralRiskFactors(snapshot: SupplyRiskSnapshot, productId: number, targetSupplierId?: number): { singleSupplierDependency: boolean, leadTimeVerified: boolean, alternateSupplierAvailable: boolean, totalSupplierCount: number } {
  const product = snapshot.products[productId];
  if (!product) return { singleSupplierDependency: false, leadTimeVerified: false, alternateSupplierAvailable: false, totalSupplierCount: 0 };

  const totalSupplierCount = product.suppliers.length;
  const singleSupplierDependency = totalSupplierCount === 1;
  // alternateSupplierAvailable: there is at least one supplier OTHER than the target supplier.
  // When targetSupplierId is undefined, this is false (no disruption target specified, so no alternate context).
  const alternateSupplierAvailable = targetSupplierId !== undefined
    ? product.suppliers.some(s => s.supplierId !== targetSupplierId)
    : false;

  // Lead time is verified if ANY supplier has ODOO_VERIFIED lead time.
  const leadTimeVerified = product.leadTimeDays.source === "ODOO_VERIFIED" || product.suppliers.some(s => s.leadTimeDays.source === "ODOO_VERIFIED");

  return {
    singleSupplierDependency,
    leadTimeVerified,
    alternateSupplierAvailable,
    totalSupplierCount
  };
}

export function traceDownstreamImpacts(snapshot: SupplyRiskSnapshot, targetProductId: number) {
  const dependentProducts = new Set<number>();
  const delayedMOs = new Set<number>();
  const affectedSalesOrders = new Set<number>();

  // A very basic deterministic trace upwards using bomGraph
  // The bomGraph has parentId -> BOMNode with lines containing childSkuId
  // Note: Odoo IDs vs Internal IDs. The bomGraph uses parentSkuId and childSkuId.
  let currentSearch = new Set<number>([targetProductId]);
  let newFound = true;

  while (newFound) {
    newFound = false;
    const nextSearch = new Set<number>();

    for (const [parentIdStr, bomNode] of Object.entries(snapshot.boms)) {
      const parentId = parseInt(parentIdStr, 10);
      if (currentSearch.has(parentId)) continue; // already found

      for (const line of bomNode.lines) {
        if (currentSearch.has(line.childSkuId)) {
          dependentProducts.add(parentId);
          nextSearch.add(parentId);
          newFound = true;
          break;
        }
      }
    }

    for (const id of nextSearch) currentSearch.add(id);
  }

  // Find MOs
  for (const mo of snapshot.productionRuns) {
    // If MO's product is in our dependent products, or is the target product itself
    if (
      mo.moState === "confirmed" &&
      mo.productOdooId &&
      currentSearch.has(mo.productOdooId)
    ) {
      delayedMOs.add(mo.id || mo.odooId);
    }
  }

  // Find SOs
  for (const so of snapshot.demand) {
    if (currentSearch.has(so.productId)) {
      affectedSalesOrders.add(so.salesOrderId);
    }
  }

  return {
    dependentProducts: Array.from(dependentProducts),
    delayedMOs: Array.from(delayedMOs),
    affectedSalesOrders: Array.from(affectedSalesOrders)
  };
}

export function analyzeQualityFailure(
  snapshot: SupplyRiskSnapshot,
  targetSupplierId: number,
  targetProductId: number,
  defectPercentage: number
): RiskExposure {
  const product = snapshot.products[targetProductId];
  if (!product) throw new Error("Product not found in snapshot");

  // Sum only currentlyInbound for this supplier
  const inboundForSupplier = product.inboundPOs.filter(po => po.supplierId === targetSupplierId && po.currentlyInbound);
  const currentlyInboundQuantity = inboundForSupplier.reduce((sum, po) => sum + po.remainingQuantity, 0);

  const affectedQuantity = currentlyInboundQuantity * defectPercentage;
  const inventoryCoverage = Math.min(affectedQuantity, product.availableStock);
  const residualShortage = Math.max(affectedQuantity - product.availableStock, 0);
  const canAbsorbWithBuffer = product.availableStock >= affectedQuantity;
  const inventoryCoveragePercent = affectedQuantity > 0 ? (inventoryCoverage / affectedQuantity) * 100 : 100;

  const factors = extractGeneralRiskFactors(snapshot, targetProductId, targetSupplierId);
  const downstreamImpacts = traceDownstreamImpacts(snapshot, targetProductId);

  const baseExposure: Omit<RiskExposure, "severity"> = {
    scenarioType: "SUPPLIER_QUALITY_FAILURE",
    targetSupplierId,
    targetProductId,
    affectedQuantity,
    inventoryCoverage,
    residualShortage,
    canAbsorbWithBuffer,
    alternateSupplierAvailable: factors.alternateSupplierAvailable,
    downstreamImpacts,
    exposureReason: `Defect rate of ${defectPercentage * 100}% on ${currentlyInboundQuantity} currently inbound units.`,
    inventoryCoveragePercent,
    singleSupplierDependency: factors.singleSupplierDependency,
    leadTimeVerified: factors.leadTimeVerified,
    capacityRisk: "UNKNOWN",
    currentlyInboundQuantity,
    totalSupplierCount: factors.totalSupplierCount
  };

  return {
    ...baseExposure,
    severity: calculateRiskSeverity(baseExposure)
  };
}

export function analyzeSupplierFailure(
  snapshot: SupplyRiskSnapshot,
  targetSupplierId: number,
  targetProductId: number
): RiskExposure {
  const product = snapshot.products[targetProductId];
  if (!product) throw new Error("Product not found in snapshot");

  const inboundForSupplier = product.inboundPOs.filter(po => po.supplierId === targetSupplierId && po.currentlyInbound);
  const currentlyInboundQuantity = inboundForSupplier.reduce((sum, po) => sum + po.remainingQuantity, 0);

  const affectedQuantity = currentlyInboundQuantity;
  const inventoryCoverage = Math.min(affectedQuantity, product.availableStock);
  const residualShortage = Math.max(affectedQuantity - product.availableStock, 0);
  const canAbsorbWithBuffer = product.availableStock >= affectedQuantity;
  const inventoryCoveragePercent = affectedQuantity > 0 ? (inventoryCoverage / affectedQuantity) * 100 : 100;

  const factors = extractGeneralRiskFactors(snapshot, targetProductId, targetSupplierId);
  const downstreamImpacts = traceDownstreamImpacts(snapshot, targetProductId);

  const baseExposure: Omit<RiskExposure, "severity"> = {
    scenarioType: "SINGLE_SOURCE_FAILURE",
    targetSupplierId,
    targetProductId,
    affectedQuantity,
    inventoryCoverage,
    residualShortage,
    canAbsorbWithBuffer,
    alternateSupplierAvailable: factors.alternateSupplierAvailable,
    downstreamImpacts,
    exposureReason: `Total failure of supplier affecting ${currentlyInboundQuantity} currently inbound units.`,
    inventoryCoveragePercent,
    singleSupplierDependency: factors.singleSupplierDependency,
    leadTimeVerified: factors.leadTimeVerified,
    capacityRisk: "UNKNOWN",
    currentlyInboundQuantity,
    totalSupplierCount: factors.totalSupplierCount
  };

  return {
    ...baseExposure,
    severity: calculateRiskSeverity(baseExposure)
  };
}

export function analyzeDiagnosticRisk(
  snapshot: SupplyRiskSnapshot,
  scenarioType: string,
  targetSupplierId: number,
  targetProductId: number
): RiskExposure {
  const product = snapshot.products[targetProductId];
  if (!product) throw new Error("Product not found in snapshot");

  const factors = extractGeneralRiskFactors(snapshot, targetProductId, targetSupplierId);
  const downstreamImpacts = traceDownstreamImpacts(snapshot, targetProductId);

  // Diagnostic risks do not invent exposure.
  // affectedQuantity = 0, inventoryCoverage = 0, residualShortage = 0 — unchanged.
  // currentlyInboundQuantity is populated as real contextual information only.
  // It does NOT affect affectedQuantity, severity, or any disruption calculation.
  const diagnosticInboundQuantity = product.inboundPOs
    .filter(po => (targetSupplierId ? po.supplierId === targetSupplierId : true) && po.currentlyInbound)
    .reduce((sum, po) => sum + po.remainingQuantity, 0);

  let exposureReason = "Diagnostic check.";
  if (scenarioType === "SINGLE_SUPPLIER_RISK") exposureReason = "Product relies on a single active supplier.";
  if (scenarioType === "MULTI_SUPPLIER_RISK") exposureReason = "Product has alternate suppliers configured.";
  if (scenarioType === "UNVERIFIED_LEAD_TIME") exposureReason = "Lead time is unverified (uses fallback default).";
  if (scenarioType === "CAPACITY_CONSTRAINT") exposureReason = "Supplier capacity limits are unknown.";
  if (scenarioType === "BUFFER_DEPLETION") exposureReason = `Reservation shortage of ${product.reservationShortage} exists.`;

  const baseExposure: Omit<RiskExposure, "severity"> = {
    scenarioType,
    targetSupplierId,
    targetProductId,
    affectedQuantity: 0,           // Diagnostic: no disruption, no exposure
    inventoryCoverage: 0,          // Diagnostic: no disruption
    residualShortage: 0,           // Diagnostic: no disruption
    canAbsorbWithBuffer: false,
    alternateSupplierAvailable: factors.alternateSupplierAvailable,
    downstreamImpacts,
    exposureReason,
    inventoryCoveragePercent: 100,
    singleSupplierDependency: factors.singleSupplierDependency,
    leadTimeVerified: factors.leadTimeVerified,
    capacityRisk: "UNKNOWN",
    currentlyInboundQuantity: diagnosticInboundQuantity, // Real context, not disruption
    totalSupplierCount: factors.totalSupplierCount
  };

  // Severity override for diagnostics
  let severity: RiskExposure["severity"] = "LOW";

  if (scenarioType === "UNVERIFIED_LEAD_TIME" && !factors.leadTimeVerified) {
    severity = "UNKNOWN";
  } else if (scenarioType === "CAPACITY_CONSTRAINT") {
    severity = "UNKNOWN";
  } else if (scenarioType === "BUFFER_DEPLETION" && product.reservationShortage > 0) {
    severity = "HIGH";
  } else if (scenarioType === "SINGLE_SUPPLIER_RISK" && factors.singleSupplierDependency) {
    severity = "HIGH";
  }

  return {
    ...baseExposure,
    severity
  };
}

export function analyzeBufferDepletion(
  snapshot: SupplyRiskSnapshot,
  targetProductId: number
): RiskExposure {
  const product = snapshot.products[targetProductId];
  if (!product) throw new Error("Product not found in snapshot");

  const shortage = product.reservationShortage;
  const factors = extractGeneralRiskFactors(snapshot, targetProductId);
  const downstreamImpacts = traceDownstreamImpacts(snapshot, targetProductId);

  const diagnosticInboundQuantity = product.inboundPOs
    .filter(po => po.currentlyInbound)
    .reduce((sum, po) => sum + po.remainingQuantity, 0);

  const baseExposure: Omit<RiskExposure, "severity"> = {
    scenarioType: "BUFFER_DEPLETION",
    targetSupplierId: undefined,
    targetProductId,
    affectedQuantity: shortage,
    inventoryCoverage: 0,
    residualShortage: shortage,
    canAbsorbWithBuffer: false,
    alternateSupplierAvailable: product.suppliers.length > 0,
    downstreamImpacts,
    exposureReason: `Reservation shortage of ${shortage} exists.`,
    inventoryCoveragePercent: 0,
    singleSupplierDependency: factors.singleSupplierDependency,
    leadTimeVerified: factors.leadTimeVerified,
    capacityRisk: "UNKNOWN",
    currentlyInboundQuantity: diagnosticInboundQuantity,
    totalSupplierCount: factors.totalSupplierCount
  };

  return {
    ...baseExposure,
    severity: shortage > 0 ? calculateRiskSeverity(baseExposure) : "LOW"
  };
}

