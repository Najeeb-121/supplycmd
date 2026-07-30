import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, ordersTable, suppliersTable } from "@workspace/db";
import {
  CreateOrderBody,
  UpdateOrderBody,
  UpdateOrderParams,
} from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter order schema with cross-field date rule ──────────────────────────
const StrictOrderBody = CreateOrderBody
  .extend({
    totalValue: z.number().min(0),
    itemCount:  z.number().int().min(1),
  })
  .refine(
    (d) => d.expectedDelivery >= d.orderDate,
    { message: "Delivery date must be on or after the order date", path: ["expectedDelivery"] },
  );

const router: IRouter = Router();

router.get("/orders", async (_req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable).orderBy(ordersTable.orderDate);
  res.json(orders);
});

router.post("/orders", async (req, res): Promise<void> => {
  const result = validateBody(StrictOrderBody, req, res);
  if (!result.ok) return;

  // Lookup supplier name
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, result.data.supplierId));
  if (!supplier) {
    res.status(400).json({ errors: { supplierId: "Supplier not found" } });
    return;
  }
  const supplierName = supplier.name;

  const [order] = await db
    .insert(ordersTable)
    .values({ ...result.data, supplierName })
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
    .where(eq(ordersTable.id, params.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(updated);
});

export default router;
