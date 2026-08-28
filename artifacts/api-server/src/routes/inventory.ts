import { Router, type IRouter, type Request, type Response } from "express";
import { eq, lte, gt, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db, inventoryItemsTable, stockMovementsTable, productSuppliersTable, purchaseOrderLinesTable, suppliersTable } from "@workspace/db";
import {
  CreateInventoryItemBody,
  UpdateInventoryItemBody,
  UpdateInventoryItemParams,
  GetInventoryItemParams,
  DeleteInventoryItemParams,
  CreateStockMovementBody,
  CreateStockMovementParams,
} from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

class NotFoundError extends Error { }
class InsufficientStockError extends Error { }

// ── Stricter inventory schema with cross-field rules ───────────────────────────
export const StrictInventoryBody = CreateInventoryItemBody
  .extend({
    currentStock: z.number().int().min(0),
    reservedQuantity: z.number().int().min(0).optional(),
    minStock: z.number().int().min(0).optional(),
    maxStock: z.number().int().min(0).optional(),
    annualDemand: z.number().min(0).nullable().optional(),
    orderingCost: z.number().min(0).nullable().optional(),
    leadTimeDays: z.number().int().min(0).nullable().optional(),
    sellingPrice: z.number().min(0).optional(),
    holdingCostRate: z.number().min(0).max(1).nullable().optional(),
  })
  .refine(
    (d) => d.maxStock == null || d.maxStock >= (d.minStock ?? 0),
    { message: "Max Stock must be ≥ Min Stock", path: ["maxStock"] },
  );

const StrictInventoryPatch = UpdateInventoryItemBody
  .extend({
    currentStock: z.number().int().min(0).optional(),
    reservedQuantity: z.number().int().min(0).optional(),
    minStock: z.number().int().min(0).optional(),
    maxStock: z.number().int().min(0).optional(),
    annualDemand: z.number().min(0).nullable().optional(),
    orderingCost: z.number().min(0).nullable().optional(),
    leadTimeDays: z.number().int().min(0).nullable().optional(),
    sellingPrice: z.number().min(0).optional(),
    holdingCostRate: z.number().min(0).max(1).nullable().optional(),
  })
  .refine(
    (d) => {
      if (d.maxStock == null || d.minStock == null) return true;
      return d.maxStock >= d.minStock;
    },
    { message: "Max Stock must be ≥ Min Stock", path: ["maxStock"] },
  );

const router: IRouter = Router();

// ── Planning calculations ─────────────────────────────────────────────────────
const unsupportedPlanningSources = new Set(["UNKNOWN", "SCHEMA_DEFAULT"]);

function sourceForUserValue(value: number | null | undefined): "USER_PROVIDED" | "UNKNOWN" {
  return value == null ? "UNKNOWN" : "USER_PROVIDED";
}

function isSupportedPlanningSource(source: string): boolean {
  return !unsupportedPlanningSources.has(source);
}

function calcEOQ(
  annualDemand: number,
  orderingCost: number,
  unitCost: number,
  holdingCostRate: number,
): number {
  return Math.sqrt((2 * annualDemand * orderingCost) / (unitCost * holdingCostRate));
}

function computeMetrics(d: {
  annualDemand: number | null | undefined;
  annualDemandSource: string;
  orderingCost: number | null | undefined;
  orderingCostSource: string;
  unitCost: number;
  holdingCostRate: number | null | undefined;
  holdingCostRateSource: string;
}) {
  const canCalculateEoq =
    d.annualDemand != null &&
    d.annualDemand > 0 &&
    isSupportedPlanningSource(d.annualDemandSource) &&
    d.orderingCost != null &&
    d.orderingCost > 0 &&
    isSupportedPlanningSource(d.orderingCostSource) &&
    d.unitCost > 0 &&
    d.holdingCostRate != null &&
    d.holdingCostRate > 0 &&
    isSupportedPlanningSource(d.holdingCostRateSource);

  const eoq = canCalculateEoq
    ? calcEOQ(d.annualDemand!, d.orderingCost!, d.unitCost, d.holdingCostRate!)
    : null;

  return {
    eoq,
    eoqSource: eoq == null ? "UNKNOWN" as const : "CALCULATED_FROM_VERIFIED_INPUTS" as const,
    safetyStock: null,
    safetyStockSource: "UNKNOWN" as const,
    reorderPoint: null,
    reorderPointSource: "UNKNOWN" as const,
  };
}

