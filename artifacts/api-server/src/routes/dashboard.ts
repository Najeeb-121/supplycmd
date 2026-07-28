import { Router, type IRouter } from "express";
import { lte, eq } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  suppliersTable,
  ordersTable,
  productionRunsTable,
  demandRecordsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [items, suppliers, orders, productionRuns, demandRecords] = await Promise.all([
    db.select().from(inventoryItemsTable),
    db.select().from(suppliersTable),
    db.select().from(ordersTable),
    db.select().from(productionRunsTable),
    db.select().from(demandRecordsTable),
  ]);

  // Inventory
  const totalSkus = items.length;
  const totalInventoryValue = items.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
  const reorderAlertCount = items.filter((i) => i.currentStock <= i.reorderPoint).length;

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
      const avail = run.plannedTimeMin > 0 ? Math.min(1, (run.actualTimeMin - run.downtimeMin) / run.plannedTimeMin) : 0;
      const perf = run.plannedUnits > 0 ? Math.min(1, run.actualUnits / run.plannedUnits) : 0;
      const qual = run.actualUnits > 0 ? Math.max(0, (run.actualUnits - run.defects) / run.actualUnits) : 0;
      return avail * perf * qual;
    });
    oeePercent = Math.round((oees.reduce((s, v) => s + v, 0) / oees.length) * 1000) / 10;
  }

  // Forecast accuracy (avg MAPE)
  let forecastAccuracy = 0;
  if (demandRecords.length > 0) {
    const mapeSum = demandRecords.reduce((s, r) => {
      if (r.actualDemand === 0) return s;
      return s + Math.abs(r.actualDemand - r.forecastedDemand) / r.actualDemand;
    }, 0);
    const mape = (mapeSum / demandRecords.length) * 100;
    forecastAccuracy = Math.round(Math.max(0, 100 - mape) * 10) / 10;
  }

  // Fill rate & OTIF from suppliers
  const fillRate = suppliers.length > 0
    ? Math.round((suppliers.reduce((s, sup) => s + sup.fillRate, 0) / suppliers.length) * 1000) / 10
    : 0;
  const otifPercent = suppliers.length > 0
    ? Math.round((suppliers.reduce((s, sup) => s + sup.onTimeDeliveryRate, 0) / suppliers.length) * 1000) / 10
    : 0;

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

router.get("/dashboard/inventory-health", async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable);

  const avgTurnoverRate = items.length > 0
    ? items.reduce((s, i) => {
        const avgInventory = i.currentStock;
        return s + (avgInventory > 0 ? i.annualDemand / avgInventory : 0);
      }, 0) / items.length
    : 0;

  const avgDaysOfSupply = items.length > 0
    ? items.reduce((s, i) => {
        const dailyDemand = i.annualDemand / 365;
        return s + (dailyDemand > 0 ? i.currentStock / dailyDemand : 0);
      }, 0) / items.length
    : 0;

  const overstockCount = items.filter((i) => {
    const dailyDemand = i.annualDemand / 365;
    return dailyDemand > 0 && i.currentStock / dailyDemand > 90;
  }).length;

  const stockoutCount = items.filter((i) => i.currentStock <= 0).length;
  const healthyCount = items.length - overstockCount - stockoutCount;

  // Category breakdown
  const categoryMap = new Map<string, { count: number; value: number; turnoverSum: number }>();
  for (const item of items) {
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, { count: 0, value: 0, turnoverSum: 0 });
    }
    const cat = categoryMap.get(item.category)!;
    cat.count++;
    cat.value += item.currentStock * item.unitCost;
    cat.turnoverSum += item.currentStock > 0 ? item.annualDemand / item.currentStock : 0;
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    value: Math.round(data.value * 100) / 100,
    avgTurnover: Math.round((data.turnoverSum / data.count) * 100) / 100,
  }));

  res.json({
    avgTurnoverRate: Math.round(avgTurnoverRate * 100) / 100,
    avgDaysOfSupply: Math.round(avgDaysOfSupply * 10) / 10,
    overstockCount,
    stockoutCount,
    healthyCount,
    categoryBreakdown,
  });
});

router.get("/dashboard/logistics-kpis", async (_req, res): Promise<void> => {
  const [suppliers, orders] = await Promise.all([
    db.select().from(suppliersTable),
    db.select().from(ordersTable),
  ]);

  const fillRate = suppliers.length > 0
    ? Math.round((suppliers.reduce((s, sup) => s + sup.fillRate, 0) / suppliers.length) * 1000) / 10
    : 0;

  const otifPercent = suppliers.length > 0
    ? Math.round((suppliers.reduce((s, sup) => s + sup.onTimeDeliveryRate, 0) / suppliers.length) * 1000) / 10
    : 0;

  const avgLeadTimeDays = suppliers.length > 0
    ? Math.round((suppliers.reduce((s, sup) => s + sup.leadTimeDays, 0) / suppliers.length) * 10) / 10
    : 0;

  const avgSupplierScore = suppliers.length > 0
    ? Math.round((suppliers.reduce((s, sup) => s + sup.qualityScore, 0) / suppliers.length) * 10) / 10
    : 0;

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
