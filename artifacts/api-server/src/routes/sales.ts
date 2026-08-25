import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  salesOrdersTable,
  salesOrderLinesTable,
  inventoryItemsTable
} from "@workspace/db";

const router: IRouter = Router();
const isConfirmedSalesStatus = (status: string): boolean =>
  status === "sale" || status === "done";

const isQuotationStatus = (status: string): boolean =>
  status === "draft" || status === "sent";

router.get("/sales/metrics", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const orders = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));

  const confirmedOrders = orders.filter(order =>
    isConfirmedSalesStatus(order.status)
  );

  const lines = await db.select().from(salesOrderLinesTable).where(eq(salesOrderLinesTable.companyId, companyId));

  const quotationOrders = orders.filter(order =>
    isQuotationStatus(order.status)
  );

  const confirmedOrderValue = confirmedOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );

  const quotationPipeline = quotationOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );

  const confirmedOrderIds = new Set(
    confirmedOrders.map(order => order.id)
  );

  const confirmedLines = lines.filter(line =>
    confirmedOrderIds.has(line.orderId)
  );

  let orderedQtySum = 0;
  let deliveredQtySum = 0;

  confirmedLines.forEach(line => {
    orderedQtySum += line.orderedQuantity;
    deliveredQtySum += line.deliveredQuantity;
  });

  const fulfillmentRate =
    orderedQtySum > 0
      ? (deliveredQtySum / orderedQtySum) * 100
      : null;

  const avgConfirmedOrderValue =
    confirmedOrders.length > 0
      ? confirmedOrderValue / confirmedOrders.length
      : null;
  let erpVerified = 0;
  let derived = 0;
  let missing = 0;

  orders.forEach(o => {
    if (o.effectiveDeliveryDateSource === "ODOO_COMMITMENT_DATE") erpVerified++;
    else if (o.effectiveDeliveryDateSource === "ODOO_EXPECTED_DATE") derived++;
    else missing++;
  });

  res.json({
    confirmedOrderValue: Math.round(confirmedOrderValue * 100) / 100,
    confirmedOrders: confirmedOrders.length,
    quotationPipeline: Math.round(quotationPipeline * 100) / 100,
    quotationCount: quotationOrders.length,
    fulfillmentRate:
      fulfillmentRate == null
        ? null
        : Math.round(fulfillmentRate * 10) / 10,
    avgConfirmedOrderValue:
      avgConfirmedOrderValue == null
        ? null
        : Math.round(avgConfirmedOrderValue * 100) / 100,
    provenance: { erpVerified, derived, missing }
  });
});
router.get("/sales/top-products", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const lines = await db
    .select()
    .from(salesOrderLinesTable)
    .where(eq(salesOrderLinesTable.companyId, companyId));

  const confirmedLines = lines.filter(line =>
    isConfirmedSalesStatus(line.status)
  );
  const productMap = new Map<
    number | string,
    { name: string; quantity: number; confirmedOrderValue: number | null }
  >();

  for (const line of confirmedLines) {
    const key = line.inventoryItemId || line.odooProductId || "unknown";
    if (!productMap.has(key)) {
      productMap.set(key, {
        name: line.productName || `Unknown (${key})`,
        quantity: 0,
        confirmedOrderValue: 0
      });
    }

    const item = productMap.get(key)!;
    item.quantity += line.orderedQuantity;

    const lineValue =
      line.subtotal ??
      (line.unitPrice == null
        ? null
        : line.orderedQuantity * line.unitPrice);

    if (item.confirmedOrderValue !== null && lineValue !== null) {
      item.confirmedOrderValue += lineValue;
    } else {
      item.confirmedOrderValue = null;
    }
  }

  const topProducts = Array.from(productMap.values())
    .sort(
      (a, b) =>
        (b.confirmedOrderValue ?? -Infinity) -
        (a.confirmedOrderValue ?? -Infinity)
    )
    .slice(0, 10);

  res.json(topProducts);
});

router.get("/sales/top-customers", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;

  const orders = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));
  const confirmedOrders = orders.filter(order =>
    isConfirmedSalesStatus(order.status)
  );
  const customerMap = new Map<
    number,
    { name: string; orders: number; confirmedOrderValue: number }
  >();

  for (const order of confirmedOrders) {
    if (!order.customerId) continue;

    if (!customerMap.has(order.customerId)) {
      customerMap.set(order.customerId, {
        name: order.customerName || `Customer ${order.customerId}`,
        orders: 0,
        confirmedOrderValue: 0
      });
    }

    const customer = customerMap.get(order.customerId)!;
    customer.orders += 1;
    customer.confirmedOrderValue += order.totalAmount;
  }

  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.confirmedOrderValue - a.confirmedOrderValue)
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
    customerName: o.customerName ?? null,
    orderDate: o.orderDate,
    expectedDate: o.expectedDate,
    totalAmount: o.totalAmount,
    status: o.status,
    currency: o.currency ?? null,
    effectiveDeliveryDateSource: o.effectiveDeliveryDateSource ?? "MISSING"
  })));
});

router.get("/sales/revenue-trend", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;
  const orders = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.companyId, companyId));
  const confirmedOrders = orders.filter(order =>
    isConfirmedSalesStatus(order.status)
  );
  const monthMap = new Map<string, number>();

  for (const order of confirmedOrders) {
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
