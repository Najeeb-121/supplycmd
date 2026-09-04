import { DayRecord, DataValue, SimulationStatus } from "@workspace/db";

export interface ERPSnapshot {
  productId: number;
  openingStock: number;
  dailyDemandRate: number;
  safetyStock: number | null;
  inboundPOs: { id: number; expectedDate: string; qty: number; supplierId: number; status: string }[];
  scheduledMOs: {
    id: number;
    scheduledDate: string;
    qty: number;
    lineId?: number;
    lineIds?: number[];
    status: string;
    dateDeadline?: string | null;
    bomId?: number | null;
    moState?: string | null;
    productOdooId?: number | null;
  }[];
  salesOrders: {
    salesOrderId: number;
    salesOrderLineId: number;
    customerId: number | null;
    demandDate: string;
    orderedQty: number;
    deliveredQty: number;
    remainingQty: number;
    unitPrice: number;
    currency: string;
    status: string;
  }[];
  dependentDemands?: DependentDemand[];
}

export interface DependentDemand {
  componentProductLocalId: number;
  componentProductOdooId: number;
  requiredQuantity: number;
  requiredDate: string | null;
  sourceFinishedProductOdooId: number;
  sourceDemandDate: string;
  sourceDemandQuantity: number;
  sourceSalesOrderOdooId?: number;
  sourceSalesLineOdooId?: number;
  bomOdooId: number;
  bomLevel: number;
  status: "VALID" | "VERIFIED_MO_TIMING" | "INSUFFICIENT_PRODUCTION_TIMING_DATA" | "MISSING_BOM" | "CIRCULAR_BOM_DETECTED";
  productionTiming?: {
    source: string;
    durationDays?: number;
    status: string;
  };
}

export interface ScenarioModifiers {
  // Shift PO arrivals
  poDateShifts?: Record<number, number>; // PO ID -> delay in days
  poRemoveSupplier?: number; // Remove all POs from this supplier (Single Source Failure)

  // Quality
  qualityRejectionRate?: number; // 0.0 to 1.0
  qualitySupplierId?: number;

  // Price
  priceShockMultiplier?: number;
  priceShockSupplierId?: number;

  // MOs
  moLineDowntime?: { lineId: number; startDay: number; endDay: number };

  // Demand
  demandMultiplier?: number;
  demandMultiplierCustomer?: number; // Only apply to specific customer

  seasonality?: Record<number, number>; // Month -> multiplier
}
export function isCommittedInboundPO(status: string): boolean {
  return status === "confirmed";
}

export function snapshotUsesProductionLine(
  snapshot: ERPSnapshot,
  lineId: number,
): boolean {
  return snapshot.scheduledMOs.some(
    mo => mo.lineId === lineId || mo.lineIds?.includes(lineId),
  );
}

export function getMOEffectiveCompletionDate(
  mo: ERPSnapshot["scheduledMOs"][number],
): string | null {
  return mo.dateDeadline !== undefined
    ? mo.dateDeadline
    : mo.scheduledDate;
}

