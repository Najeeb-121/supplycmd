import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, and, isNotNull, notInArray } from "drizzle-orm";
import { db, suppliersTable, inventoryItemsTable, odooSyncLogTable, odooConnectionsTable, ordersTable, stockMovementsTable, productionRunsTable, demandRecordsTable } from "@workspace/db";
import { OdooClient, encryptSecret, decryptSecret, type OdooConfig } from "@workspace/integrations-odoo-server";
import { StrictSupplierBody } from "./suppliers";
import { StrictInventoryBody } from "./inventory";
import { validateBody } from "../lib/validate";
import { z } from "zod";

const router: IRouter = Router();

function num(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v)) || 0;
}

// Odoo represents an empty many2one as `false`, not null — normalize to a
// plain string, taking the display name (index 1) of the [id, name] tuple.
function many2oneLabel(v: unknown, fallback: string): string {
  return Array.isArray(v) && typeof v[1] === "string" ? v[1] : fallback;
}

async function getCompanyOdooConfig(companyId: number): Promise<OdooConfig | null> {
  const [row] = await db.select().from(odooConnectionsTable).where(eq(odooConnectionsTable.companyId, companyId));
  if (!row) return null;
  return { url: row.url, db: row.db, username: row.username, apiKey: decryptSecret(row.apiKeyEncrypted) };
}

// ── POST /integrations/odoo/test-connection ───────────────────────────────────
router.post("/integrations/odoo/test-connection", async (req: Request, res: Response): Promise<void> => {
  const config = await getCompanyOdooConfig(req.user!.companyId);
  if (!config) {
    res.json({ connected: false, odooVersion: null, error: "No Odoo connection configured for this company yet" });
    return;
  }
  try {
    const client = new OdooClient(config);
    const version = await client.version();
    await client.authenticate();
    res.json({
      connected: true,
      odooVersion: typeof version.server_version === "string" ? version.server_version : "unknown",
      error: null,
    });
  } catch (err) {
    req.log.warn({ err }, "Odoo connection test failed");
    res.json({ connected: false, odooVersion: null, error: (err as Error).message });
  }
});

// ── GET /integrations/odoo/connection ───────────────────────────────────────────
router.get("/integrations/odoo/connection", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.select().from(odooConnectionsTable).where(eq(odooConnectionsTable.companyId, req.user!.companyId));
  if (!row) {
    res.json({ connected: false, url: null, db: null, username: null, error: null });
    return;
  }
  res.json({ connected: true, url: row.url, db: row.db, username: row.username, error: null });
});

const OdooConnectionInputSchema = z.object({
  url: z.string().url("Enter a valid URL, e.g. https://yourcompany.odoo.com"),
  db: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  apiKey: z.string().min(1, "API key is required"),
});

// ── PUT /integrations/odoo/connection ───────────────────────────────────────────
router.put("/integrations/odoo/connection", async (req: Request, res: Response): Promise<void> => {
  const parsed = validateBody(OdooConnectionInputSchema, req, res);
  if (!parsed.ok) return;

  const config: OdooConfig = { url: parsed.data.url.replace(/\/+$/, ""), db: parsed.data.db, username: parsed.data.username, apiKey: parsed.data.apiKey };

  try {
    const client = new OdooClient(config);
    await client.authenticate();
  } catch (err) {
    res.status(400).json({ connected: false, url: null, db: null, username: null, error: (err as Error).message });
    return;
  }

  const apiKeyEncrypted = encryptSecret(config.apiKey);
  await db
    .insert(odooConnectionsTable)
    .values({ companyId: req.user!.companyId, url: config.url, db: config.db, username: config.username, apiKeyEncrypted })
    .onConflictDoUpdate({
      target: odooConnectionsTable.companyId,
      set: { url: config.url, db: config.db, username: config.username, apiKeyEncrypted },
    });

  res.json({ connected: true, url: config.url, db: config.db, username: config.username, error: null });
});