// Derive status string from stock levels
function deriveStatus(item: {
  currentStock: number;
  availableQuantity: number;
  reservationShortage: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  maxStock: number | null | undefined;
}) {
  if (item.reservationShortage > 0) return "critical";

  if (item.availableQuantity <= 0) return "out_of_stock";

  if (item.safetyStock != null && item.safetyStock > 0 && item.availableQuantity <= item.safetyStock) {
    return "critical";
  }

  if (item.reorderPoint != null && item.reorderPoint > 0 && item.availableQuantity <= item.reorderPoint) {
    return "low_stock";
  }

  if (item.maxStock != null && item.currentStock > item.maxStock) {
    return "overstock";
  }

  return "healthy";
}

// ── GET /inventory/relationships ──────────────────────────────────────────────
router.get("/inventory/relationships", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;

  const productSuppliers = await db
    .select({
      supplierId: productSuppliersTable.supplierId,
      supplierOdooId: suppliersTable.odooId,
      supplierName: suppliersTable.name,
      productId: productSuppliersTable.inventoryItemId,
      productOdooId: inventoryItemsTable.odooId,
      productName: inventoryItemsTable.name,
      sku: inventoryItemsTable.sku,
    })
    .from(productSuppliersTable)
    .innerJoin(suppliersTable, eq(productSuppliersTable.supplierId, suppliersTable.id))
    .innerJoin(inventoryItemsTable, eq(productSuppliersTable.inventoryItemId, inventoryItemsTable.id))
    .where(eq(productSuppliersTable.companyId, companyId));

  const poLines = await db
    .select({
      supplierId: purchaseOrderLinesTable.supplierId,
      supplierOdooId: suppliersTable.odooId,
      supplierName: suppliersTable.name,
      productId: purchaseOrderLinesTable.inventoryItemId,
      productOdooId: inventoryItemsTable.odooId,
      productName: inventoryItemsTable.name,
      sku: inventoryItemsTable.sku,
      remainingQuantity: purchaseOrderLinesTable.remainingQuantity,
      status: purchaseOrderLinesTable.status,
    })
    .from(purchaseOrderLinesTable)
    .innerJoin(suppliersTable, eq(purchaseOrderLinesTable.supplierId, suppliersTable.id))
    .innerJoin(inventoryItemsTable, eq(purchaseOrderLinesTable.inventoryItemId, inventoryItemsTable.id))
    .where(eq(purchaseOrderLinesTable.companyId, companyId));

  const map = new Map<string, any>();

  for (const ps of productSuppliers) {
    const key = `${ps.supplierId}-${ps.productId}`;
    map.set(key, {
      ...ps,
      activePoCount: 0,
      inboundQty: 0,
      hasActivePo: false,
      relationshipSource: "product_supplier"
    });
  }

  for (const po of poLines) {
    if (po.supplierId === null || po.productId === null) continue;

    // Only count POs that are active (pending) and have remaining quantity
    const isActivePo = po.status === 'pending' && (po.remainingQuantity || 0) > 0;
    if (!isActivePo) continue;

    const key = `${po.supplierId}-${po.productId}`;
    const existing = map.get(key);

    if (existing) {
      existing.activePoCount += 1;
      existing.inboundQty += Number(po.remainingQuantity || 0);
      existing.hasActivePo = true;
      existing.relationshipSource = existing.relationshipSource === "product_supplier" ? "both" : "purchase_order_line";
    } else {
      map.set(key, {
        supplierId: po.supplierId,
        supplierOdooId: po.supplierOdooId,
        supplierName: po.supplierName,
        productId: po.productId,
        productOdooId: po.productOdooId,
        productName: po.productName,
        sku: po.sku,
        activePoCount: 1,
        inboundQty: Number(po.remainingQuantity || 0),
        hasActivePo: true,
        relationshipSource: "purchase_order_line"
      });
    }
  }

  res.json(Array.from(map.values()));
});

