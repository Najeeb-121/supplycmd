import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, and, isNotNull, notInArray, sql } from "drizzle-orm";
import { db, suppliersTable, inventoryItemsTable, odooSyncLogTable, odooConnectionsTable, ordersTable, stockMovementsTable, productionRunsTable, demandRecordsTable, salesOrdersTable, salesOrderLinesTable, bomsTable, bomLinesTable, purchaseOrderLinesTable, productSuppliersTable } from "@workspace/db";
import { OdooClient, encryptSecret, decryptSecret, type OdooConfig } from "@workspace/integrations-odoo-server";
import { StrictSupplierBody } from "./suppliers";
import { StrictInventoryBody } from "./inventory";
import { validateBody } from "../lib/validate";
import { z } from "zod";

const router: IRouter = Router();

const StrictOdooSupplierBody = StrictSupplierBody.extend({
  country: z.string().min(1).nullable(),
});

export function num(v: unknown): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : Number.NaN;
  }

  if (typeof v !== "string" || !v.trim()) {
    return Number.NaN;
  }

  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseNonNegativeOdooNumber(
  value: unknown,
): number | null {
  const parsed = num(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}

export function parsePositiveOdooNumber(
  value: unknown,
): number | null {
  const parsed = num(value);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

export type OdooWorkOrderTiming = {
  plannedTimeMin: number;
  actualTimeMin: number | null;
};

export function parseOdooWorkOrderTiming(
  workOrders: Record<string, unknown>[],
): OdooWorkOrderTiming | null {
  if (workOrders.length === 0) {
    return null;
  }

  let plannedTimeMin = 0;
  let actualTimeMin = 0;
  let hasCompleteActualTiming = true;

  for (const workOrder of workOrders) {
    const expectedDuration = parsePositiveOdooNumber(
      workOrder.duration_expected,
    );

    if (expectedDuration === null) {
      return null;
    }

    plannedTimeMin += expectedDuration;

    if (workOrder.state !== "done") {
      hasCompleteActualTiming = false;
      continue;
    }

    const actualDuration = parseNonNegativeOdooNumber(
      workOrder.duration,
    );

    if (actualDuration === null) {
      hasCompleteActualTiming = false;
      continue;
    }

    actualTimeMin += actualDuration;
  }

  if (!Number.isFinite(plannedTimeMin)) {
    return null;
  }

  return {
    plannedTimeMin,
    actualTimeMin:
      hasCompleteActualTiming &&
        Number.isFinite(actualTimeMin)
        ? actualTimeMin
        : null,
  };
}

export function parsePositiveOdooId(value: unknown): number | null {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  )
    ? value
    : null;
}
export type OdooCleanupDecision =
  | "delete_missing"
  | "delete_all"
  | "preserve_failed"
  | "preserve_suspicious_empty";

export function getOdooCleanupDecision(
  fetchedRecordCount: number,
  failedRecordCount: number,
  localRecordCount: number,
): OdooCleanupDecision {
  if (failedRecordCount > 0) {
    return "preserve_failed";
  }

  if (fetchedRecordCount > 0) {
    return "delete_missing";
  }

  if (localRecordCount > 5) {
    return "preserve_suspicious_empty";
  }

  return "delete_all";
}

export function optionalOdooString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export type OdooStockMovementQuantities = {
  quantityBefore: null;
  quantityChanged: number;
  quantityAfter: null;
};

export function parseOdooStockMovementQuantities(
  value: unknown,
): OdooStockMovementQuantities | null {
  const quantityChanged = num(value);

  if (!Number.isFinite(quantityChanged)) {
    return null;
  }

  return {
    quantityBefore: null,
    quantityChanged,
    quantityAfter: null,
  };
}

export function parseOdooDateTime(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  // Odoo stores datetime fields in UTC and returns them without a timezone.
  const parsed = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null;
  }

  return parsed;
}

export type VerifiedOdooStockMovementType =
  | "goods_receipt"
  | "goods_issue"
  | "transfer"
  | "return";

export function mapOdooStockMovementType(
  pickingTypeCode: unknown,
  originReturnedMove: unknown,
): VerifiedOdooStockMovementType | null {
  if (many2oneId(originReturnedMove) !== null) {
    return "return";
  }

  switch (pickingTypeCode) {
    case "incoming":
      return "goods_receipt";
    case "outgoing":
      return "goods_issue";
    case "internal":
      return "transfer";
    default:
      return null;
  }
}

export type OdooOrderStatus =
  | "pending"
  | "confirmed"
  | "delivered"
  | "cancelled";

export function mapOdooPurchaseState(
  value: unknown,
): OdooOrderStatus | null {
  switch (value) {
    case "draft":
    case "sent":
    case "to approve":
      return "pending";
    case "purchase":
      return "confirmed";
    case "done":
      return "delivered";
    case "cancel":
      return "cancelled";
    default:
      return null;
  }
}

function many2oneId(v: unknown): number | null {
  return Array.isArray(v)
    ? parsePositiveOdooId(v[0])
    : null;
}


async function getCompanyOdooConfig(companyId: number): Promise<OdooConfig | null> {
  const [row] = await db.select().from(odooConnectionsTable).where(eq(odooConnectionsTable.companyId, companyId));
  if (!row) return null;
  return { url: row.url, db: row.db, username: row.username, apiKey: decryptSecret(row.apiKeyEncrypted) };
}

