import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z, type ZodType } from "zod";
import { and, eq } from "drizzle-orm";
import { db, inventoryItemsTable, suppliersTable, productionRunsTable, demandRecordsTable, ordersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { StrictInventoryBody } from "./inventory";
import { StrictSupplierBody } from "./suppliers";
import { StrictProductionBody } from "./production";
import { StrictDemandBody } from "./demand";
import { StrictOrderBody } from "./orders";

// Run the same validation the manual API routes enforce, so a CSV/XLSX
// import can't slip in data (negative lead times, out-of-range scores, ...)
// that would be rejected if entered through the UI.
function formatZodError(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues.map((iss) => `${iss.path.join(".") || "value"}: ${iss.message}`).join("; ");
}
function validateRow<T>(schema: ZodType<T>, candidate: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(candidate);
  if (!result.success) return { ok: false, error: formatZodError(result.error) };
  return { ok: true, data: result.data };
}
export const ImportOrderStatus = z.enum([
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// --- CSV templates ---
const TEMPLATES: Record<string, { headers: string[]; example: string[] }> = {
  inventory: {
    headers: ["name", "sku", "category", "currentStock", "leadTimeDays", "unitCost", "annualDemand", "holdingCostRate", "orderingCost"],
    example: ["Carbon Steel Sheet 4mm", "RAW-CS-4MM", "Raw Materials", "850", "7", "12.50", "18000", "0.25", "150"],
  },
  production: {
    headers: ["productName", "plannedUnits", "actualUnits", "plannedTimeMin", "actualTimeMin", "defects", "downtimeMin", "runDate"],
    example: ["Hydraulic Cylinder Assembly", "200", "194", "480", "510", "3", "30", "2026-07-28"],
  },
  demand: {
    headers: ["productName", "period", "actualDemand", "forecastedDemand"],
    example: ["Hydraulic Cylinder Assembly", "2026-07", "380", "370"],
  },
  suppliers: {
    headers: ["name", "country", "leadTimeDays", "onTimeDeliveryRate", "qualityScore", "fillRate"],
    example: ["Acme Steel Works", "USA", "7", "96", "94", "98"],
  },
  orders: {
    headers: ["supplierId", "totalValue", "status", "orderDate", "expectedDelivery", "itemCount"],
    example: ["1", "8500", "pending", "2026-07-28", "2026-08-05", "4"],
  },
};

// Download a CSV template
router.get("/import/templates/:entity", (req, res): void => {
  const entity = req.params.entity as string;
  const tpl = TEMPLATES[entity];
  if (!tpl) { res.status(404).json({ error: "Unknown entity type" }); return; }

  const rows = [tpl.headers.join(","), tpl.example.join(",")].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${entity}-template.csv"`);
  res.send(rows);
});

// Parse a workbook buffer into row objects
function parseFile(buffer: Buffer, mimetype: string, originalname: string): Record<string, string>[] {
  let workbook: XLSX.WorkBook;
  const ext = originalname.split(".").pop()?.toLowerCase();
  if (ext === "csv" || mimetype === "text/csv") {
    workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  } else {
    workbook = XLSX.read(buffer, { type: "buffer" });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
}

export function optionalNum(v: unknown): number | undefined {
  const value = str(v);
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function requiredNum(v: unknown): number {
  const value = str(v);
  if (!value) return Number.NaN;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function str(v: unknown): string { return String(v ?? "").trim(); }

// Date normalizer.
// Accepts YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, and Excel serial dates.
// Returns YYYY-MM-DD or null. Ambiguous DD/MM/YYYY input is not accepted.
function validDate(
  year: number,
  month: number,
  day: number,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function parseDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return validDate(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
  }

  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const serial = Number(s);

    if (Number.isFinite(serial) && serial > 0 && serial < 100000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const date = new Date(excelEpoch + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }

  return null;
}

// EOQ / safety stock helpers (mirror of inventory route)
function calcEOQ(d: number, s: number, h_unit: number): number {
  return h_unit > 0 ? Math.sqrt((2 * d * s) / h_unit) : 0;
}


// POST /api/import  (multipart: file + entity + optional fieldMap JSON)
router.post(
  "/import",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const entity = str(req.body.entity);
    const file = req.file;

    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
    if (!TEMPLATES[entity]) { res.status(400).json({ error: `Unknown entity: ${entity}` }); return; }

    let rows: Record<string, string>[];
    try {
      rows = parseFile(file.buffer, file.mimetype, file.originalname);
    } catch (err) {
      logger.warn({ err }, "Failed to parse uploaded file");
      res.status(400).json({ error: "Could not parse file. Ensure it is a valid CSV or XLSX." });
      return;
    }

    if (rows.length === 0) { res.status(400).json({ error: "File contains no data rows." }); return; }

    // Apply explicit field map if provided  { expectedKey: fileColumnHeader }
    if (req.body.fieldMap) {
      try {
        const fieldMap: Record<string, string> = JSON.parse(req.body.fieldMap);
        rows = rows.map((row) => {
          const newRow: Record<string, string> = { ...row };
          for (const [expectedKey, fileCol] of Object.entries(fieldMap)) {
            if (fileCol && fileCol !== "__skip__") {
              newRow[expectedKey] = String(row[fileCol] ?? "");
            }
          }
          return newRow;
        });
      } catch {
        logger.warn("Failed to parse fieldMap — falling back to fuzzy matching");
      }
    }

    let imported = 0;
    const errors: string[] = [];

    // Normalize header keys: strip spaces/underscores, case-insensitive
    function get(row: Record<string, string>, ...keys: string[]): string {
      for (const k of keys) {
        for (const rk of Object.keys(row)) {
          if (rk.replace(/[\s_]/g, "").toLowerCase() === k.toLowerCase()) return str(row[rk]);
        }
      }
      return "";
    }

    if (entity === "inventory") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const name = get(r, "name"); const sku = get(r, "sku");
          if (!name || !sku) { errors.push(`Row ${i + 2}: name and sku are required`); continue; }
          const annualDemand = optionalNum(
            get(r, "annualDemand", "annual_demand", "annualdemand"),
          );
          const orderingCost = optionalNum(
            get(r, "orderingCost", "ordering_cost", "orderingcost"),
          );
          const unitCost = requiredNum(get(r, "unitCost", "unit_cost", "unitcost"));
          const holdingCostRate = optionalNum(
            get(r, "holdingCostRate", "holding_cost_rate", "holdingcostrate"),
          );
          const leadTimeDays = optionalNum(
            get(r, "leadTimeDays", "lead_time_days", "leadtimedays"),
          );
          const currentStock = requiredNum(get(r, "currentStock", "current_stock", "currentstock"));
          const categoryInput = get(r, "category");
          const category = categoryInput || "Uncategorized";

          const validated = validateRow(StrictInventoryBody, {
            name, sku, category, currentStock,
            leadTimeDays, unitCost, annualDemand, holdingCostRate, orderingCost,
          });
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }
          const [existing] = await db
            .select()
            .from(inventoryItemsTable)
            .where(
              and(
                eq(inventoryItemsTable.companyId, req.user!.companyId),
                eq(inventoryItemsTable.sku, validated.data.sku),
              ),
            );

          const mergedAnnualDemand =
            annualDemand !== undefined
              ? annualDemand
              : existing?.annualDemand ?? null;

          const mergedOrderingCost =
            orderingCost !== undefined
              ? orderingCost
              : existing?.orderingCost ?? null;

          const mergedHoldingCostRate =
            holdingCostRate !== undefined
              ? holdingCostRate
              : existing?.holdingCostRate ?? null;

          const mergedLeadTimeDays =
            leadTimeDays !== undefined
              ? leadTimeDays
              : existing?.leadTimeDays ?? null;

          const annualDemandSource =
            annualDemand !== undefined
              ? "CSV_IMPORT"
              : existing?.annualDemandSource ?? "UNKNOWN";

          const orderingCostSource =
            orderingCost !== undefined
              ? "CSV_IMPORT"
              : existing?.orderingCostSource ?? "UNKNOWN";

          const holdingCostRateSource =
            holdingCostRate !== undefined
              ? "CSV_IMPORT"
              : existing?.holdingCostRateSource ?? "UNKNOWN";

          const leadTimeSource =
            leadTimeDays !== undefined
              ? "CSV_IMPORT"
              : existing?.leadTimeSource ?? "UNKNOWN";

          const unsupportedSources = new Set([
            "UNKNOWN",
            "SCHEMA_DEFAULT",
          ]);

          const canCalculateEoq =
            mergedAnnualDemand != null &&
            mergedAnnualDemand > 0 &&
            !unsupportedSources.has(annualDemandSource) &&
            mergedOrderingCost != null &&
            mergedOrderingCost > 0 &&
            !unsupportedSources.has(orderingCostSource) &&
            unitCost > 0 &&
            mergedHoldingCostRate != null &&
            mergedHoldingCostRate > 0 &&
            !unsupportedSources.has(holdingCostRateSource);

          const eoq = canCalculateEoq
            ? calcEOQ(
              mergedAnnualDemand!,
              mergedOrderingCost!,
              unitCost * mergedHoldingCostRate!,
            )
            : null;

          const planningValues = {
            annualDemand: mergedAnnualDemand,
            annualDemandSource,
            orderingCost: mergedOrderingCost,
            orderingCostSource,
            holdingCostRate: mergedHoldingCostRate,
            holdingCostRateSource,
            leadTimeDays: mergedLeadTimeDays,
            leadTimeSource,
            eoq,
            eoqSource: canCalculateEoq
              ? "CALCULATED_FROM_VERIFIED_INPUTS"
              : "UNKNOWN",
            safetyStock:
              annualDemand !== undefined || leadTimeDays !== undefined
                ? null
                : existing?.safetyStock ?? null,
            safetyStockSource:
              annualDemand !== undefined || leadTimeDays !== undefined
                ? "UNKNOWN"
                : existing?.safetyStockSource ?? "UNKNOWN",
            reorderPoint:
              annualDemand !== undefined || leadTimeDays !== undefined
                ? null
                : existing?.reorderPoint ?? null,
            reorderPointSource:
              annualDemand !== undefined || leadTimeDays !== undefined
                ? "UNKNOWN"
                : existing?.reorderPointSource ?? "UNKNOWN",
          };

          await db
            .insert(inventoryItemsTable)
            .values({
              ...validated.data,
              companyId: req.user!.companyId,
              ...planningValues,
            })
            .onConflictDoUpdate({
              target: [
                inventoryItemsTable.companyId,
                inventoryItemsTable.sku,
              ],
              set: {
                name: validated.data.name,
                ...(categoryInput
                  ? { category: validated.data.category }
                  : {}),
                currentStock: validated.data.currentStock,
                unitCost: validated.data.unitCost,
                ...planningValues,
              },
            });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "suppliers") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const name = get(r, "name");
          if (!name) { errors.push(`Row ${i + 2}: name is required`); continue; }
          const countryInput = get(r, "country");

          const leadTimeDays = optionalNum(
            get(r, "leadTimeDays", "lead_time_days", "leadtimedays"),
          );

          const onTimeDeliveryRate = optionalNum(
            get(
              r,
              "onTimeDeliveryRate",
              "on_time_delivery_rate",
              "ontimedeliveryrate",
            ),
          );

          const qualityScore = optionalNum(
            get(r, "qualityScore", "quality_score", "qualityscore"),
          );

          const fillRate = optionalNum(
            get(r, "fillRate", "fill_rate", "fillrate"),
          );

          const [existingSupplier] = await db
            .select()
            .from(suppliersTable)
            .where(
              and(
                eq(suppliersTable.companyId, req.user!.companyId),
                eq(suppliersTable.name, name),
              ),
            );

          const candidate = {
            name,
            country:
              countryInput ||
              existingSupplier?.country ||
              "Unknown",
            leadTimeDays:
              leadTimeDays !== undefined
                ? leadTimeDays
                : existingSupplier?.leadTimeDays ?? null,
            onTimeDeliveryRate:
              onTimeDeliveryRate !== undefined
                ? onTimeDeliveryRate
                : existingSupplier?.onTimeDeliveryRate ?? null,
            qualityScore:
              qualityScore !== undefined
                ? qualityScore
                : existingSupplier?.qualityScore ?? null,
            fillRate:
              fillRate !== undefined
                ? fillRate
                : existingSupplier?.fillRate ?? null,
          };

          const validated = validateRow(
            StrictSupplierBody,
            candidate,
          );

          if (!validated.ok) {
            errors.push(`Row ${i + 2}: ${validated.error}`);
            continue;
          }

          if (existingSupplier) {
            await db
              .update(suppliersTable)
              .set(validated.data)
              .where(
                and(
                  eq(suppliersTable.id, existingSupplier.id),
                  eq(
                    suppliersTable.companyId,
                    req.user!.companyId,
                  ),
                ),
              );
          } else {
            await db
              .insert(suppliersTable)
              .values({
                ...validated.data,
                companyId: req.user!.companyId,
              });
          }
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "production") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const productName = get(r, "productName", "product_name", "productname");
          const rawDate = get(r, "runDate", "run_date", "rundate");
          if (!productName) { errors.push(`Row ${i + 2}: productName is required`); continue; }
          const runDate = parseDate(rawDate);
          if (!runDate) {
            errors.push(`Row ${i + 2}: runDate "${rawDate}" is not a valid date — use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY`);
            continue;
          }
          const candidate = {
            productName,
            plannedUnits: requiredNum(get(r, "plannedUnits", "planned_units", "plannedunits")),
            actualUnits: requiredNum(get(r, "actualUnits", "actual_units", "actualunits")),
            plannedTimeMin: requiredNum(get(r, "plannedTimeMin", "planned_time_min", "plannedtimemin")),
            actualTimeMin: requiredNum(get(r, "actualTimeMin", "actual_time_min", "actualtimemin")),
            defects: requiredNum(get(r, "defects")),
            downtimeMin: requiredNum(
              get(r, "downtimeMin", "downtime_min", "downtimemin"),
            ),
            runDate,
          };
          const validated = validateRow(StrictProductionBody, candidate);
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }
          await db.insert(productionRunsTable).values({ ...validated.data, companyId: req.user!.companyId });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "demand") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const productName = get(r, "productName", "product_name", "productname");
          const period = get(r, "period");
          if (!productName || !period) { errors.push(`Row ${i + 2}: productName and period are required`); continue; }
          const candidate = {
            productName, period,
            actualDemand: requiredNum(get(r, "actualDemand", "actual_demand", "actualdemand")),
            forecastedDemand: requiredNum(get(r, "forecastedDemand", "forecasted_demand", "forecasteddemand")),
          };
          const validated = validateRow(StrictDemandBody, candidate);
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }
          await db.insert(demandRecordsTable).values({
            ...validated.data,
            companyId: req.user!.companyId,
            source: "CSV_IMPORT",
            replenishmentQty: null,
          });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "orders") {
      // Pre-fetch suppliers once for the whole batch, scoped to this company
      const allSuppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, req.user!.companyId));

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const rawOrderDate = get(r, "orderDate", "order_date", "orderdate");
          const rawExpectedDelivery = get(r, "expectedDelivery", "expected_delivery", "expecteddelivery");

          const orderDate = parseDate(rawOrderDate);
          if (!orderDate) {
            errors.push(`Row ${i + 2}: orderDate "${rawOrderDate}" is not a valid date — use YYYY-MM-DD or MM/DD/YYYY`);
            continue;
          }

          const expectedDelivery = parseDate(rawExpectedDelivery);
          if (!expectedDelivery) {
            errors.push(`Row ${i + 2}: expectedDelivery "${rawExpectedDelivery}" is not a valid date — use YYYY-MM-DD or MM/DD/YYYY`);
            continue;
          }
          const statusResult = ImportOrderStatus.safeParse(
            get(r, "status"),
          );

          if (!statusResult.success) {
            errors.push(
              `Row ${i + 2}: status must be pending, confirmed, shipped, delivered, or cancelled`,
            );
            continue;
          }

          const supplierId = requiredNum(get(r, "supplierId", "supplier_id", "supplierid"));
          const supplier = allSuppliers.find((s) => s.id === supplierId);
          if (!supplier) { errors.push(`Row ${i + 2}: supplierId ${supplierId} does not match any known supplier`); continue; }

          const candidate = {
            supplierId,
            totalValue: requiredNum(get(r, "totalValue", "total_value", "totalvalue")),
            orderDate,
            expectedDelivery,
            itemCount: requiredNum(
              get(r, "itemCount", "item_count", "itemcount"),
            ),
          };
          const validated = validateRow(StrictOrderBody, candidate);
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }

          await db.insert(ordersTable).values({
            ...validated.data,
            companyId: req.user!.companyId,
            supplierName: supplier.name,
            status: statusResult.data,
          });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    }

    res.json({ imported, skipped: rows.length - imported - errors.length, errors, total: rows.length });
  },
);

export default router;
