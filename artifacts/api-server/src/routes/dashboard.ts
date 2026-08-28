import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  suppliersTable,
  ordersTable,
  productionRunsTable,
  demandRecordsTable,
} from "@workspace/db";

const router: IRouter = Router();
function averageKnown(
  values: readonly (number | null)[],
): number | null {
  const knownValues = values.filter(
    (value): value is number => value != null,
  );

  if (knownValues.length === 0) return null;

  const average =
    knownValues.reduce((sum, value) => sum + value, 0) /
    knownValues.length;

  return Math.round(average * 10) / 10;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;
  const [items, suppliers, orders, productionRuns, demandRecords] = await Promise.all([
    db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.companyId, companyId), eq(inventoryItemsTable.archived, false))),
    db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId)),
    db.select().from(ordersTable).where(eq(ordersTable.companyId, companyId)),
    db.select().from(productionRunsTable).where(eq(productionRunsTable.companyId, companyId)),
    db.select().from(demandRecordsTable).where(eq(demandRecordsTable.companyId, companyId)),
  ]);

  // Inventory
  const totalSkus = items.length;
  const totalInventoryValue = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
  const reorderAlertCount = items.filter((i) => i.reservationShortage > 0).length;

  // Suppliers
  const activeSuppliers = suppliers.length;

  // Orders
  const openOrders = orders.filter((o) => ["pending", "confirmed", "shipped"].includes(o.status)).length;
  const pendingOrderValue = orders
    .filter((o) => ["pending", "confirmed"].includes(o.status))
    .reduce((s, o) => s + o.totalValue, 0);

  // OEE
  let oeePercent = 0;
  if (productionRuns.length > 0) {
    const oees = productionRuns.map((run) => {
      const avail = run.plannedTimeMin > 0 ? Math.max(0, Math.min(1, (run.actualTimeMin - run.downtimeMin) / run.plannedTimeMin)) : 0;
      const perf = run.plannedUnits > 0 ? Math.min(1, run.actualUnits / run.plannedUnits) : 0;
      const qual = run.actualUnits > 0 ? Math.max(0, (run.actualUnits - run.defects) / run.actualUnits) : 0;
      return avail * perf * qual;
    });
    oeePercent = Math.round((oees.reduce((s, v) => s + v, 0) / oees.length) * 1000) / 10;
  }

  // Forecast accuracy (avg MAPE)
  let forecastAccuracy: number | null = null;

  const validDemandPairs = demandRecords.filter(
    (r) =>
      r.actualDemand !== null &&
      r.forecastedDemand !== null &&
      r.actualDemand > 0
  );

  if (validDemandPairs.length > 0) {
    const mapeSum = validDemandPairs.reduce((s, r) => {
      const actual = r.actualDemand!;
      const forecast = r.forecastedDemand!;
      return s + Math.abs(actual - forecast) / actual;
    }, 0);

    const mape = (mapeSum / validDemandPairs.length) * 100;
    forecastAccuracy =
      Math.round(Math.max(0, 100 - mape) * 10) / 10;
  }

  // Fill rate & OTIF from suppliers (both already stored on a 0-100 scale)
  // Supplier KPIs use only observed values; missing evidence remains null.
  const fillRate = averageKnown(
    suppliers.map((supplier) => supplier.fillRate),
  );

  const otifPercent = averageKnown(
    suppliers.map((supplier) => supplier.onTimeDeliveryRate),
  );

  res.json({
    totalSkus,
    totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
    reorderAlertCount,
    activeSuppliers,
    openOrders,
    pendingOrderValue: Math.round(pendingOrderValue * 100) / 100,
    oeePercent,
    forecastAccuracy,
    fillRate,
    otifPercent,
  });
});

router.get("/dashboard/inventory-health", async (req, res): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.companyId, req.user!.companyId), eq(inventoryItemsTable.archived, false)));

  const supportedDemandItems = items.filter(
    (item) =>
      item.annualDemand != null &&
      item.annualDemand > 0 &&
      !["UNKNOWN", "SCHEMA_DEFAULT"].includes(item.annualDemandSource),
  );

  // Turnover requires average inventory history, not a single stock snapshot.
  const avgTurnoverRate = null;

  const avgDaysOfSupply = supportedDemandItems.length > 0
    ? supportedDemandItems.reduce((sum, item) => {
      const dailyDemand = item.annualDemand! / 365;
      return sum + Math.max(item.availableQuantity, 0) / dailyDemand;
    }, 0) / supportedDemandItems.length
    : null;

  const overstockCount = items.filter(
    (item) => item.maxStock != null && item.currentStock > item.maxStock,
  ).length;

  const stockoutCount = items.filter(
    (item) => item.availableQuantity <= 0,
  ).length;

  const healthyCount = items.filter(
    (item) =>
      item.availableQuantity > 0 &&
      !(item.maxStock != null && item.currentStock > item.maxStock),
  ).length;

  // Category value remains supportable; turnover does not without history.
  const categoryMap = new Map<string, { count: number; value: number }>();

  for (const item of items) {
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, { count: 0, value: 0 });
    }

    const category = categoryMap.get(item.category)!;
    category.count++;
    category.value += item.currentStock * item.unitCost;
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(
    ([category, data]) => ({
      category,
      count: data.count,
      value: Math.round(data.value * 100) / 100,
      avgTurnover: null,
    }),
  );

  res.json({
    avgTurnoverRate,
    avgDaysOfSupply:
      avgDaysOfSupply == null
        ? null
        : Math.round(avgDaysOfSupply * 10) / 10,
    overstockCount,
    stockoutCount,
    healthyCount,
    categoryBreakdown,
  });
});

router.get("/dashboard/logistics-kpis", async (req, res): Promise<void> => {
  const [suppliers, orders] = await Promise.all([
    db.select().from(suppliersTable).where(eq(suppliersTable.companyId, req.user!.companyId)),
    db.select().from(ordersTable).where(eq(ordersTable.companyId, req.user!.companyId)),
  ]);

  const fillRate = averageKnown(
    suppliers.map((supplier) => supplier.fillRate),
  );

  const otifPercent = averageKnown(
    suppliers.map((supplier) => supplier.onTimeDeliveryRate),
  );

  const avgLeadTimeDays = averageKnown(
    suppliers.map((supplier) => supplier.leadTimeDays),
  );

  const avgSupplierScore = averageKnown(
    suppliers.map((supplier) => supplier.qualityScore),
  );

  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const ordersDeliveredOnTime = deliveredOrders.filter((o) => {
    if (!o.actualDelivery) return false;
    return o.actualDelivery <= o.expectedDelivery;
  }).length;

  const ordersFulfilled = deliveredOrders.length;
  const totalOrders = orders.length;

  res.json({
    fillRate,
    otifPercent,
    avgLeadTimeDays,
    avgSupplierScore,
    ordersDeliveredOnTime,
    ordersFulfilled,
    totalOrders,
  });
});

export default router;