function generateSyncMessage(synced: number, failed: number, errors: string[]): string {
  if (failed === 0 && errors.length === 0) {
    return `Successfully synchronized ${synced} records from the ERP system.`;
  }

  const cleanErrors = errors.map(e => e.replace(/^.*?:\s*/, '')); // Strip "Name: " prefix if present for cleaner sentences

  if (failed > 0 && synced > 0) {
    let msg = `Partial synchronization completed. Successfully synced ${synced} records, but failed to sync ${failed} records. Reason: ${cleanErrors[0]}`;
    if (errors.length > 1) msg += ` and ${errors.length - 1} other issues.`;
    else if (!msg.endsWith('.')) msg += ".";
    return msg;
  }

  if (synced === 0 && failed > 0) {
    let msg = `Synchronization failed for all ${failed} records. Reason: ${cleanErrors[0]}`;
    if (errors.length > 1) msg += ` and ${errors.length - 1} other issues.`;
    else if (!msg.endsWith('.')) msg += ".";
    return msg;
  }

  let msg = `Synchronization completed with warnings. ${cleanErrors[0]}`;
  if (errors.length > 1) msg += ` and ${errors.length - 1} other issues.`;
  else if (!msg.endsWith('.')) msg += ".";
  return msg;
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

  const companyId = req.user!.companyId;
  const apiKeyEncrypted = encryptSecret(config.apiKey);

  const [existingConnection] = await db
    .select()
    .from(odooConnectionsTable)
    .where(eq(odooConnectionsTable.companyId, companyId));

  const erpIdentityChanged =
    existingConnection !== undefined &&
    (
      existingConnection.url.replace(/\/+$/, "") !== config.url ||
      existingConnection.db !== config.db
    );

  await db.transaction(async (tx) => {
    if (erpIdentityChanged) {
      // These parent deletes cascade to their dependent ERP rows.
      await tx.delete(salesOrdersTable).where(
        and(
          eq(salesOrdersTable.companyId, companyId),
          isNotNull(salesOrdersTable.odooId),
        ),
      );

      await tx.delete(ordersTable).where(
        and(
          eq(ordersTable.companyId, companyId),
          isNotNull(ordersTable.odooId),
        ),
      );

      await tx.delete(bomsTable).where(
        and(
          eq(bomsTable.companyId, companyId),
          isNotNull(bomsTable.odooBomId),
        ),
      );

      await tx.delete(stockMovementsTable).where(
        and(
          eq(stockMovementsTable.companyId, companyId),
          isNotNull(stockMovementsTable.odooId),
        ),
      );

      await tx.delete(productionRunsTable).where(
        and(
          eq(productionRunsTable.companyId, companyId),
          isNotNull(productionRunsTable.odooId),
        ),
      );

      await tx.delete(demandRecordsTable).where(
        and(
          eq(demandRecordsTable.companyId, companyId),
          isNotNull(demandRecordsTable.odooId),
        ),
      );

      await tx.delete(suppliersTable).where(
        and(
          eq(suppliersTable.companyId, companyId),
          isNotNull(suppliersTable.odooId),
        ),
      );

      await tx.delete(inventoryItemsTable).where(
        and(
          eq(inventoryItemsTable.companyId, companyId),
          isNotNull(inventoryItemsTable.odooId),
        ),
      );
    }

    await tx
      .insert(odooConnectionsTable)
      .values({
        companyId,
        url: config.url,
        db: config.db,
        username: config.username,
        apiKeyEncrypted,
      })
      .onConflictDoUpdate({
        target: odooConnectionsTable.companyId,
        set: {
          url: config.url,
          db: config.db,
          username: config.username,
          apiKeyEncrypted,
        },
      });
  });

  res.json({
    connected: true,
    url: config.url,
    db: config.db,
    username: config.username,
    error: null,
  });
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
    const existingSuppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
    const existingSupplierByOdooId = new Map<
      number,
      (typeof existingSuppliers)[number]
    >();

    for (const supplier of existingSuppliers) {
      const odooId = parsePositiveOdooId(supplier.odooId);

      if (odooId !== null) {
        existingSupplierByOdooId.set(odooId, supplier);
      }
    }

    const existingSupplierIds = new Set(
      existingSupplierByOdooId.keys(),
    );
    const poData = await db.select().from(ordersTable).where(eq(ordersTable.companyId, companyId));

    let partners: Record<string, unknown>[] = [];
    let supplierInfoRows: Record<string, unknown>[] = [];

    try {
      supplierInfoRows = await client.searchRead<Record<string, unknown>>(
        "product.supplierinfo",
        [],
        [
          "id",
          "partner_id",
          "product_id",
          "product_tmpl_id",
          "product_code",
          "price",
          "currency_id",
          "min_qty",
          "delay",
          "sequence",
        ],
      );


      const supplierInfoPartnerIds = Array.from(
        new Set(
          supplierInfoRows
            .map((row) => many2oneId(row.partner_id))
            .filter((id): id is number => id !== null),
        ),
      );

      const tags = await client.searchRead<{ id: number; name: string }>(
        "res.partner.category",
        [["name", "ilike", "Vendor"]],
        ["id", "name"],
      );

      const tagIds = tags.map((tag) => tag.id);

      const domain: any[] = [["parent_id", "=", false]];

      if (supplierInfoPartnerIds.length > 0) {
        if (tagIds.length > 0) {
          domain.unshift(
            "|",
            "|",
            ["id", "in", supplierInfoPartnerIds],
            ["supplier_rank", ">", 0],
            ["category_id", "in", tagIds],
          );
        } else {
          domain.unshift(
            "|",
            ["id", "in", supplierInfoPartnerIds],
            ["supplier_rank", ">", 0],
          );
        }
      } else if (tagIds.length > 0) {
        domain.unshift(
          "|",
          ["supplier_rank", ">", 0],
          ["category_id", "in", tagIds],
        );
      } else {
        domain.push(["supplier_rank", ">", 0]);
      }

      partners = await client.searchRead<Record<string, unknown>>(
        "res.partner",
        domain,
        ["id", "name", "country_id"],
      );
    } catch (err) {

      partners = await client.searchRead<Record<string, unknown>>(
        "res.partner",
        [["supplier", "=", true], ["parent_id", "=", false]],
        ["id", "name", "country_id"],
      );
    }


    for (const p of partners) {
      const odooId = parsePositiveOdooId(p.id);
      const name = optionalOdooString(p.name);

      if (odooId === null || name === null) {
        failed++;
        errors.push(
          `Supplier record has an invalid Odoo ID or missing name.`,
        );
        continue;
      }

      // Calculate metrics only from orders linked to this exact supplier.
      const existingSupplier = existingSupplierByOdooId.get(odooId);
      const supplierPOs =
        existingSupplier === undefined
          ? []
          : poData.filter(
            (po) => po.supplierId === existingSupplier.id,
          );
      let leadTimeDays: number | null = null;
      let onTimeDeliveryRate: number | null = null;

      if (supplierPOs.length > 0) {
        let totalLeadTime = 0;
        let onTimeCount = 0;
        let deliveredCount = 0;

        for (const po of supplierPOs) {
          const orderTime = new Date(po.orderDate).getTime();
          const expectedTime = new Date(po.expectedDelivery).getTime();
          totalLeadTime += (expectedTime - orderTime) / (1000 * 60 * 60 * 24);

          if (po.actualDelivery) {
            deliveredCount++;
            const actualTime = new Date(po.actualDelivery).getTime();
            if (actualTime <= expectedTime) {
              onTimeCount++;
            }
          }
        }
        leadTimeDays = supplierPOs.length > 0 ? Math.round(totalLeadTime / supplierPOs.length) : null;
        onTimeDeliveryRate = deliveredCount > 0 ? Math.round((onTimeCount / deliveredCount) * 100) : null;
      }

      const candidate = {
        name,
        country: optionalOdooString(
          Array.isArray(p.country_id) ? p.country_id[1] : null,
        ),
        leadTimeDays,
        onTimeDeliveryRate,
        qualityScore: null,
        fillRate: null,
      };
      const validated = StrictOdooSupplierBody.safeParse(candidate);
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
            set: {
              name: validated.data.name,
              country: validated.data.country,
              ...(validated.data.leadTimeDays != null
                ? { leadTimeDays: validated.data.leadTimeDays }
                : {}),
              ...(validated.data.onTimeDeliveryRate != null
                ? {
                  onTimeDeliveryRate:
                    validated.data.onTimeDeliveryRate,
                }
                : {}),
            },
          });
        synced++;
      } catch (err) {
        failed++;
        errors.push(`${name || `#${odooId}`}: ${(err as Error).message}`);
      }
    }

    // Synchronize Odoo vendor pricelist relationships after supplier masters exist.
    if (supplierInfoRows.length > 0) {
      const currentSuppliers = await db
        .select()
        .from(suppliersTable)
        .where(eq(suppliersTable.companyId, companyId));

      const currentInventory = await db
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.companyId, companyId));

      const existingProductSuppliers = await db
        .select()
        .from(productSuppliersTable)
        .where(eq(productSuppliersTable.companyId, companyId));

      const supplierByOdooId = new Map<number, (typeof currentSuppliers)[number]>();

      for (const supplier of currentSuppliers) {
        const supplierOdooId = parsePositiveOdooId(supplier.odooId);

        if (supplierOdooId !== null) {
          supplierByOdooId.set(supplierOdooId, supplier);
        }
      }

      const inventoryByOdooProductId = new Map<
        number,
        (typeof currentInventory)[number]
      >();

      const inventoryByOdooTemplateId = new Map<
        number,
        (typeof currentInventory)[number]
      >();

      for (const item of currentInventory) {
        const productOdooId = parsePositiveOdooId(item.odooId);
        const templateOdooId = parsePositiveOdooId(
          item.odooProductTemplateId,
        );

        if (productOdooId !== null) {
          inventoryByOdooProductId.set(productOdooId, item);
        }

        if (templateOdooId !== null) {
          inventoryByOdooTemplateId.set(templateOdooId, item);
        }
      }

      const existingRelationshipByKey = new Map(
        existingProductSuppliers.map((relationship) => [
          `${relationship.inventoryItemId}:${relationship.supplierId}`,
          relationship,
        ]),
      );

      type SupplierInfoCandidate = {
        inventoryItem: (typeof currentInventory)[number];
        supplier: (typeof currentSuppliers)[number];
        supplierSkuCode: string | null;
        supplierUnitCost: number | null;
        currency: string | null;
        minimumOrderQuantity: number | null;
        leadTimeDays: number | null;
        sequence: number;
      };

      const relationshipByKey = new Map<string, SupplierInfoCandidate>();

      for (const row of supplierInfoRows) {
        const supplierOdooId = many2oneId(row.partner_id);
        const productOdooId = many2oneId(row.product_id);
        const templateOdooId = many2oneId(row.product_tmpl_id);

        if (supplierOdooId === null) continue;

        const supplier = supplierByOdooId.get(supplierOdooId);

        const inventoryItem =
          (productOdooId !== null
            ? inventoryByOdooProductId.get(productOdooId)
            : undefined) ??
          (templateOdooId !== null
            ? inventoryByOdooTemplateId.get(templateOdooId)
            : undefined);

        if (!supplier || !inventoryItem) continue;

        const supplierUnitCost = parseNonNegativeOdooNumber(row.price);
        const minimumOrderQuantity = parseNonNegativeOdooNumber(row.min_qty);
        const leadTimeDays = parseNonNegativeOdooNumber(row.delay);
        const sequence = parseNonNegativeOdooNumber(row.sequence) ?? 0;

        const currency =
          Array.isArray(row.currency_id) &&
            typeof row.currency_id[1] === "string"
            ? row.currency_id[1]
            : null;

        const candidate: SupplierInfoCandidate = {
          inventoryItem,
          supplier,
          supplierSkuCode: optionalOdooString(row.product_code),
          supplierUnitCost,
          currency,
          minimumOrderQuantity,
          leadTimeDays,
          sequence,
        };

        const key = `${inventoryItem.id}:${supplier.id}`;
        const previous = relationshipByKey.get(key);

        // One local relationship exists per product/supplier pair.
        // Prefer Odoo's lower sequence, then the lower MOQ tier.
        if (
          !previous ||
          candidate.sequence < previous.sequence ||
          (
            candidate.sequence === previous.sequence &&
            (candidate.minimumOrderQuantity ?? 0) <
            (previous.minimumOrderQuantity ?? 0)
          )
        ) {
          relationshipByKey.set(key, candidate);
        }
      }

      const preferredSequenceByItem = new Map<number, number>();

      for (const candidate of relationshipByKey.values()) {
        const currentPreferredSequence = preferredSequenceByItem.get(
          candidate.inventoryItem.id,
        );

        if (
          currentPreferredSequence === undefined ||
          candidate.sequence < currentPreferredSequence
        ) {
          preferredSequenceByItem.set(
            candidate.inventoryItem.id,
            candidate.sequence,
          );
        }
      }

      for (const [key, candidate] of relationshipByKey) {
        const existingRelationship = existingRelationshipByKey.get(key);

        // Never overwrite a relationship created outside the Odoo
        // product.supplierinfo synchronization.
        if (
          existingRelationship &&
          !(
            existingRelationship.source.toLowerCase() === "odoo" &&
            existingRelationship.sourceEntity === "product.supplierinfo"
          )
        ) {
          continue;
        }

        const preferredSupplier =
          candidate.sequence ===
          preferredSequenceByItem.get(candidate.inventoryItem.id);

        await db
          .insert(productSuppliersTable)
          .values({
            companyId,
            inventoryItemId: candidate.inventoryItem.id,
            supplierId: candidate.supplier.id,
            supplierSkuCode: candidate.supplierSkuCode,
            supplierUnitCost: candidate.supplierUnitCost,
            currency: candidate.currency,
            minimumOrderQuantity: candidate.minimumOrderQuantity,
            orderMultiple: null,
            leadTimeDays: candidate.leadTimeDays,
            preferredSupplier,
            source: "Odoo",
            sourceEntity: "product.supplierinfo",
          })
          .onConflictDoUpdate({
            target: [
              productSuppliersTable.inventoryItemId,
              productSuppliersTable.supplierId,
            ],
            set: {
              supplierSkuCode: candidate.supplierSkuCode,
              supplierUnitCost: candidate.supplierUnitCost,
              currency: candidate.currency,
              minimumOrderQuantity: candidate.minimumOrderQuantity,
              leadTimeDays: candidate.leadTimeDays,
              preferredSupplier,
              source: "Odoo",
              sourceEntity: "product.supplierinfo",
            },
          });
      }
    }

    let syncStatus = failed === 0 ? "success" : synced > 0 ? "partial" : "error";

    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = Array.from(
      new Set(
        partners
          .map((partner) => parsePositiveOdooId(partner.id))
          .filter((id): id is number => id !== null),
      ),
    );

    // Category 2: Log warning for omitted previously synced suppliers
    const missingIds = Array.from(existingSupplierIds).filter(
      (id) => !fetchedIds.includes(id),
    );
    if (missingIds.length > 0) {
      req.log.warn({ missingIds }, "Suppliers missing from sync, potentially due to tag removal. They will be removed if auto-delete proceeds.");
    }

    const cleanupDecision = getOdooCleanupDecision(
      fetchedIds.length,
      failed,
      existingSupplierIds.size,
    );

    if (cleanupDecision === "delete_missing") {
      await db.delete(suppliersTable)
        .where(and(
          eq(suppliersTable.companyId, companyId),
          isNotNull(suppliersTable.odooId),
          notInArray(suppliersTable.odooId, fetchedIds),
        ));
    } else if (cleanupDecision === "delete_all") {
      await db.delete(suppliersTable)
        .where(and(
          eq(suppliersTable.companyId, companyId),
          isNotNull(suppliersTable.odooId),
        ));
    } else if (
      cleanupDecision === "preserve_suspicious_empty"
    ) {
      syncStatus = "suspicious_empty_result";
      errors.push(
        `Suspicious empty result. Local record count (${existingSupplierIds.size}) > 5. Skipping auto-delete.`,
      );
    }

    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "suppliers",
      status: syncStatus,
      recordsSynced: synced,
      recordsFailed: failed,
      message: generateSyncMessage(synced, failed, errors),
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
      ["id", "name", "default_code", "standard_price", "qty_available", "categ_id", "product_tmpl_id"],
    );

    for (const p of products) {
      const odooId = parsePositiveOdooId(p.id);
      const odooProductTemplateId = many2oneId(
        p.product_tmpl_id,
      );
      const name = optionalOdooString(p.name);
      const sku = optionalOdooString(p.default_code);

      if (
        odooId === null ||
        odooProductTemplateId === null ||
        name === null ||
        sku === null
      ) {
        failed++;
        errors.push(
          "Product has an invalid Odoo ID, template ID, name, or SKU.",
        );
        continue;
      }

      const candidate = {
        name,
        sku,
        category:
          optionalOdooString(
            Array.isArray(p.categ_id) ? p.categ_id[1] : null,
          ) ?? "Uncategorized",
        currentStock: num(p.qty_available),
        unitCost: num(p.standard_price),
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
          .values({
            ...validated.data,
            companyId,
            odooId,
            odooProductTemplateId,
          })
          .onConflictDoUpdate({
            target: [inventoryItemsTable.companyId, inventoryItemsTable.odooId],
            set: {
              odooProductTemplateId,
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

    let syncStatus = failed === 0 ? "success" : synced > 0 ? "partial" : "error";

    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = Array.from(
      new Set(
        products
          .map((product) => parsePositiveOdooId(product.id))
          .filter((id): id is number => id !== null),
      ),
    );
    let localRecordCount = 0;

    if (fetchedIds.length === 0 && failed === 0) {
      const allRows = await db
        .select({ id: inventoryItemsTable.id })
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.companyId, companyId),
            isNotNull(inventoryItemsTable.odooId),
          ),
        );

      localRecordCount = allRows.length;
    }

    const cleanupDecision = getOdooCleanupDecision(
      fetchedIds.length,
      failed,
      localRecordCount,
    );

    if (cleanupDecision === "delete_missing") {
      await db.delete(inventoryItemsTable)
        .where(and(
          eq(inventoryItemsTable.companyId, companyId),
          isNotNull(inventoryItemsTable.odooId),
          notInArray(inventoryItemsTable.odooId, fetchedIds),
        ));
    } else if (cleanupDecision === "delete_all") {
      await db.delete(inventoryItemsTable)
        .where(and(
          eq(inventoryItemsTable.companyId, companyId),
          isNotNull(inventoryItemsTable.odooId),
        ));
    } else if (
      cleanupDecision === "preserve_suspicious_empty"
    ) {
      syncStatus = "suspicious_empty_result";
      errors.push(
        `Suspicious empty result. Local record count (${localRecordCount}) > 5. Skipping auto-delete.`,
      );
    }

    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "inventory",
      status: syncStatus,
      recordsSynced: synced,
      recordsFailed: failed,
      message: generateSyncMessage(synced, failed, errors),
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
      [
        "id",
        "name",
        "partner_id",
        "amount_total",
        "state",
        "date_order",
        "date_planned",
        "order_line",
      ]
    );
    const purchaseOdooIds = purchases
      .map((purchase) => parsePositiveOdooId(purchase.id))
      .filter((id): id is number => id !== null);

    const purchaseLines =
      purchaseOdooIds.length > 0
        ? await client.searchRead<Record<string, unknown>>(
          "purchase.order.line",
          [["order_id", "in", purchaseOdooIds]],
          [
            "id",
            "order_id",
            "product_id",
            "product_qty",
            "qty_received",
            "price_unit",
            "currency_id",
            "date_planned",
          ],
        )
        : [];

    const purchaseLinesByOrderId = new Map<number, Record<string, unknown>[]>();

    for (const line of purchaseLines) {
      const orderOdooId = many2oneId(line.order_id);
      if (orderOdooId === null) continue;

      const grouped = purchaseLinesByOrderId.get(orderOdooId) ?? [];
      grouped.push(line);
      purchaseLinesByOrderId.set(orderOdooId, grouped);
    }

    const inventoryItems = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.companyId, companyId));

    const inventoryByOdooId = new Map<
      number,
      (typeof inventoryItems)[number]
    >();

    for (const item of inventoryItems) {
      const itemOdooId = parsePositiveOdooId(item.odooId);
      if (itemOdooId !== null) {
        inventoryByOdooId.set(itemOdooId, item);
      }
    }

    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
    const supplierMap = new Map<number, (typeof suppliers)[number]>();

    for (const supplier of suppliers) {
      const odooId = parsePositiveOdooId(supplier.odooId);

      if (odooId !== null) {
        supplierMap.set(odooId, supplier);
      }
    }

    // Auto-fetch missing suppliers
    const missingSupplierIds = new Set<number>();
    for (const purchase of purchases) {
      const odooSupplierId = many2oneId(purchase.partner_id);

      if (
        odooSupplierId !== null &&
        !supplierMap.has(odooSupplierId)
      ) {
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
          const odooId = parsePositiveOdooId(p.id);
          const name = optionalOdooString(p.name);

          if (odooId === null || name === null) {
            req.log.warn(
              { partner: p },
              "Skipping invalid auto-fetched Odoo supplier",
            );
            continue;
          }
          const candidate = {
            name,
            country: optionalOdooString(
              Array.isArray(p.country_id) ? p.country_id[1] : null,
            ),
            leadTimeDays: null,
            onTimeDeliveryRate: null,
            qualityScore: null,
            fillRate: null,
          };
          const validated = StrictOdooSupplierBody.safeParse(candidate);
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
      const odooId = parsePositiveOdooId(p.id);
      const odooSupplierId = many2oneId(p.partner_id);

      if (odooId === null || odooSupplierId === null) {
        failed++;
        errors.push(
          "Purchase order has an invalid Odoo ID or supplier ID.",
        );
        continue;
      }

      const supplier = supplierMap.get(odooSupplierId);
      if (!supplier) {
        failed++;
        errors.push(`PO #${odooId}: Supplier (Odoo ID ${odooSupplierId}) not found in local Suppliers table.`);
        continue;
      }

      const dateOrder =
        typeof p.date_order === "string" && p.date_order.trim()
          ? p.date_order.split(" ")[0]
          : null;

      if (!dateOrder) {
        failed++;
        errors.push(`PO #${odooId}: Missing date_order.`);
        continue;
      }

      const datePlanned =
        typeof p.date_planned === "string" && p.date_planned.trim()
          ? p.date_planned.split(" ")[0]
          : null;

      if (!datePlanned) {
        failed++;
        errors.push(`PO #${odooId}: Missing date_planned.`);
        continue;
      }

      const orderLineIds = Array.isArray(p.order_line)
        ? p.order_line
        : null;

      if (!orderLineIds || orderLineIds.length === 0) {
        failed++;
        errors.push(`PO #${odooId}: No purchase order lines were returned.`);
        continue;
      }

      const status = mapOdooPurchaseState(p.state);

      if (!status) {
        failed++;
        errors.push(
          `PO #${odooId}: Unsupported Odoo state "${String(p.state)}".`,
        );
        continue;
      }

      const candidate = {
        companyId,
        odooId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalValue: num(p.amount_total),
        status,
        orderDate: dateOrder,
        expectedDelivery: datePlanned,
        itemCount: orderLineIds.length,
      };

      try {
        const [localOrder] = await db
          .insert(ordersTable)
          .values(candidate)
          .onConflictDoUpdate({
            target: [ordersTable.companyId, ordersTable.odooId],
            set: {
              totalValue: candidate.totalValue,
              status: candidate.status,
              expectedDelivery: candidate.expectedDelivery,
            },
          })
          .returning({ id: ordersTable.id });

        const odooLines = purchaseLinesByOrderId.get(odooId) ?? [];

        // The line table has no unique Odoo-ID constraint.
        // Replace this PO's synchronized lines to keep repeated syncs idempotent.
        await db
          .delete(purchaseOrderLinesTable)
          .where(
            and(
              eq(purchaseOrderLinesTable.companyId, companyId),
              eq(purchaseOrderLinesTable.orderId, localOrder.id),
            ),
          );

        for (const line of odooLines) {
          const lineOdooId = parsePositiveOdooId(line.id);
          const productOdooId = many2oneId(line.product_id);

          if (lineOdooId === null || productOdooId === null) {
            throw new Error("Purchase-order line has an invalid Odoo ID or product.");
          }

          const inventoryItem = inventoryByOdooId.get(productOdooId);

          if (!inventoryItem) {
            throw new Error(
              `PO line #${lineOdooId}: Odoo product ${productOdooId} was not found in local inventory.`,
            );
          }

          const orderedQuantity = parseNonNegativeOdooNumber(line.product_qty);
          const receivedQuantity = parseNonNegativeOdooNumber(line.qty_received);
          const unitPrice = parseNonNegativeOdooNumber(line.price_unit);

          if (
            orderedQuantity === null ||
            receivedQuantity === null ||
            unitPrice === null
          ) {
            throw new Error(
              `PO line #${lineOdooId}: Invalid quantity or price data.`,
            );
          }

          const expectedDate =
            typeof line.date_planned === "string" && line.date_planned.trim()
              ? line.date_planned.split(" ")[0]
              : datePlanned;

          const currencyTuple =
            Array.isArray(line.currency_id) ? line.currency_id : null;

          const currency =
            currencyTuple &&
              typeof currencyTuple[1] === "string" &&
              currencyTuple[1].trim()
              ? currencyTuple[1]
              : "USD";

          await db.insert(purchaseOrderLinesTable).values({
            companyId,
            orderId: localOrder.id,
            inventoryItemId: inventoryItem.id,
            supplierId: supplier.id,
            odooId: lineOdooId,
            orderedQuantity,
            receivedQuantity,
            remainingQuantity: Math.max(
              orderedQuantity - receivedQuantity,
              0,
            ),
            unitPrice,
            currency,
            status,
            expectedDate,
          });
        }

        synced++;
      } catch (err) {
        failed++;
        errors.push(`PO #${odooId}: ${(err as Error).message}`);
      }
    }

    let syncStatus = failed === 0 ? "success" : synced > 0 ? "partial" : "error";

    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = Array.from(
      new Set(
        purchases
          .map((purchase) => parsePositiveOdooId(purchase.id))
          .filter((id): id is number => id !== null),
      ),
    );
    let localRecordCount = 0;

    if (fetchedIds.length === 0 && failed === 0) {
      const allRows = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.companyId, companyId),
            isNotNull(ordersTable.odooId),
          ),
        );

      localRecordCount = allRows.length;
    }

    const cleanupDecision = getOdooCleanupDecision(
      fetchedIds.length,
      failed,
      localRecordCount,
    );

    if (cleanupDecision === "delete_missing") {
      await db.delete(ordersTable)
        .where(and(
          eq(ordersTable.companyId, companyId),
          isNotNull(ordersTable.odooId),
          notInArray(ordersTable.odooId, fetchedIds),
        ));
    } else if (cleanupDecision === "delete_all") {
      await db.delete(ordersTable)
        .where(and(
          eq(ordersTable.companyId, companyId),
          isNotNull(ordersTable.odooId),
        ));
    } else if (
      cleanupDecision === "preserve_suspicious_empty"
    ) {
      syncStatus = "suspicious_empty_result";
      errors.push(
        `Suspicious empty result. Local record count (${localRecordCount}) > 5. Skipping auto-delete.`,
      );
    }

    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "procurement",
      status: syncStatus,
      recordsSynced: synced,
      recordsFailed: failed,
      message: generateSyncMessage(synced, failed, errors),
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
      "stock.move",
      [["state", "=", "done"]],
      [
        "id",
        "product_id",
        "date",
        "picking_type_id",
        "origin_returned_move_id",
        "product_uom_qty",
        "reference",
      ],

    );
    const pickingTypeIds = Array.from(
      new Set(
        moves
          .map((move) => many2oneId(move.picking_type_id))
          .filter((id): id is number => id !== null),
      ),
    );

    const pickingTypeCodeById = new Map<number, string>();

    if (pickingTypeIds.length > 0) {
      const pickingTypes = await client.searchRead<
        Record<string, unknown>
      >(
        "stock.picking.type",
        [["id", "in", pickingTypeIds]],
        ["id", "code"],
      );

      for (const pickingType of pickingTypes) {
        const id = parsePositiveOdooId(pickingType.id);
        const code =
          typeof pickingType.code === "string" &&
            pickingType.code.trim()
            ? pickingType.code
            : null;

        if (id !== null && code !== null) {
          pickingTypeCodeById.set(id, code);
        }
      }
    }

    const items = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.companyId, companyId));
    const itemMap = new Map<number, number>();

    for (const item of items) {
      const odooId = parsePositiveOdooId(item.odooId);

      if (odooId !== null) {
        itemMap.set(odooId, item.id);
      }
    }

    for (const m of moves) {
      const odooId = parsePositiveOdooId(m.id);
      const odooProductId = many2oneId(m.product_id);

      if (odooId === null || odooProductId === null) {
        failed++;
        errors.push(
          "Stock movement has an invalid Odoo ID or product ID.",
        );
        continue;
      }
      const inventoryItemId = itemMap.get(odooProductId);
      if (!inventoryItemId) {
        failed++; errors.push(`Move #${odooId}: Product not synced.`); continue;
      }
      const quantities = parseOdooStockMovementQuantities(
        m.product_uom_qty,
      );

      if (!quantities) {
        failed++;
        errors.push(`Move #${odooId}: Missing or invalid moved quantity.`);
        continue;
      }

      const movedAt = parseOdooDateTime(m.date);

      if (!movedAt) {
        failed++;
        errors.push(`Move #${odooId}: Missing or invalid movement date.`);
        continue;
      }
      const pickingTypeId = many2oneId(m.picking_type_id);
      const pickingTypeCode =
        pickingTypeId === null
          ? null
          : pickingTypeCodeById.get(pickingTypeId) ?? null;

      const movementType = mapOdooStockMovementType(
        pickingTypeCode,
        m.origin_returned_move_id,
      );

      const referenceNumber = optionalOdooString(m.reference);

      try {
        await db.insert(stockMovementsTable).values({
          companyId,
          odooId,
          inventoryItemId,
          movedAt,
          user: null,
          movementType,
          action: "completed",
          referenceNumber,
          ...quantities,
        }).onConflictDoUpdate({
          target: [
            stockMovementsTable.companyId,
            stockMovementsTable.odooId,
          ],
          set: {
            movedAt,
            user: null,
            movementType,
            referenceNumber,
            ...quantities,
          },
        });
        synced++;
      } catch (err) { failed++; errors.push(`Move #${odooId}: ${(err as Error).message}`); }
    }
    let syncStatus = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = Array.from(
      new Set(
        moves
          .map((move) => parsePositiveOdooId(move.id))
          .filter((id): id is number => id !== null),
      ),
    );
    let localRecordCount = 0;

    if (fetchedIds.length === 0 && failed === 0) {
      const allRows = await db
        .select({ id: stockMovementsTable.id })
        .from(stockMovementsTable)
        .where(
          and(
            eq(stockMovementsTable.companyId, companyId),
            isNotNull(stockMovementsTable.odooId),
          ),
        );

      localRecordCount = allRows.length;
    }

    const cleanupDecision = getOdooCleanupDecision(
      fetchedIds.length,
      failed,
      localRecordCount,
    );

    if (cleanupDecision === "delete_missing") {
      await db.delete(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.companyId, companyId),
          isNotNull(stockMovementsTable.odooId),
          notInArray(stockMovementsTable.odooId, fetchedIds),
        ));
    } else if (cleanupDecision === "delete_all") {
      await db.delete(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.companyId, companyId),
          isNotNull(stockMovementsTable.odooId),
        ));
    } else if (
      cleanupDecision === "preserve_suspicious_empty"
    ) {
      syncStatus = "suspicious_empty_result";
      errors.push(
        `Suspicious empty result. Local record count (${localRecordCount}) > 5. Skipping auto-delete.`,
      );
    }

    await db.insert(odooSyncLogTable).values({ companyId, entity: "logistics", status: syncStatus, recordsSynced: synced, recordsFailed: failed, message: generateSyncMessage(synced, failed, errors) });
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
      "mrp.production", [], ["id", "product_id", "product_qty", "qty_producing", "date_start", "date_deadline", "bom_id", "state"]
    ).catch(() => { throw new Error("MRP module may not be installed in Odoo"); });

    const mfgOrderIds = Array.from(
      new Set(
        mfgOrders
          .map((order) => parsePositiveOdooId(order.id))
          .filter((id): id is number => id !== null),
      ),
    );

    const workOrdersByProductionId = new Map<
      number,
      Record<string, unknown>[]
    >();

    if (mfgOrderIds.length > 0) {
      try {
        const workOrders =
          await client.searchRead<Record<string, unknown>>(
            "mrp.workorder",
            [["production_id", "in", mfgOrderIds]],
            [
              "id",
              "production_id",
              "duration_expected",
              "duration",
              "state",
            ],
          );

        for (const workOrder of workOrders) {
          const workOrderId = parsePositiveOdooId(workOrder.id);
          const productionId = many2oneId(
            workOrder.production_id,
          );

          if (workOrderId === null || productionId === null) {
            failed++;
            errors.push(
              "Work order has an invalid Odoo ID or manufacturing order.",
            );
            continue;
          }

          const groupedWorkOrders =
            workOrdersByProductionId.get(productionId) ?? [];

          groupedWorkOrders.push(workOrder);
          workOrdersByProductionId.set(
            productionId,
            groupedWorkOrders,
          );
        }
      } catch (err) {
        failed++;
        errors.push(
          `Work-order timing unavailable: ${(err as Error).message}`,
        );
        req.log.warn(
          { err },
          "Odoo work-order timing unavailable",
        );
      }
    }

    for (const mo of mfgOrders) {
      const odooId = parsePositiveOdooId(mo.id);
      const odooProductId = many2oneId(mo.product_id);
      const productName = optionalOdooString(
        Array.isArray(mo.product_id) ? mo.product_id[1] : null,
      );
      const bomId = many2oneId(mo.bom_id);

      if (
        odooId === null ||
        odooProductId === null ||
        productName === null
      ) {
        failed++;
        errors.push(
          "Manufacturing order has an invalid Odoo ID or product.",
        );
        continue;
      }
      const moState =
        typeof mo.state === "string" && mo.state.trim()
          ? mo.state
          : null;

      if (!moState) {
        failed++;
        errors.push(`MO #${odooId}: Missing manufacturing-order state.`);
        continue;
      }
      const startedAt = parseOdooDateTime(mo.date_start);
      const deadlineAt = parseOdooDateTime(mo.date_deadline);

      const runDate =
        startedAt === null
          ? null
          : startedAt.toISOString().slice(0, 10);

      const dateDeadline =
        deadlineAt === null
          ? null
          : deadlineAt.toISOString().slice(0, 10);

      const workOrderTiming = parseOdooWorkOrderTiming(
        workOrdersByProductionId.get(odooId) ?? [],
      );

      const plannedTimeMin =
        workOrderTiming?.plannedTimeMin ?? null;

      const actualTimeMin =
        workOrderTiming?.actualTimeMin ?? null;

      const plannedUnits = parseNonNegativeOdooNumber(
        mo.product_qty,
      );
      const actualUnits = parseNonNegativeOdooNumber(
        mo.qty_producing,
      );

      if (plannedUnits === null || actualUnits === null) {
        failed++;
        errors.push(
          `MO #${odooId}: Missing or invalid production quantity.`,
        );
        continue;
      }

      try {
        await db.insert(productionRunsTable).values({
          companyId,
          odooId,
          productName,
          runDate,
          plannedUnits,
          actualUnits,
          plannedTimeMin,
          actualTimeMin,
          defects: null,
          downtimeMin: null,
          bomId,
          dateDeadline,
          moState,
        }).onConflictDoUpdate({
          target: [productionRunsTable.companyId, productionRunsTable.odooId],
          set: {
            productName,
            plannedUnits,
            actualUnits,
            actualTimeMin,
            plannedTimeMin,
            defects: null,
            downtimeMin: null,
            runDate,
            bomId,
            dateDeadline,
            moState,
          }
        });
        synced++;
      } catch (err) { failed++; errors.push(`MO #${odooId}: ${(err as Error).message}`); }
    }
    let syncStatus = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    // Cleanup phase: remove local records that no longer exist in Odoo
    const fetchedIds = Array.from(
      new Set(
        mfgOrders
          .map((order) => parsePositiveOdooId(order.id))
          .filter((id): id is number => id !== null),
      ),
    );
    let localRecordCount = 0;

    if (fetchedIds.length === 0 && failed === 0) {
      const allRows = await db
        .select({ id: productionRunsTable.id })
        .from(productionRunsTable)
        .where(
          and(
            eq(productionRunsTable.companyId, companyId),
            isNotNull(productionRunsTable.odooId),
          ),
        );

      localRecordCount = allRows.length;
    }

    const cleanupDecision = getOdooCleanupDecision(
      fetchedIds.length,
      failed,
      localRecordCount,
    );

    if (cleanupDecision === "delete_missing") {
      await db.delete(productionRunsTable)
        .where(and(
          eq(productionRunsTable.companyId, companyId),
          isNotNull(productionRunsTable.odooId),
          notInArray(productionRunsTable.odooId, fetchedIds),
        ));
    } else if (cleanupDecision === "delete_all") {
      await db.delete(productionRunsTable)
        .where(and(
          eq(productionRunsTable.companyId, companyId),
          isNotNull(productionRunsTable.odooId),
        ));
    } else if (
      cleanupDecision === "preserve_suspicious_empty"
    ) {
      syncStatus = "suspicious_empty_result";
      errors.push(
        `Suspicious empty result. Local record count (${localRecordCount}) > 5. Skipping auto-delete.`,
      );
    }
    await db.insert(odooSyncLogTable).values({ companyId, entity: "production", status: syncStatus, recordsSynced: synced, recordsFailed: failed, message: generateSyncMessage(synced, failed, errors) });
    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Production sync failed");
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});
// ── POST /integrations/odoo/sync/boms ────────────────────────────────────────
router.post("/integrations/odoo/sync/boms", async (req: Request, res: Response): Promise<void> => {
  const companyId = req.user!.companyId;
  const config = await getCompanyOdooConfig(companyId);

  if (!config) {
    res.status(400).json({
      synced: 0,
      failed: 0,
      errors: ["No connection configured"],
    });
    return;
  }

  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  try {
    const client = new OdooClient(config);

    const inventoryItems = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.companyId, companyId));

    const byTemplateId = new Map<number, typeof inventoryItems[number]>();
    const byProductId = new Map<number, typeof inventoryItems[number]>();

    for (const item of inventoryItems) {
      const templateId = parsePositiveOdooId(
        item.odooProductTemplateId,
      );
      const productId = parsePositiveOdooId(item.odooId);

      if (templateId !== null) {
        byTemplateId.set(templateId, item);
      }

      if (productId !== null) {
        byProductId.set(productId, item);
      }
    }

    const odooBoms = await client
      .searchRead<Record<string, unknown>>(
        "mrp.bom",
        [],
        ["id", "product_tmpl_id", "product_qty", "type", "active", "sequence"]
      )
      .catch(() => {
        throw new Error("MRP/BOM module may not be installed in Odoo");
      });

    for (const odooBom of odooBoms) {
      const odooBomId = parsePositiveOdooId(odooBom.id);
      const templateId = many2oneId(odooBom.product_tmpl_id);
      const parentBomQty = parsePositiveOdooNumber(
        odooBom.product_qty,
      );
      const isActive =
        typeof odooBom.active === "boolean"
          ? odooBom.active
          : null;
      const prioritySequence =
        typeof odooBom.sequence === "number" &&
          Number.isInteger(odooBom.sequence)
          ? odooBom.sequence
          : null;

      if (
        odooBomId === null ||
        templateId === null ||
        parentBomQty === null ||
        isActive === null
      ) {
        failed++;
        errors.push(
          "BOM has an invalid Odoo ID, product template, quantity, or active status.",
        );
        continue;
      }

      const parentItem = byTemplateId.get(templateId);

      if (!parentItem) {
        failed++;
        errors.push(
          `BOM #${odooBomId}: product.template #${templateId} is not mapped to a local inventory item.`
        );
        continue;
      }

      try {
        const [savedBom] = await db
          .insert(bomsTable)
          .values({
            companyId,
            odooBomId,
            parentSkuId: parentItem.id,
            parentSku: parentItem.sku,
            parentBomQty,
            bomType: optionalOdooString(odooBom.type),
            isActive,
            prioritySequence,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [bomsTable.companyId, bomsTable.odooBomId],
            set: {
              parentSkuId: parentItem.id,
              parentSku: parentItem.sku,
              parentBomQty,
              bomType: optionalOdooString(odooBom.type),
              isActive,
              prioritySequence,
              lastSyncedAt: new Date(),
            },
          })
          .returning();

        if (!savedBom) {
          failed++;
          errors.push(`BOM #${odooBomId}: failed to save.`);
          continue;
        }

        const odooLines = await client.searchRead<Record<string, unknown>>(
          "mrp.bom.line",
          [["bom_id", "=", odooBomId]],
          ["id", "product_id", "product_qty", "uom_id"]
        );

        for (const odooLine of odooLines) {
          const odooLineId = parsePositiveOdooId(odooLine.id);
          const componentProductId = many2oneId(
            odooLine.product_id,
          );
          const componentQty = parsePositiveOdooNumber(
            odooLine.product_qty,
          );
          const uomName = optionalOdooString(
            Array.isArray(odooLine.uom_id)
              ? odooLine.uom_id[1]
              : null,
          );

          if (
            odooLineId === null ||
            componentProductId === null ||
            componentQty === null
          ) {
            failed++;
            errors.push(
              "BOM line has an invalid Odoo ID, component product, or quantity.",
            );
            continue;
          }

          const childItem = byProductId.get(componentProductId);

          if (!childItem) {
            failed++;
            errors.push(
              `BOM line #${odooLineId}: product.product #${componentProductId} is not mapped to a local inventory item.`
            );
            continue;
          }

          await db
            .insert(bomLinesTable)
            .values({
              companyId,
              odooLineId,
              bomId: savedBom.id,
              childSkuId: childItem.id,
              childSku: childItem.sku,
              componentQty,
              uomName,
              isDeleted: false,
            })
            .onConflictDoUpdate({
              target: [bomLinesTable.companyId, bomLinesTable.odooLineId],
              set: {
                bomId: savedBom.id,
                childSkuId: childItem.id,
                childSku: childItem.sku,
                componentQty,
                uomName,
                isDeleted: false,
              },
            });
        }

        synced++;
      } catch (err) {
        failed++;
        errors.push(`BOM #${odooBomId}: ${(err as Error).message}`);
      }
    }

    const syncStatus =
      failed === 0 ? "success" : synced > 0 ? "partial" : "error";

    await db.insert(odooSyncLogTable).values({
      companyId,
      entity: "boms",
      status: syncStatus,
      recordsSynced: synced,
      recordsFailed: failed,
      message: generateSyncMessage(synced, failed, errors),
    });

    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "BOM sync failed");

    res.status(502).json({
      synced,
      failed,
      errors: [...errors, (err as Error).message],
    });
  }
});
// ── POST /integrations/odoo/sync/sales ───────────────────────────────────────
router.post(
  "/integrations/odoo/sync/sales",
  async (req: Request, res: Response): Promise<void> => {
    const companyId = req.user!.companyId;
    const config = await getCompanyOdooConfig(companyId);

    if (!config) {
      res.status(400).json({
        synced: 0,
        failed: 0,
        errors: ["No Odoo connection configured for this company yet"],
      });
      return;
    }

    const errors: string[] = [];
    let synced = 0;
    let failed = 0;

    try {
      const client = new OdooClient(config);

      const orders = await client.searchRead<Record<string, unknown>>(
        "sale.order",
        [],
        [
          "id",
          "name",
          "partner_id",
          "amount_untaxed",
          "amount_tax",
          "amount_total",
          "currency_id",
          "state",
          "date_order",
          "commitment_date",
          "order_line",
        ],
      );

      const orderOdooIds = orders
        .map((order) => parsePositiveOdooId(order.id))
        .filter((id): id is number => id !== null);

      const lines =
        orderOdooIds.length > 0
          ? await client.searchRead<Record<string, unknown>>(
            "sale.order.line",
            [["order_id", "in", orderOdooIds]],
            [
              "id",
              "order_id",
              "product_id",
              "name",
              "product_uom_qty",
              "qty_delivered",
              "qty_invoiced",
              "price_unit",
              "discount",
              "price_subtotal",
              "currency_id",
              "state",
            ],
          )
          : [];

      const linesByOrderOdooId = new Map<
        number,
        Record<string, unknown>[]
      >();

      for (const line of lines) {
        const orderOdooId = many2oneId(line.order_id);
        if (orderOdooId === null) continue;

        const grouped = linesByOrderOdooId.get(orderOdooId) ?? [];
        grouped.push(line);
        linesByOrderOdooId.set(orderOdooId, grouped);
      }

      const inventoryItems = await db
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.companyId, companyId));

      const inventoryByOdooId = new Map<
        number,
        (typeof inventoryItems)[number]
      >();

      for (const item of inventoryItems) {
        const itemOdooId = parsePositiveOdooId(item.odooId);

        if (itemOdooId !== null) {
          inventoryByOdooId.set(itemOdooId, item);
        }
      }

      for (const order of orders) {
        const odooId = parsePositiveOdooId(order.id);
        const orderNumber = optionalOdooString(order.name);
        const status = optionalOdooString(order.state);

        if (odooId === null || orderNumber === null || status === null) {
          failed++;
          errors.push("Sales order has an invalid Odoo ID, name, or state.");
          continue;
        }

        const orderDateParsed = parseOdooDateTime(order.date_order);
        const commitmentDateParsed = parseOdooDateTime(
          order.commitment_date,
        );

        const orderDate = orderDateParsed
          ? orderDateParsed.toISOString().slice(0, 10)
          : null;

        const commitmentDate = commitmentDateParsed
          ? commitmentDateParsed.toISOString().slice(0, 10)
          : null;

        const effectiveDeliveryDate = commitmentDate;

        const effectiveDeliveryDateSource = commitmentDate
          ? "ODOO_COMMITMENT_DATE"
          : "MISSING";

        const customerOdooId = many2oneId(order.partner_id);

        const customerName =
          Array.isArray(order.partner_id) &&
            typeof order.partner_id[1] === "string"
            ? order.partner_id[1]
            : null;

        const currency =
          Array.isArray(order.currency_id) &&
            typeof order.currency_id[1] === "string"
            ? order.currency_id[1]
            : null;

        const amountUntaxed = parseNonNegativeOdooNumber(
          order.amount_untaxed,
        );

        const taxAmount = parseNonNegativeOdooNumber(order.amount_tax);
        const totalAmount = parseNonNegativeOdooNumber(
          order.amount_total,
        );

        if (totalAmount === null) {
          failed++;
          errors.push(`SO #${odooId}: Invalid total amount.`);
          continue;
        }

        const orderLines = linesByOrderOdooId.get(odooId) ?? [];

        try {
          const [localOrder] = await db
            .insert(salesOrdersTable)
            .values({
              companyId,
              odooId,
              orderNumber,
              customerId: customerOdooId,
              customerName,
              untaxedAmount: amountUntaxed,
              taxAmount,
              totalAmount,
              currency,
              status,
              state: status,
              source: "ODOO",
              orderDate,
              expectedDate: commitmentDate,
              commitmentDate,
              commitmentDateRaw:
                typeof order.commitment_date === "string"
                  ? order.commitment_date
                  : null,
              effectiveDeliveryDate,
              effectiveDeliveryDateSource,
              dataConfidence: commitmentDate ? "HIGH" : "LOW",
              itemCount: orderLines.length,
              syncedAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                salesOrdersTable.companyId,
                salesOrdersTable.odooId,
              ],
              set: {
                orderNumber,
                customerId: customerOdooId,
                customerName,
                untaxedAmount: amountUntaxed,
                taxAmount,
                totalAmount,
                currency,
                status,
                state: status,
                source: "ODOO",
                orderDate,
                expectedDate: commitmentDate,
                commitmentDate,
                commitmentDateRaw:
                  typeof order.commitment_date === "string"
                    ? order.commitment_date
                    : null,
                effectiveDeliveryDate,
                effectiveDeliveryDateSource,
                dataConfidence: commitmentDate ? "HIGH" : "LOW",
                itemCount: orderLines.length,
                syncedAt: new Date(),
                updatedAt: new Date(),
              },
            })
            .returning({ id: salesOrdersTable.id });

          for (const line of orderLines) {
            const lineOdooId = parsePositiveOdooId(line.id);
            const productOdooId = many2oneId(line.product_id);

            if (lineOdooId === null || productOdooId === null) {
              throw new Error(
                `SO #${odooId}: Sales line has an invalid ID or product.`,
              );
            }

            const inventoryItem = inventoryByOdooId.get(productOdooId);

            if (!inventoryItem) {
              throw new Error(
                `SO line #${lineOdooId}: Odoo product ${productOdooId} was not found in local inventory.`,
              );
            }

            const orderedQuantity = parseNonNegativeOdooNumber(
              line.product_uom_qty,
            );

            const deliveredQuantity = parseNonNegativeOdooNumber(
              line.qty_delivered,
            );

            const invoicedQuantity = parseNonNegativeOdooNumber(
              line.qty_invoiced,
            );

            const unitPrice = parseNonNegativeOdooNumber(line.price_unit);
            const discount = parseNonNegativeOdooNumber(line.discount);
            const subtotal = parseNonNegativeOdooNumber(
              line.price_subtotal,
            );

            const lineStatus = optionalOdooString(line.state);

            if (
              orderedQuantity === null ||
              deliveredQuantity === null ||
              invoicedQuantity === null ||
              lineStatus === null
            ) {
              throw new Error(
                `SO line #${lineOdooId}: Invalid quantity or state data.`,
              );
            }

            const lineCurrency =
              Array.isArray(line.currency_id) &&
                typeof line.currency_id[1] === "string"
                ? line.currency_id[1]
                : currency;

            await db
              .insert(salesOrderLinesTable)
              .values({
                companyId,
                odooId: lineOdooId,
                orderId: localOrder.id,
                inventoryItemId: inventoryItem.id,
                odooProductId: productOdooId,
                productName: inventoryItem.name,
                sku: inventoryItem.sku,
                description: optionalOdooString(line.name),
                orderedQuantity,
                deliveredQuantity,
                invoicedQuantity,
                remainingQuantity: Math.max(
                  orderedQuantity - deliveredQuantity,
                  0,
                ),
                unitPrice,
                discount,
                subtotal,
                currency: lineCurrency,
                expectedDate: commitmentDate,
                effectiveDeliveryDate,
                effectiveDeliveryDateSource,
                dataConfidence: commitmentDate ? "HIGH" : "LOW",
                status: lineStatus,
                syncedAt: new Date(),
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [
                  salesOrderLinesTable.companyId,
                  salesOrderLinesTable.odooId,
                ],
                set: {
                  orderId: localOrder.id,
                  inventoryItemId: inventoryItem.id,
                  odooProductId: productOdooId,
                  productName: inventoryItem.name,
                  sku: inventoryItem.sku,
                  description: optionalOdooString(line.name),
                  orderedQuantity,
                  deliveredQuantity,
                  invoicedQuantity,
                  remainingQuantity: Math.max(
                    orderedQuantity - deliveredQuantity,
                    0,
                  ),
                  unitPrice,
                  discount,
                  subtotal,
                  currency: lineCurrency,
                  expectedDate: commitmentDate,
                  effectiveDeliveryDate,
                  effectiveDeliveryDateSource,
                  dataConfidence: commitmentDate ? "HIGH" : "LOW",
                  status: lineStatus,
                  syncedAt: new Date(),
                  updatedAt: new Date(),
                },
              });
          }

          synced++;
        } catch (err) {
          failed++;
          errors.push(
            `SO #${odooId}: ${err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      const syncStatus =
        failed === 0 ? "success" : synced > 0 ? "partial" : "error";

      await db.insert(odooSyncLogTable).values({
        companyId,
        entity: "sales",
        status: syncStatus,
        recordsSynced: synced,
        recordsFailed: failed,
        message: generateSyncMessage(synced, failed, errors),
      });

      res.json({
        synced,
        failed,
        errors,
      });
    } catch (err) {
      req.log.error({ err }, "Odoo sales sync failed");
      await db.insert(odooSyncLogTable).values({
        companyId,
        entity: "sales",
        status: "error",
        recordsSynced: synced,
        recordsFailed: failed,
        message: err instanceof Error ? err.message : "Odoo sales sync failed",
      });
      res.status(500).json({
        synced,
        failed,
        errors: [
          err instanceof Error ? err.message : "Odoo sales sync failed",
        ],
      });
    }
  },
);

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
      const scheduleToProduct = new Map<number, string>();

      for (const schedule of schedules) {
        const scheduleId = parsePositiveOdooId(schedule.id);
        const productId = many2oneId(schedule.product_id);
        const productName = optionalOdooString(
          Array.isArray(schedule.product_id)
            ? schedule.product_id[1]
            : null,
        );

        if (
          scheduleId === null ||
          productId === null ||
          productName === null
        ) {
          failed++;
          errors.push(
            "MPS schedule has an invalid Odoo ID or product.",
          );
          continue;
        }

        scheduleToProduct.set(scheduleId, productName);
      }
      const forecasts = await client.searchRead<Record<string, unknown>>(
        "mrp.product.forecast", [], ["id", "production_schedule_id", "date", "create_date", "forecast_qty", "replenish_qty"]
      );

      if (forecasts.length > 0) {
        syncedMps = true;
        for (const line of forecasts) {
          const odooId = parsePositiveOdooId(line.id);
          const scheduleId = many2oneId(
            line.production_schedule_id,
          );

          if (odooId === null || scheduleId === null) {
            failed++;
            errors.push(
              "MPS forecast has an invalid Odoo ID or production schedule.",
            );
            continue;
          }

          const productName =
            scheduleToProduct.get(scheduleId) ?? null;

          if (productName === null) {
            failed++;
            errors.push(`MPS Forecast #${odooId}: missing mapped product.`);
            continue;
          }

          const dateVal = line.date;

          if (
            typeof dateVal !== "string" ||
            !/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(dateVal)
          ) {
            failed++;
            errors.push(`MPS Forecast #${odooId}: missing valid forecast date.`);
            continue;
          }

          const period = dateVal.slice(0, 7);

          const targetQty =
            line.forecast_qty == null ||
              line.forecast_qty === false
              ? null
              : parseNonNegativeOdooNumber(
                line.forecast_qty,
              );

          const replenishmentQty =
            line.replenish_qty == null ||
              line.replenish_qty === false
              ? null
              : parseNonNegativeOdooNumber(
                line.replenish_qty,
              );

          if (
            (line.forecast_qty != null &&
              line.forecast_qty !== false &&
              targetQty === null) ||
            (line.replenish_qty != null &&
              line.replenish_qty !== false &&
              replenishmentQty === null)
          ) {
            failed++;
            errors.push(
              `MPS Forecast #${odooId}: invalid forecast or replenishment quantity.`,
            );
            continue;
          }

          try {
            await db.insert(demandRecordsTable).values({
              companyId,
              odooId,
              productName,
              period,
              source: "ODOO_MPS",
              actualDemand: sql`NULL`,
              forecastedDemand: targetQty ?? sql`NULL`,
              replenishmentQty: replenishmentQty ?? sql`NULL`,
            }).onConflictDoUpdate({
              target: [demandRecordsTable.companyId, demandRecordsTable.odooId],
              set: {
                productName,
                period,
                source: "ODOO_MPS",
                actualDemand: sql`NULL`,
                forecastedDemand: targetQty ?? sql`NULL`,
                replenishmentQty: replenishmentQty ?? sql`NULL`,
              }
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
        const odooId = parsePositiveOdooId(line.id);
        const productId = many2oneId(line.product_id);
        const productName = optionalOdooString(
          Array.isArray(line.product_id)
            ? line.product_id[1]
            : null,
        );
        const createdAt = parseOdooDateTime(line.create_date);
        const actualDemand = parseNonNegativeOdooNumber(
          line.product_uom_qty,
        );

        if (
          odooId === null ||
          productId === null ||
          productName === null ||
          createdAt === null ||
          actualDemand === null
        ) {
          failed++;
          errors.push(
            "Sales-order line has an invalid Odoo ID, product, date, or quantity.",
          );
          continue;
        }

        const period = createdAt.toISOString().slice(0, 7);
        try {
          await db.insert(demandRecordsTable).values({
            companyId,
            odooId,
            productName,
            period,
            source: "ODOO_SALES_ORDER",
            actualDemand,
            forecastedDemand: sql`NULL`,
            replenishmentQty: sql`NULL`,
          }).onConflictDoUpdate({
            target: [demandRecordsTable.companyId, demandRecordsTable.odooId],
            set: {
              productName,
              period,
              source: "ODOO_SALES_ORDER",
              actualDemand,
              forecastedDemand: sql`NULL`,
              replenishmentQty: sql`NULL`,
            }
          });
          synced++;
        } catch (err) { failed++; errors.push(`SO Line #${odooId}: ${(err as Error).message}`); }
      }
    }

    let syncStatus = failed === 0 ? "success" : synced > 0 ? "partial" : "error";
    // Planning can switch between MPS and sales-order sources.
    // Retain existing history until cleanup can be scoped safely
    // to the source that was successfully synchronized.
    const allRows = await db
      .select({ id: demandRecordsTable.id })
      .from(demandRecordsTable)
      .where(
        and(
          eq(demandRecordsTable.companyId, companyId),
          isNotNull(demandRecordsTable.odooId),
        ),
      );

    if (
      allRows.length > 5 &&
      synced === 0 &&
      failed === 0
    ) {
      syncStatus = "suspicious_empty_result";
      errors.push(
        `Suspicious empty result. Local record count (${allRows.length}) > 5. Existing planning history was preserved.`,
      );
    }

    await db.insert(odooSyncLogTable).values({ companyId, entity: "planning", status: syncStatus, recordsSynced: synced, recordsFailed: failed, message: generateSyncMessage(synced, failed, errors) });
    res.json({ synced, failed, errors });
  } catch (err) {
    req.log.error({ err }, "Planning sync failed");
    res.status(502).json({ synced, failed, errors: [...errors, (err as Error).message] });
  }
});

export default router;
