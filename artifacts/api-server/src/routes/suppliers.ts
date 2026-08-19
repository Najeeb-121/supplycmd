import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, suppliersTable } from "@workspace/db";
import {
  CreateSupplierBody,
  UpdateSupplierBody,
  UpdateSupplierParams,
  DeleteSupplierParams,
} from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter supplier schemas ──────────────────────────────────────────────────
export const StrictSupplierBody = CreateSupplierBody.extend({
  name:                z.string().min(1, "Supplier name is required"),
  country:             z.string().min(1, "Country is required"),
  leadTimeDays:        z.number().int().min(0).max(365).optional(),
  onTimeDeliveryRate:  z.number().min(0).max(100).optional(),
  qualityScore:        z.number().min(0).max(100).optional(),
  fillRate:            z.number().min(0).max(100).optional(),
});

const StrictSupplierPatch = UpdateSupplierBody.extend({
  name:                z.string().min(1, "Supplier name is required").optional(),
  country:             z.string().min(1, "Country is required").optional(),
  leadTimeDays:        z.number().int().min(0).max(365).optional(),
  onTimeDeliveryRate:  z.number().min(0).max(100).optional(),
  qualityScore:        z.number().min(0).max(100).optional(),
  fillRate:            z.number().min(0).max(100).optional(),
});

const router: IRouter = Router();

router.get("/suppliers", async (req, res): Promise<void> => {
  const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, req.user!.companyId)).orderBy(suppliersTable.name);
  res.json(suppliers);
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = validateBody(StrictSupplierBody, req, res);
  if (!parsed.ok) return;

  const [supplier] = await db.insert(suppliersTable).values({ ...parsed.data, companyId: req.user!.companyId }).returning();
  res.status(201).json(supplier);
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = validateBody(StrictSupplierPatch, req, res);
  if (!parsed.ok) return;

  const [updated] = await db
    .update(suppliersTable)
    .set(parsed.data)
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.companyId, req.user!.companyId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(updated);
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [deleted] = await db.delete(suppliersTable).where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.companyId, req.user!.companyId))).returning();
  if (!deleted) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.sendStatus(204);
});

export default router;