// ── POST /integrations/odoo/sync/suppliers ─────────────────────────────────────
router.post("/integrations/odoo/sync/suppliers", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);
  if (!config) {
    res.status(400).json({ synced: 0, failed: 0, errors: ["No Odoo connection configured for this company yet"] });
    return;
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  try {
    const client = new OdooClient(config);
    let partners: Record<string, unknown>[] = [];
    try {
      partners = await client.searchRead<Record<string, unknown>>(
        "res.partner",
        [["category_id.name", "=", "Vendor"], ["parent_id", "=", false]],
        ["id", "name", "country_id"],
      );
    } catch (err) {
      // Fallback for older Odoo versions
      partners = await client.searchRead<Record<string, unknown>>(
        "res.partner",
        [["supplier", "=", true], ["parent_id", "=", false]],
        ["id", "name", "country_id"],
      );
    }

    // Deduplicate by name to avoid showing duplicate vendors in the dashboard
    const uniquePartnersMap = new Map<string, Record<string, unknown>>();
    for (const p of partners) {
      const name = String(p.name ?? "");
      if (name && !uniquePartnersMap.has(name)) {
        uniquePartnersMap.set(name, p);
      }
    }
    const uniquePartners = Array.from(uniquePartnersMap.values());

    for (const p of uniquePartners) {
      const odooId = p.id as number;
      const name = String(p.name ?? "");
      const candidate = {
        name,
        country: many2oneLabel(p.country_id, "Unknown"),
        leadTimeDays: 7,
        onTimeDeliveryRate: 95,
        qualityScore: 90,
        fillRate: 97,
      };
      const validated = StrictSupplierBody.safeParse(candidate);
      if (!validated.success) {
        failed++;
        errors.push(`${name || `#${odooId}`}: ${validated.error.issues.map((i) => i.message).join("; ")}`);
        continue;
      }
      try {
        await db
          .insert(suppliersTable)
          .values({ ...validated.data, companyId, odooId })
          .onConflictDoUpdate({
            target: [suppliersTable.companyId, suppliersTable.odooId],
            set: { name: validated.data.name, country: validated.data.country },
          });
        synced++;
      } catch (err) {
        failed++;
        errors.push(`${name || `#${odooId}`}: ${(err as Error).message}`);
      }
    }

    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = uniquePartners.map(p => p.id as number);
    if (fetchedIds.length > 0) {
      await db.delete(suppliersTable)
        .where(and(
          eq(suppliersTable.companyId, companyId),
          isNotNull(suppliersTable.odooId),
          notInArray(suppliersTable.odooId, fetchedIds)
        ));
    } else if (failed === 0) {
      // If zero items were fetched and there were no errors, everything was deleted in Odoo
      await db.delete(suppliersTable)
        .where(and(
          eq(suppliersTable.companyId, companyId),
          isNotNull(suppliersTable.odooId)
        ));
    }

    const status = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "suppliers",
      status,
      recordsSynced: synced,
      recordsFailed: failed,
      message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    });

    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Odoo supplier sync failed");
    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "suppliers",
      status: "error",
      recordsSynced: synced,
      recordsFailed: failed,
      message: (err as Error).message,
    });
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