// ── GET /inventory ─────────────────────────────────────────────────────────────
router.get("/inventory", async (req: Request, res: Response): Promise<void> => {
  const { search, category, warehouse, supplier, status, archived } = req.query as Record<string, string>;

  let items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.companyId, req.user!.companyId)).orderBy(inventoryItemsTable.name);

  // Archive filter — default to active only
  if (archived === "true") {
    items = items.filter(i => i.archived);
  } else if (archived === "all") {
    // return everything
  } else {
    items = items.filter(i => !i.archived);
  }

  if (search) {
    const q = search.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q) ||
      (i.barcode ?? "").toLowerCase().includes(q) ||
      (i.supplierName ?? "").toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.warehouse ?? "").toLowerCase().includes(q)
    );
  }
  if (category) items = items.filter(i => i.category.toLowerCase() === category.toLowerCase());
  if (warehouse) items = items.filter(i => (i.warehouse ?? "").toLowerCase() === warehouse.toLowerCase());
  if (supplier) items = items.filter(i => (i.supplierName ?? "").toLowerCase() === supplier.toLowerCase());
  if (status) {
    items = items.filter(i => deriveStatus(i) === status);
  }

  res.json(items);
});

// ── GET /inventory/kpis ────────────────────────────────────────────────────────
router.get("/inventory/kpis", async (req: Request, res: Response): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.companyId, req.user!.companyId), eq(inventoryItemsTable.archived, false)));

  let totalValue = 0, lowStockCount = 0, criticalCount = 0, outOfStockCount = 0, overstockCount = 0;
  let totalTurnover = 0, totalDaysOnHand = 0, turnoverItemCount = 0;

  for (const item of items) {
    totalValue += item.currentStock * item.unitCost;
    const s = deriveStatus(item);
    if (s === "out_of_stock") outOfStockCount++;
    else if (s === "critical") criticalCount++;
    else if (s === "low_stock") lowStockCount++;
    else if (s === "overstock") overstockCount++;

    if (item.annualDemand != null && item.annualDemand > 0 && item.unitCost > 0 && item.maxStock != null) {
      const avgInventoryValue = (item.maxStock / 2) * item.unitCost;
      const cogsAnnual = item.annualDemand * item.unitCost;

      if (avgInventoryValue > 0) {
        const turnover = cogsAnnual / avgInventoryValue;
        totalTurnover += turnover;
        totalDaysOnHand += 365 / turnover;
        turnoverItemCount++;
      }
    }
  }

  res.json({
    totalValue,
    totalSkus: items.length,
    lowStockCount,
    criticalCount,
    outOfStockCount,
    overstockCount,
    avgTurnoverRate: turnoverItemCount > 0 ? totalTurnover / turnoverItemCount : null,
    avgDaysOnHand: turnoverItemCount > 0 ? totalDaysOnHand / turnoverItemCount : null,
  });
});

// ── GET /inventory/reorder-suggestions ────────────────────────────────────────
router.get("/inventory/reorder-suggestions", async (req: Request, res: Response): Promise<void> => {
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(and(
      eq(inventoryItemsTable.companyId, req.user!.companyId),
      eq(inventoryItemsTable.archived, false),
      gt(inventoryItemsTable.reservationShortage, 0),
    ));

  const suggestions = items.map(item => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    currentStock: item.currentStock,
    availableQuantity: item.availableQuantity,
    reservationShortage: item.reservationShortage,
    incomingQuantity: item.incomingQuantity,
    safetyStock: null,
    reorderPoint: null,
    eoq: null,
    recommendedOrderQty: null,
    planningStatus: "NOT_DETERMINABLE" as const,
    reason: "RESERVATION_SHORTAGE" as const,
    priority: "high" as const,
    warehouse: item.warehouse ?? "",
    supplierName: item.supplierName ?? "",
  }));

  res.json(suggestions);
});

// ── GET /inventory/reorder-alerts ─────────────────────────────────────────────
router.get("/inventory/reorder-alerts", async (req: Request, res: Response): Promise<void> => {
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(and(
      eq(inventoryItemsTable.companyId, req.user!.companyId),
      eq(inventoryItemsTable.archived, false),
      gt(inventoryItemsTable.reservationShortage, 0),
    ));

  res.json(items.map(item => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    currentStock: item.currentStock,
    availableQuantity: item.availableQuantity,
    reservationShortage: item.reservationShortage,
    incomingQuantity: item.incomingQuantity,
    reason: "RESERVATION_SHORTAGE" as const,
  })));
});

