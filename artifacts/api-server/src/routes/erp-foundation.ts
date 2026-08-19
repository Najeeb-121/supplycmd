import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, suppliersTable, purchaseOrderLinesTable, ordersTable, inventoryItemsTable } from "@workspace/db";
import { type DataValue } from "@workspace/db/simulation-types";

const router: IRouter = Router();

function wrap<T>(value: T | null | undefined, status: DataValue<T>["status"] = "VERIFIED", source: string = "ERP"): DataValue<T> {
  if (value === null || value === undefined) {
    return { value: null, status: "MISSING", source, confidence: "LOW" };
  }
  return { value, status, source, confidence: "HIGH" };
}

// ── Canonical Supplier API ─────────────────────────────────────────────────────
router.get("/erp/suppliers", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;
  const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId)).orderBy(suppliersTable.name);
  
  // Wrap into canonical objects
  const canonical = suppliers.map(s => ({
    id: String(s.id),
    name: wrap(s.name),
    country: wrap(s.country),
    supplierCode: wrap(s.supplierCode),
    active: wrap(s.active),
    currency: wrap(s.currency),
    paymentTerms: wrap(s.paymentTerms),
    // Performance metrics are NOT part of the raw supplier fact in the new foundation, unless explicitly synced from Odoo Vendor pricelist or similar.
    // We explicitly mark them as MISSING if they aren't provided by the integration.
    leadTimeDays: wrap(s.leadTimeDays, s.leadTimeDays ? "VERIFIED" : "MISSING", s.leadTimeDays ? undefined : "Not explicitly defined in Vendor info"),
  }));
  
  res.json(canonical);
});



export default router;