// ── POST /integrations/odoo/sync/inventory ─────────────────────────────────────
router.post("/integrations/odoo/sync/inventory", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);
  if (!config) {
    res.status(400).json({ synced: 0, failed: 0, errors: ["No Odoo connection configured for this company yet"] });
    return;
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  try {
    const client = new OdooClient(config);
    const products = await client.searchRead<Record<string, unknown>>(
      "product.product",
      [],
      ["id", "name", "default_code", "standard_price", "qty_available", "categ_id"],
    );

    for (const p of products) {
      const odooId = p.id as number;
      const name = String(p.name ?? "");
      const sku = typeof p.default_code === "string" ? p.default_code.trim() : "";
      if (!sku) {
        failed++;
        errors.push(`${name || `#${odooId}`}: no default_code (SKU) set in Odoo — skipped`);
        continue;
      }

      const candidate = {
        name,
        sku,
        category: many2oneLabel(p.categ_id, "Uncategorized"),
        currentStock: Math.round(num(p.qty_available)),
        unitCost: num(p.standard_price),
        annualDemand: 0,
        holdingCostRate: 0.25,
        orderingCost: 0,
        leadTimeDays: 7,
      };
      const validated = StrictInventoryBody.safeParse(candidate);
      if (!validated.success) {
        failed++;
        errors.push(`${sku}: ${validated.error.issues.map((i) => i.message).join("; ")}`);
        continue;
      }
      try {
        await db
          .insert(inventoryItemsTable)
          .values({ ...validated.data, companyId, odooId })
          .onConflictDoUpdate({
            target: [inventoryItemsTable.companyId, inventoryItemsTable.odooId],
            set: {
              name: validated.data.name,
              currentStock: validated.data.currentStock,
              unitCost: validated.data.unitCost,
              category: validated.data.category,
            },
          });
        synced++;
      } catch (err) {
        failed++;
        errors.push(`${sku}: ${(err as Error).message}`);
      }
    }

    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = products.map(p => p.id as number);
    if (fetchedIds.length > 0) {
      await db.delete(inventoryItemsTable)
        .where(and(
          eq(inventoryItemsTable.companyId, companyId),
          isNotNull(inventoryItemsTable.odooId),
          notInArray(inventoryItemsTable.odooId, fetchedIds)
        ));
    } else if (failed === 0) {
      // If zero items were fetched and there were no errors, everything was deleted in Odoo
      await db.delete(inventoryItemsTable)
        .where(and(
          eq(inventoryItemsTable.companyId, companyId),
          isNotNull(inventoryItemsTable.odooId)
        ));
    }

    const status = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "inventory",
      status,
      recordsSynced: synced,
      recordsFailed: failed,
      message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    });

    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Odoo inventory sync failed");
    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "inventory",
      status: "error",
      recordsSynced: synced,
      recordsFailed: failed,
      message: (err as Error).message,
    });
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

