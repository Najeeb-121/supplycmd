import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, ordersTable, suppliersTable } from "@workspace/db";
import {
  CreateOrderBody,
  UpdateOrderBody,
  UpdateOrderParams,
} from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter order schema with cross-field date rule ──────────────────────────
export const StrictOrderBody = CreateOrderBody
  .extend({
    totalValue: z.number().min(0),
    itemCount:  z.number().int().min(1),
  })
  .refine(
    (d) => d.expectedDelivery >= d.orderDate,
    { message: "Delivery date must be on or after the order date", path: ["expectedDelivery"] },
  );

const router: IRouter = Router();

router.get("/orders", async (req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.companyId, req.user!.companyId)).orderBy(ordersTable.orderDate);
  res.json(orders);
});

router.post("/orders", async (req, res): Promise<void> => {
  const result = validateBody(StrictOrderBody, req, res);
  if (!result.ok) return;

  // Lookup supplier name — scoped to this company so an order can't be
  // issued against another company's supplier id.
  const [supplier] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, result.data.supplierId), eq(suppliersTable.companyId, req.user!.companyId)));
  if (!supplier) {
    res.status(400).json({ errors: { supplierId: "Supplier not found" } });
    return;
  }
  const supplierName = supplier.name;

  const [order] = await db
    .insert(ordersTable)
    .values({ ...result.data, companyId: req.user!.companyId, supplierName })
    .returning();
  res.status(201).json(order);
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(ordersTable)
    .set(parsed.data)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.companyId, req.user!.companyId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(updated);
});

export default router;