// ── GET /inventory/movements ───────────────────────────────────────────────────
router.get("/inventory/movements", async (req: Request, res: Response): Promise<void> => {
  const { inventoryItemId, movementType } = req.query as Record<string, string>;
  let movements = await db
    .select({
      id: stockMovementsTable.id,
      inventoryItemId: stockMovementsTable.inventoryItemId,
      movedAt: stockMovementsTable.movedAt,
      user: stockMovementsTable.user,
      movementType: stockMovementsTable.movementType,
      action: stockMovementsTable.action,
      referenceNumber: stockMovementsTable.referenceNumber,
      reason: stockMovementsTable.reason,
      warehouse: stockMovementsTable.warehouse,
      quantityBefore: stockMovementsTable.quantityBefore,
      quantityChanged: stockMovementsTable.quantityChanged,
      quantityAfter: stockMovementsTable.quantityAfter,
      itemName: inventoryItemsTable.name,
      itemSku: inventoryItemsTable.sku,
    })
    .from(stockMovementsTable)
    .innerJoin(inventoryItemsTable, eq(stockMovementsTable.inventoryItemId, inventoryItemsTable.id))
    .where(eq(stockMovementsTable.companyId, req.user!.companyId))
    .orderBy(sql`${stockMovementsTable.movedAt} DESC`);

  if (inventoryItemId) movements = movements.filter(m => m.inventoryItemId === parseInt(inventoryItemId));
  if (movementType) movements = movements.filter(m => m.movementType === movementType);
  res.json(movements);
});

// ── GET /inventory/:id ────────────────────────────────────────────────────────
router.get("/inventory/:id", async (req: Request, res: Response): Promise<void> => {
  const params = GetInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [item] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, params.data.id), eq(inventoryItemsTable.companyId, req.user!.companyId)));
  if (!item) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.json(item);
});

// ── POST /inventory ───────────────────────────────────────────────────────────
router.post("/inventory", async (req: Request, res: Response): Promise<void> => {
  const result = validateBody(StrictInventoryBody, req, res);
  if (!result.ok) return;
  const parsed = result;
  const planningSources = {
    annualDemandSource: sourceForUserValue(parsed.data.annualDemand),
    orderingCostSource: sourceForUserValue(parsed.data.orderingCost),
    holdingCostRateSource: sourceForUserValue(parsed.data.holdingCostRate),
    leadTimeSource: sourceForUserValue(parsed.data.leadTimeDays),
  };

  const metrics = computeMetrics({
    annualDemand: parsed.data.annualDemand,
    annualDemandSource: planningSources.annualDemandSource,
    orderingCost: parsed.data.orderingCost,
    orderingCostSource: planningSources.orderingCostSource,
    unitCost: parsed.data.unitCost,
    holdingCostRate: parsed.data.holdingCostRate,
    holdingCostRateSource: planningSources.holdingCostRateSource,
  });

  const [item] = await db
    .insert(inventoryItemsTable)
    .values({
      ...parsed.data,
      companyId: req.user!.companyId,
      ...planningSources,
      ...metrics,
    })
    .returning();

  res.status(201).json(item);
});

