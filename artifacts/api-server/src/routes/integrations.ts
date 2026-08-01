import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, and } from "drizzle-orm";
import { db, suppliersTable, inventoryItemsTable, odooSyncLogTable, odooConnectionsTable } from "@workspace/db";
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
    const partners = await client.searchRead<Record<string, unknown>>(
      "res.partner",
      [["supplier_rank", ">", 0]],
      ["id", "name", "country_id"],
    );

    for (const p of partners) {
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

export default router;