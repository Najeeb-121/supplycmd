import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  salesOrdersTable,
  salesOrderLinesTable,
  inventoryItemsTable
} from "@workspace/db";

const router: IRouter = Router();

router.get("/sales/metrics", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const orders = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));
  const lines = await db.select().from(salesOrderLinesTable).where(eq(salesOrderLinesTable.companyId, companyId));

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  const openOrders = orders.filter(o => o.status !== "done" && o.status !== "cancel");
  const openPipeline = openOrders.reduce((sum, order) => sum + order.totalAmount, 0);

  let orderedQtySum = 0;
  let deliveredQtySum = 0;
  
  lines.forEach(line => {
    orderedQtySum += line.orderedQuantity;
    deliveredQtySum += line.deliveredQuantity;
  });

  const fulfillmentRate = orderedQtySum > 0 ? (deliveredQtySum / orderedQtySum) * 100 : 0;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  let erpVerified = 0;
  let derived = 0;
  let missing = 0;

  orders.forEach(o => {
    if (o.effectiveDeliveryDateSource === "ODOO_COMMITMENT_DATE") erpVerified++;
    else if (o.effectiveDeliveryDateSource === "ODOO_EXPECTED_DATE") derived++;
    else missing++;
  });

  res.json({
    totalRevenue,
    totalOrders,
    openPipeline,
    fulfillmentRate: Math.round(fulfillmentRate * 10) / 10,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    provenance: { erpVerified, derived, missing }
  });
});

router.get("/sales/top-products", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const lines = await db.select().from(salesOrderLinesTable).where(eq(salesOrderLinesTable.companyId, companyId));
  
  const productMap = new Map<number | string, { name: string, quantity: number, revenue: number }>();
  
  for (const line of lines) {
    const key = line.inventoryItemId || line.odooProductId || "unknown";
    if (!productMap.has(key)) {
      productMap.set(key, { name: line.productName || `Unknown (${key})`, quantity: 0, revenue: 0 });
    }
    const item = productMap.get(key)!;
    item.quantity += line.orderedQuantity;
    item.revenue += line.subtotal || (line.orderedQuantity * (line.unitPrice || 0));
  }

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  res.json(topProducts);
});

router.get("/sales/top-customers", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const orders = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));
  
  const customerMap = new Map<number, { name: string, orders: number, revenue: number }>();
  
  for (const order of orders) {
    if (!order.customerId) continue;
    
    if (!customerMap.has(order.customerId)) {
      customerMap.set(order.customerId, { name: order.customerName || `Customer ${order.customerId}`, orders: 0, revenue: 0 });
    }
    const customer = customerMap.get(order.customerId)!;
    customer.orders += 1;
    customer.revenue += order.totalAmount;
  }

  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  res.json(topCustomers);
});

router.get("/sales/recent-orders", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const recentOrders = await db.select()
    .from(salesOrdersTable)
    .where(eq(salesOrdersTable.companyId, companyId))
    .orderBy(desc(salesOrdersTable.orderDate))
    .limit(10);

  res.json(recentOrders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber || o.odooId?.toString() || "",
    customerName: o.customerName || "Unknown",
    orderDate: o.orderDate,
    expectedDate: o.expectedDate,
    totalAmount: o.totalAmount,
    status: o.status,
    currency: o.currency || "USD",
    effectiveDeliveryDateSource: o.effectiveDeliveryDateSource || "MISSING"
  })));
});

router.get("/sales/revenue-trend", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;
  const orders = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));

  const monthMap = new Map<string, number>();

  for (const order of orders) {
    if (!order.orderDate) continue;
    // Get YYYY-MM
    const month = order.orderDate.substring(0, 7);
    monthMap.set(month, (monthMap.get(month) || 0) + order.totalAmount);
  }

  const sortedMonths = Array.from(monthMap.keys()).sort();
  const trend = sortedMonths.map(month => ({
    month,
    revenue: Math.round(monthMap.get(month)! * 100) / 100
  }));

  res.json(trend);
});

export default router;