// ── POST /integrations/odoo/sync/procurement ───────────────────────────────────
router.post("/integrations/odoo/sync/procurement", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);
  if (!config) {
    res.status(400).json({ synced: 0, failed: 0, errors: ["No Odoo connection configured for this company yet"] });
    return;
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  try {
    const client = new OdooClient(config);
    const purchases = await client.searchRead<Record<string, unknown>>(
      "purchase.order",
      [],
      ["id", "name", "partner_id", "amount_total", "state", "date_order", "date_planned"]
    );

    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
    const supplierMap = new Map<number, typeof suppliers[0]>();
    for (const s of suppliers) {
      if (s.odooId) supplierMap.set(s.odooId, s);
    }

    // Auto-fetch missing suppliers
    const missingSupplierIds = new Set<number>();
    for (const p of purchases) {
      const odooSupplierId = Array.isArray(p.partner_id) ? (p.partner_id[0] as number) : 0;
      if (odooSupplierId && !supplierMap.has(odooSupplierId)) {
        missingSupplierIds.add(odooSupplierId);
      }
    }

    if (missingSupplierIds.size > 0) {
      try {
        const missingPartners = await client.searchRead<Record<string, unknown>>(
          "res.partner",
          [["id", "in", Array.from(missingSupplierIds)]],
          ["id", "name", "country_id"]
        );

        for (const p of missingPartners) {
          const odooId = p.id as number;
          const name = String(p.name ?? "");
          const candidate = {
            name,
            country: many2oneLabel(p.country_id, "Unknown"),
            leadTimeDays: 7,
            onTimeDeliveryRate: 95,
            qualityScore: 90,
            fillRate: 97,
          };
          const validated = StrictSupplierBody.safeParse(candidate);
          if (validated.success) {
            const [inserted] = await db
              .insert(suppliersTable)
              .values({ ...validated.data, companyId, odooId })
              .onConflictDoUpdate({
                target: [suppliersTable.companyId, suppliersTable.odooId],
                set: { name: validated.data.name, country: validated.data.country },
              })
              .returning();
            supplierMap.set(odooId, inserted);
          }
        }
      } catch (err) {
        req.log.warn({ err }, "Failed to auto-fetch missing suppliers during procurement sync");
      }
    }

    for (const p of purchases) {
      const odooId = p.id as number;
      const odooSupplierId = Array.isArray(p.partner_id) ? (p.partner_id[0] as number) : 0;
      
      const supplier = supplierMap.get(odooSupplierId);
      if (!supplier) {
        failed++;
        errors.push(`PO #${odooId}: Supplier (Odoo ID ${odooSupplierId}) not found in local Suppliers table.`);
        continue;
      }

      const dateOrder = typeof p.date_order === "string" ? p.date_order.split(" ")[0] : new Date().toISOString().split("T")[0];
      const datePlanned = typeof p.date_planned === "string" ? p.date_planned.split(" ")[0] : dateOrder;
      
      let status = "pending";
      if (p.state === "purchase" || p.state === "done") status = "confirmed";
      if (p.state === "done") status = "delivered";
      if (p.state === "cancel") status = "cancelled";

      const candidate = {
        companyId,
        odooId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalValue: num(p.amount_total),
        status,
        orderDate: dateOrder,
        expectedDelivery: datePlanned,
        itemCount: 1,
      };

      try {
        await db
          .insert(ordersTable)
          .values(candidate)
          .onConflictDoUpdate({
            target: [ordersTable.companyId, ordersTable.odooId],
            set: {
              totalValue: candidate.totalValue,
              status: candidate.status,
              expectedDelivery: candidate.expectedDelivery,
            },
          });
        synced++;
      } catch (err) {
        failed++;
        errors.push(`PO #${odooId}: ${(err as Error).message}`);
      }
    }

    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = purchases.map(p => p.id as number);
    if (fetchedIds.length > 0) {
      await db.delete(ordersTable)
        .where(and(
          eq(ordersTable.companyId, companyId),
          isNotNull(ordersTable.odooId),
          notInArray(ordersTable.odooId, fetchedIds)
        ));
    } else if (failed === 0) {
      // If zero items were fetched and there were no errors, everything was deleted in Odoo
      await db.delete(ordersTable)
        .where(and(
          eq(ordersTable.companyId, companyId),
          isNotNull(ordersTable.odooId)
        ));
    }

    const status = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "procurement",
      status,
      recordsSynced: synced,
      recordsFailed: failed,
      message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    });

    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Odoo procurement sync failed");
    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "procurement",
      status: "error",
      recordsSynced: synced,
      recordsFailed: failed,
      message: (err as Error).message,
    });
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

// ── GET /integrations/odoo/sync-log ─────────────────────────────────────────────
router.get("/integrations/odoo/sync-log", async (req: Request, res: Response): Promise<void> => {
  const logs = await db
    .select()
    .from(odooSyncLogTable)
    .where(eq(odooSyncLogTable.companyId, req.user!.companyId))
    .orderBy(desc(odooSyncLogTable.syncedAt))
    .limit(50);
  res.json(logs);
});