// ── PATCH /inventory/:id ──────────────────────────────────────────────────────
router.patch("/inventory/:id", async (req: Request, res: Response): Promise<void> => {
  const params = UpdateInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const result = validateBody(StrictInventoryPatch, req, res);
  if (!result.ok) return;
  const parsed = result;
  const [existing] = await db.select().from(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, params.data.id), eq(inventoryItemsTable.companyId, req.user!.companyId)));
  if (!existing) { res.status(404).json({ error: "Inventory item not found" }); return; }
  const planningSourceUpdates = {
    ...(parsed.data.annualDemand !== undefined
      ? { annualDemandSource: sourceForUserValue(parsed.data.annualDemand) }
      : {}),
    ...(parsed.data.orderingCost !== undefined
      ? { orderingCostSource: sourceForUserValue(parsed.data.orderingCost) }
      : {}),
    ...(parsed.data.holdingCostRate !== undefined
      ? { holdingCostRateSource: sourceForUserValue(parsed.data.holdingCostRate) }
      : {}),
    ...(parsed.data.leadTimeDays !== undefined
      ? { leadTimeSource: sourceForUserValue(parsed.data.leadTimeDays) }
      : {}),
  };

  const merged = {
    ...existing,
    ...parsed.data,
    ...planningSourceUpdates,
  };

  const planningInputsChanged =
    parsed.data.annualDemand !== undefined ||
    parsed.data.orderingCost !== undefined ||
    parsed.data.unitCost !== undefined ||
    parsed.data.holdingCostRate !== undefined ||
    parsed.data.leadTimeDays !== undefined;

  const metrics = planningInputsChanged
    ? computeMetrics({
      annualDemand: merged.annualDemand,
      annualDemandSource: merged.annualDemandSource,
      orderingCost: merged.orderingCost,
      orderingCostSource: merged.orderingCostSource,
      unitCost: merged.unitCost,
      holdingCostRate: merged.holdingCostRate,
      holdingCostRateSource: merged.holdingCostRateSource,
    })
    : {
      eoq: existing.eoq,
      eoqSource: existing.eoqSource,
      safetyStock: existing.safetyStock,
      safetyStockSource: existing.safetyStockSource,
      reorderPoint: existing.reorderPoint,
      reorderPointSource: existing.reorderPointSource,
    };

  const [updated] = await db
    .update(inventoryItemsTable)
    .set({
      ...parsed.data,
      ...planningSourceUpdates,
      ...metrics,
    })
    .where(and(
      eq(inventoryItemsTable.id, params.data.id),
      eq(inventoryItemsTable.companyId, req.user!.companyId),
    ))
    .returning();

  res.json(updated);
});

// ── DELETE /inventory/:id ─────────────────────────────────────────────────────
router.delete("/inventory/:id", async (req: Request, res: Response): Promise<void> => {
  const params = DeleteInventoryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db.delete(inventoryItemsTable).where(and(eq(inventoryItemsTable.id, params.data.id), eq(inventoryItemsTable.companyId, req.user!.companyId))).returning();
  if (!deleted) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.sendStatus(204);
});

// ── Stricter movement schema ───────────────────────────────────────────────────
const StrictMovementBody = CreateStockMovementBody.extend({
  movementType: z.string().min(1, "Movement type is required"),
  action: z.string().min(2, "Action description is required"),
  quantityChanged: z.number().int("Quantity must be a whole number").refine(v => v !== 0, { message: "Quantity must be non-zero" }),
  user: z.string().min(1, "Operator name is required"),
});

// ── POST /inventory/:id/movements ─────────────────────────────────────────────
router.post("/inventory/:id/movements", async (req: Request, res: Response): Promise<void> => {
  const params = CreateStockMovementParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = validateBody(StrictMovementBody, req, res);
  if (!parsed.ok) return;

  try {
    const movement = await db.transaction(async (tx) => {
      // Lock the row for the duration of the transaction so concurrent
      // movements on the same item can't read a stale currentStock.
      const [item] = await tx
        .select()
        .from(inventoryItemsTable)
        .where(and(eq(inventoryItemsTable.id, params.data.id), eq(inventoryItemsTable.companyId, req.user!.companyId)))
        .for("update");
      if (!item) throw new NotFoundError("Inventory item not found");

      const quantityBefore = item.currentStock;
      const quantityAfter = quantityBefore + parsed.data.quantityChanged;
      if (quantityAfter < 0) {
        throw new InsufficientStockError(
          `Movement would take stock below zero (current: ${quantityBefore}, change: ${parsed.data.quantityChanged})`,
        );
      }

      const [inserted] = await tx.insert(stockMovementsTable).values({
        companyId: req.user!.companyId,
        inventoryItemId: item.id,
        user: parsed.data.user,
        movementType: parsed.data.movementType,
        action: parsed.data.action,
        referenceNumber: parsed.data.referenceNumber ?? null,
        reason: parsed.data.reason ?? null,
        warehouse: parsed.data.warehouse ?? item.warehouse ?? null,
        quantityBefore,
        quantityChanged: parsed.data.quantityChanged,
        quantityAfter,
      }).returning();

      await tx.update(inventoryItemsTable).set({ currentStock: quantityAfter }).where(eq(inventoryItemsTable.id, item.id));

      return inserted;
    });

    res.status(201).json(movement);
  } catch (err) {
    if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return; }
    if (err instanceof InsufficientStockError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
});

export default router;
