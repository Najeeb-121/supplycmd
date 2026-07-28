import { Router, type IRouter } from "express";
import { eq, lte } from "drizzle-orm";
import { db, inventoryItemsTable } from "@workspace/db";
import {
  CreateInventoryItemBody,
  UpdateInventoryItemBody,
  UpdateInventoryItemParams,
  GetInventoryItemParams,
  DeleteInventoryItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Lean manufacturing equations
function calcEOQ(annualDemand: number, orderingCost: number, unitCost: number, holdingCostRate: number): number {
  if (unitCost <= 0 || holdingCostRate <= 0) return 0;
  return Math.sqrt((2 * annualDemand * orderingCost) / (unitCost * holdingCostRate));
}

function calcSafetyStock(leadTimeDays: number, annualDemand: number, zScore = 1.65): number {
  const dailyDemand = annualDemand / 365;
  const stdDevDemand = dailyDemand * 0.2; // assume 20% demand variability
  return Math.ceil(zScore * stdDevDemand * Math.sqrt(leadTimeDays));
}

function calcReorderPoint(leadTimeDays: number, annualDemand: number): number {
  const dailyDemand = annualDemand / 365;
  const safetyStock = calcSafetyStock(leadTimeDays, annualDemand);
  return Math.ceil(dailyDemand * leadTimeDays + safetyStock);
}

function computeMetrics(data: {
  annualDemand: number;
  orderingCost: number;
  unitCost: number;
  holdingCostRate: number;
  leadTimeDays: number;
}) {
  const eoq = calcEOQ(data.annualDemand, data.orderingCost, data.unitCost, data.holdingCostRate);
  const safetyStock = calcSafetyStock(data.leadTimeDays, data.annualDemand);
  const reorderPoint = calcReorderPoint(data.leadTimeDays, data.annualDemand);
  return { eoq, safetyStock, reorderPoint };
}

router.get("/inventory", async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable).orderBy(inventoryItemsTable.name);
  res.json(items);
});

router.get("/inventory/reorder-alerts", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(lte(inventoryItemsTable.currentStock, inventoryItemsTable.reorderPoint));

  const alerts = items.map((item) => {
    let urgency: "critical" | "warning" | "low" = "low";
    if (item.currentStock <= item.safetyStock) urgency = "critical";
    else if (item.currentStock <= item.reorderPoint * 0.5) urgency = "warning";
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      currentStock: item.currentStock,
      reorderPoint: item.reorderPoint,
      safetyStock: item.safetyStock,
      eoq: item.eoq,
      urgency,
    };
  });
  res.json(alerts);
});

router.get("/inventory/:id", async (req, res): Promise<void> => {
  const params = GetInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, params.data.id));
  if (!item) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.json(item);
});

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { annualDemand, orderingCost, unitCost, holdingCostRate, leadTimeDays } = parsed.data;
  const { eoq, safetyStock, reorderPoint } = computeMetrics({ annualDemand, orderingCost, unitCost, holdingCostRate, leadTimeDays });

  const [item] = await db
    .insert(inventoryItemsTable)
    .values({ ...parsed.data, eoq, safetyStock, reorderPoint })
    .returning();
  res.status(201).json(item);
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const params = UpdateInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Inventory item not found" }); return; }

  const merged = { ...existing, ...parsed.data };
  const { eoq, safetyStock, reorderPoint } = computeMetrics({
    annualDemand: merged.annualDemand,
    orderingCost: merged.orderingCost,
    unitCost: merged.unitCost,
    holdingCostRate: merged.holdingCostRate,
    leadTimeDays: merged.leadTimeDays,
  });

  const [updated] = await db
    .update(inventoryItemsTable)
    .set({ ...parsed.data, eoq, safetyStock, reorderPoint })
    .where(eq(inventoryItemsTable.id, params.data.id))
    .returning();
  res.json(updated);
});

router.delete("/inventory/:id", async (req, res): Promise<void> => {
  const params = DeleteInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.sendStatus(204);
});

export default router;