// ── POST /integrations/odoo/sync/logistics ───────────────────────────────────
router.post("/integrations/odoo/sync/logistics", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);
  if (!config) { res.status(400).json({ synced: 0, failed: 0, errors: ["No connection configured"] }); return; }

  const errors: string[] = [];
  let synced = 0; let failed = 0;

  try {
    const client = new OdooClient(config);
    const moves = await client.searchRead<Record<string, unknown>>(
      "stock.move", [["state", "=", "done"]], ["id", "product_id", "date", "picking_type_id", "product_uom_qty", "reference"]
    );
    const items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.companyId, companyId));
    const itemMap = new Map<number, number>();
    for (const item of items) if (item.odooId) itemMap.set(item.odooId, item.id);

    for (const m of moves) {
      const odooId = m.id as number;
      const odooProductId = Array.isArray(m.product_id) ? (m.product_id[0] as number) : 0;
      const inventoryItemId = itemMap.get(odooProductId);
      if (!inventoryItemId) {
        failed++; errors.push(`Move #${odooId}: Product not synced.`); continue;
      }
      try {
        await db.insert(stockMovementsTable).values({
          companyId, odooId, inventoryItemId,
          movementType: "transfer", action: "completed",
          referenceNumber: String(m.reference ?? ""),
          quantityBefore: 0, quantityChanged: num(m.product_uom_qty), quantityAfter: num(m.product_uom_qty),
        }).onConflictDoUpdate({
          target: [stockMovementsTable.companyId, stockMovementsTable.odooId],
          set: { quantityChanged: num(m.product_uom_qty) },
        });
        synced++;
      } catch (err) { failed++; errors.push(`Move #${odooId}: ${(err as Error).message}`); }
    }
    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = moves.map(p => p.id as number);
    if (fetchedIds.length > 0) {
      await db.delete(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.companyId, companyId),
          isNotNull(stockMovementsTable.odooId),
          notInArray(stockMovementsTable.odooId, fetchedIds)
        ));
    } else if (failed === 0) {
      // If zero items were fetched and there were no errors, everything was deleted in Odoo
      await db.delete(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.companyId, companyId),
          isNotNull(stockMovementsTable.odooId)
        ));
    }

    const status = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    await db.insert(odooSyncLogTable).values({ companyId, entity: "logistics", status, recordsSynced: synced, recordsFailed: failed, message: errors.slice(0, 5).join(" | ") || null });
    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Logistics sync failed");
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