export function runDailyLoop(
  snapshot: ERPSnapshot,
  horizonDays: number,
  modifiers: ScenarioModifiers,
  startDate: Date = new Date()
): DayRecord[] {
  const records: DayRecord[] = [];

  let currentStock = snapshot.openingStock;

  for (let day = 0; day <= horizonDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + day);
    const dateStr = currentDate.toISOString().split("T")[0];

    // Opening Stock
    const openingStock = day === 0 ? snapshot.openingStock : records[day - 1].closingStock;

    // 1. Calculate Inbound
    let inbound = 0;
    let qualityLoss = 0;

    for (const po of snapshot.inboundPOs) {
      if (modifiers.poRemoveSupplier === po.supplierId) continue; // Single Source Failure

      // Apply PO date shift
      const shiftDays = modifiers.poDateShifts?.[po.id] || 0;

      const expected = new Date(po.expectedDate);
      expected.setDate(expected.getDate() + shiftDays);
      const expectedStr = expected.toISOString().split("T")[0];

      if (expectedStr === dateStr) {
        let usableQty = po.qty;

        // Quality Loss
        if (modifiers.qualityRejectionRate && modifiers.qualitySupplierId === po.supplierId) {
          const rejectedQty = po.qty * modifiers.qualityRejectionRate;
          qualityLoss += rejectedQty;
          usableQty -= rejectedQty;
        }

        inbound += usableQty;
      }
    }

    // 2. Calculate MO Output
    let moOutput = 0;
    for (const mo of snapshot.scheduledMOs) {
      // Step 5: Finished manufactured output becomes available on dateDeadline if present.
      // If dateDeadline is explicitly null, preserve explicit missing-data behavior (do not invent completion).
      const completionDate = getMOEffectiveCompletionDate(mo);
      if (completionDate && completionDate.startsWith(dateStr)) {
        let produces = true;

        // Line failure
        const usesFailedLine =
          mo.lineId === modifiers.moLineDowntime?.lineId ||
          mo.lineIds?.includes(modifiers.moLineDowntime?.lineId ?? -1);

        if (modifiers.moLineDowntime && usesFailedLine) {
          if (day >= modifiers.moLineDowntime.startDay && day <= modifiers.moLineDowntime.endDay) {
            produces = false;
          }
        }

        if (produces) {
          moOutput += mo.qty;
        }
      }
    }

    // 3. Calculate Consumption
    let consumption = 0;

    const hasSalesOrders = snapshot.salesOrders && snapshot.salesOrders.length > 0;
    const hasDependentDemands = snapshot.dependentDemands && snapshot.dependentDemands.length > 0;

    if (hasSalesOrders || hasDependentDemands) {
      let baseConsumption = 0;
      let customerTotal = 0;
      let targetCustomerTotal = 0;

      if (hasSalesOrders) {
        for (const so of snapshot.salesOrders) {
          if (so.demandDate === dateStr) {
            baseConsumption += so.remainingQty;

            if (modifiers.demandMultiplierCustomer && so.customerId === modifiers.demandMultiplierCustomer) {
              targetCustomerTotal += so.remainingQty;
            }
          }
        }
      }

      if (hasDependentDemands) {
        for (const dd of snapshot.dependentDemands!) {
          if (
            dd.componentProductLocalId === snapshot.productId &&
            dd.requiredDate === dateStr &&
            dd.status !== "MISSING_BOM" &&
            dd.status !== "CIRCULAR_BOM_DETECTED" &&
            dd.status !== "INSUFFICIENT_PRODUCTION_TIMING_DATA"
          ) {
            baseConsumption += dd.requiredQuantity;
          }
        }
      }

      consumption = baseConsumption;

      // Apply demand multiplier specifically to the affected customer, or globally
      if (modifiers.demandMultiplier !== undefined) {
        if (modifiers.demandMultiplierCustomer) {
          const extraDemand = targetCustomerTotal * (modifiers.demandMultiplier - 1);
          consumption += extraDemand;
        } else {
          consumption *= modifiers.demandMultiplier;
        }
      }
    } else {
      // Fallback to daily rate only if no discrete orders exist
      consumption = snapshot.dailyDemandRate;
      if (modifiers.demandMultiplier !== undefined) {
        consumption *= modifiers.demandMultiplier;
      }
    }

    // Seasonality
    if (modifiers.seasonality) {
      const month = currentDate.getMonth() + 1; // 1-12
      if (modifiers.seasonality[month] != null) {
        consumption *= modifiers.seasonality[month];
      }
    }

    // 4. Closing Stock
    let closingStock = openingStock + inbound + moOutput - Math.round(consumption);

    let shortageUnits = 0;
    let isStockout = false;

    if (closingStock < 0) {
      shortageUnits = Math.abs(closingStock);
      closingStock = 0;
      isStockout = true;
    }

    records.push({
      day,
      date: dateStr,
      openingStock,
      inbound,
      moOutput,
      consumption: Math.round(consumption),
      qualityLoss,
      closingStock,
      shortageUnits,
      isStockout,
      sourceType: "DERIVED"
    });
  }

  return records;
}

export function extractLoopMetrics(records: DayRecord[], snapshot: ERPSnapshot) {
  let firstStockoutDay: number | null = null;
  let stockoutDuration = 0;
  let totalUnmetDemand = 0;
  let totalDemand = 0;
  let recoveryDate: string | null = null;
  let maxShortageUnits = 0;
  let peakInventoryDay = 0;
  let peakInventoryValue = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];

    totalDemand += rec.consumption;

    if (rec.isStockout) {
      if (firstStockoutDay === null) firstStockoutDay = rec.day;
      stockoutDuration++;
      totalUnmetDemand += rec.shortageUnits;

      if (rec.shortageUnits > maxShortageUnits) {
        maxShortageUnits = rec.shortageUnits;
      }
    } else {
      if (firstStockoutDay !== null && recoveryDate === null && i > firstStockoutDay && rec.closingStock > 0) {
        // Recovered!
        recoveryDate = rec.date;
      }
    }

    if (rec.closingStock > peakInventoryValue) {
      peakInventoryValue = rec.closingStock;
      peakInventoryDay = rec.day;
    }
  }

  let coverageDays: number | "UNKNOWN" | "NOT_APPLICABLE" = "UNKNOWN";
  if (snapshot.dailyDemandRate > 0) {
    coverageDays = snapshot.openingStock / snapshot.dailyDemandRate;
  } else if (snapshot.dailyDemandRate === 0) {
    coverageDays = "NOT_APPLICABLE";
  }

  return {
    firstStockoutDay,
    stockoutDuration,
    totalUnmetDemand,
    totalDemand,
    recoveryDate,
    maxShortageUnits,
    coverageDays,
    peakInventoryDay
  };
}

export function calculateIncrementalOperationalMetrics(
  baselineMetrics: ReturnType<typeof extractLoopMetrics>,
  scenarioMetrics: ReturnType<typeof extractLoopMetrics>,
) {
  return {
    incrementalUnmetDemand:
      scenarioMetrics.totalUnmetDemand - baselineMetrics.totalUnmetDemand,
    incrementalShortage:
      scenarioMetrics.maxShortageUnits - baselineMetrics.maxShortageUnits,
    incrementalStockoutDuration:
      scenarioMetrics.stockoutDuration - baselineMetrics.stockoutDuration,
  };
}