// ── POST /integrations/odoo/sync/production ──────────────────────────────────
router.post("/integrations/odoo/sync/production", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);
  if (!config) { res.status(400).json({ synced: 0, failed: 0, errors: ["No connection configured"] }); return; }

  const errors: string[] = [];
  let synced = 0; let failed = 0;

  try {
    const client = new OdooClient(config);
    const mfgOrders = await client.searchRead<Record<string, unknown>>(
      "mrp.production", [], ["id", "product_id", "product_qty", "qty_producing", "date_start", "state"]
    ).catch(() => { throw new Error("MRP module may not be installed in Odoo"); });

    for (const mo of mfgOrders) {
      const odooId = mo.id as number;
      const productName = many2oneLabel(mo.product_id, "Unknown Product");
      const runDate = typeof mo.date_start === "string" ? mo.date_start.split(" ")[0] : new Date().toISOString().split("T")[0];
      try {
        await db.insert(productionRunsTable).values({
          companyId, odooId, productName, runDate,
          plannedUnits: num(mo.product_qty), actualUnits: num(mo.qty_producing),
          plannedTimeMin: 120, actualTimeMin: 120,
        }).onConflictDoUpdate({
          target: [productionRunsTable.companyId, productionRunsTable.odooId],
          set: { actualUnits: num(mo.qty_producing) }
        });
        synced++;
      } catch (err) { failed++; errors.push(`MO #${odooId}: ${(err as Error).message}`); }
    }
    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = mfgOrders.map(p => p.id as number);
    if (fetchedIds.length > 0) {
      await db.delete(productionRunsTable)
        .where(and(
          eq(productionRunsTable.companyId, companyId),
          isNotNull(productionRunsTable.odooId),
          notInArray(productionRunsTable.odooId, fetchedIds)
        ));
    } else if (failed === 0) {
      // If zero items were fetched and there were no errors, everything was deleted in Odoo
      await db.delete(productionRunsTable)
        .where(and(
          eq(productionRunsTable.companyId, companyId),
          isNotNull(productionRunsTable.odooId)
        ));
    }

    const status = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    await db.insert(odooSyncLogTable).values({ companyId, entity: "production", status, recordsSynced: synced, recordsFailed: failed, message: errors.slice(0, 5).join(" | ") || null });
    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Production sync failed");
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

// ── POST /integrations/odoo/sync/planning ────────────────────────────────────
router.post("/integrations/odoo/sync/planning", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);
  if (!config) { res.status(400).json({ synced: 0, failed: 0, errors: ["No connection configured"] }); return; }

  const errors: string[] = [];
  let synced = 0; let failed = 0;

  try {
    const client = new OdooClient(config);
      let syncedMps = false;
      try {
        const schedules = await client.searchRead<Record<string, unknown>>(
          "mrp.production.schedule", [], ["id", "product_id"]
        );
        const scheduleToProduct = new Map<number, unknown>();
        for (const s of schedules) scheduleToProduct.set(s.id as number, s.product_id);

        const forecasts = await client.searchRead<Record<string, unknown>>(
          "mrp.product.forecast", [], ["id", "production_schedule_id", "date", "create_date", "forecast_qty", "replenish_qty"]
        );

        if (forecasts.length > 0) {
          syncedMps = true;
          for (const line of forecasts) {
            const odooId = line.id as number;
            const scheduleId = Array.isArray(line.production_schedule_id) ? line.production_schedule_id[0] : 0;
            const productId = scheduleToProduct.get(scheduleId);
            const productName = many2oneLabel(productId, "Unknown Product");
            
            let period = "2024-01";
            const dateVal = line.date || line.create_date;
            if (typeof dateVal === "string" && dateVal.length >= 7) period = dateVal.substring(0, 7);
            
            const targetQty = num(line.forecast_qty) || 0;
            const actualQty = num(line.replenish_qty) || 0;
            
            try {
              await db.insert(demandRecordsTable).values({
                companyId, odooId, productName, period,
                actualDemand: actualQty, forecastedDemand: targetQty,
              }).onConflictDoUpdate({
                target: [demandRecordsTable.companyId, demandRecordsTable.odooId],
                set: { forecastedDemand: targetQty, actualDemand: actualQty }
              });
              synced++;
            } catch (err) { failed++; errors.push(`MPS Forecast #${odooId}: ${(err as Error).message}`); }
          }
        }
      } catch (err) {
        req.log.error({ err }, "MPS Sync failed, falling back to Sales Orders");
        // MPS module might not be installed or missing permissions, ignore and fallback
      }

      if (!syncedMps) {
        // 2. Fallback to Sales Order Lines if no MPS
        const lines = await client.searchRead<Record<string, unknown>>(
          "sale.order.line", [["state", "in", ["sale", "done"]]], ["id", "product_id", "product_uom_qty", "create_date"]
        );

        for (const line of lines) {
          const odooId = line.id as number;
          const productName = many2oneLabel(line.product_id, "Unknown Product");
          let period = "2024-01";
          if (typeof line.create_date === "string" && line.create_date.length >= 7) period = line.create_date.substring(0, 7);
          
          try {
            await db.insert(demandRecordsTable).values({
              companyId, odooId, productName, period,
              actualDemand: num(line.product_uom_qty), forecastedDemand: num(line.product_uom_qty) * 1.1,
            }).onConflictDoUpdate({
              target: [demandRecordsTable.companyId, demandRecordsTable.odooId],
              set: { actualDemand: num(line.product_uom_qty) }
            });
            synced++;
          } catch (err) { failed++; errors.push(`SO Line #${odooId}: ${(err as Error).message}`); }
        }
      }

      // Cleanup phase: remove local records that no longer exist in Odoo
      // Cleanup logic is omitted for Planning due to fallback structure and scope issues


      const status = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    await db.insert(odooSyncLogTable).values({ companyId, entity: "planning", status, recordsSynced: synced, recordsFailed: failed, message: errors.slice(0, 5).join(" | ") || null });
    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Planning sync failed");
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

export default router;