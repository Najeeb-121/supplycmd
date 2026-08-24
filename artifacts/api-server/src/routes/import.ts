import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import type { ZodType } from "zod";
import { eq } from "drizzle-orm";
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

function num(v: unknown): number { return parseFloat(String(v)) || 0; }
function str(v: unknown): string { return String(v ?? "").trim(); }

// ─── Date normalizer ───────────────────────────────────────────────────────────
// Accepts YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, DD/MM/YYYY, or JS-parseable strings.
// Returns YYYY-MM-DD or null if unparseable.
function parseDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  // DD-MM-YYYY
  const dmy1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy1) return `${dmy1[3]}-${dmy1[2].padStart(2, "0")}-${dmy1[1].padStart(2, "0")}`;

  // DD/MM/YYYY
  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2, "0")}-${dmy2[1].padStart(2, "0")}`;

  // XLSX serial date number (days since 1900-01-01)
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 0 && serial < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }

  // Fallback: JS Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];

  return null;
}

// EOQ / safety stock helpers (mirror of inventory route)
function calcEOQ(d: number, s: number, h_unit: number): number {
  return h_unit > 0 ? Math.sqrt((2 * d * s) / h_unit) : 0;
}
function calcSafetyStock(leadDays: number, annualD: number): number {
  const daily = annualD / 365;
  return Math.ceil(1.65 * (daily * 0.2) * Math.sqrt(leadDays));
}
function calcROP(leadDays: number, annualD: number): number {
  return Math.ceil((annualD / 365) * leadDays + calcSafetyStock(leadDays, annualD));
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
          const annualDemand = num(get(r, "annualDemand", "annual_demand", "annualdemand"));
          const orderingCost = num(get(r, "orderingCost", "ordering_cost", "orderingcost"));
          const unitCost = num(get(r, "unitCost", "unit_cost", "unitcost"));
          const holdingCostRate = num(get(r, "holdingCostRate", "holding_cost_rate", "holdingcostrate")) || 0.25;
          const leadTimeDays = num(get(r, "leadTimeDays", "lead_time_days", "leadtimedays")) || 7;
          const currentStock = num(get(r, "currentStock", "current_stock", "currentstock"));
          const category = get(r, "category") || "Uncategorized";

          const validated = validateRow(StrictInventoryBody, {
            name, sku, category, currentStock,
            leadTimeDays, unitCost, annualDemand, holdingCostRate, orderingCost,
          });
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }

          const eoq = calcEOQ(annualDemand, orderingCost, unitCost * holdingCostRate);
          const safetyStock = calcSafetyStock(leadTimeDays, annualDemand);
          const reorderPoint = calcROP(leadTimeDays, annualDemand);
          await db.insert(inventoryItemsTable).values({
            companyId: req.user!.companyId,
            name, sku, category, currentStock,
            leadTimeDays, unitCost, annualDemand, holdingCostRate, orderingCost,
            eoq, safetyStock, reorderPoint,
          }).onConflictDoUpdate({ target: [inventoryItemsTable.companyId, inventoryItemsTable.sku], set: { name, currentStock, unitCost, annualDemand, holdingCostRate, orderingCost, leadTimeDays, eoq, safetyStock, reorderPoint } });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "suppliers") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const name = get(r, "name");
          if (!name) { errors.push(`Row ${i + 2}: name is required`); continue; }
          const candidate = {
            name,
            country: get(r, "country") || "Unknown",
            leadTimeDays: num(get(r, "leadTimeDays", "lead_time_days", "leadtimedays")) || 7,
            onTimeDeliveryRate: num(get(r, "onTimeDeliveryRate", "on_time_delivery_rate", "ontimedeliveryrate")) || 95,
            qualityScore: num(get(r, "qualityScore", "quality_score", "qualityscore")) || 90,
            fillRate: num(get(r, "fillRate", "fill_rate", "fillrate")) || 97,
          };
          const validated = validateRow(StrictSupplierBody, candidate);
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }
          await db.insert(suppliersTable).values({ ...validated.data, companyId: req.user!.companyId });
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
            plannedUnits: num(get(r, "plannedUnits", "planned_units", "plannedunits")),
            actualUnits: num(get(r, "actualUnits", "actual_units", "actualunits")),
            plannedTimeMin: num(get(r, "plannedTimeMin", "planned_time_min", "plannedtimemin")),
            actualTimeMin: num(get(r, "actualTimeMin", "actual_time_min", "actualtimemin")),
            defects: num(get(r, "defects")) || 0,
            downtimeMin: num(get(r, "downtimeMin", "downtime_min", "downtimemin")) || 0,
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
            actualDemand: num(get(r, "actualDemand", "actual_demand", "actualdemand")),
            forecastedDemand: num(get(r, "forecastedDemand", "forecasted_demand", "forecasteddemand")),
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

          const supplierId = num(get(r, "supplierId", "supplier_id", "supplierid"));
          const supplier = allSuppliers.find((s) => s.id === supplierId);
          if (!supplier) { errors.push(`Row ${i + 2}: supplierId ${supplierId} does not match any known supplier`); continue; }

          const candidate = {
            supplierId,
            totalValue: num(get(r, "totalValue", "total_value", "totalvalue")),
            orderDate,
            expectedDelivery,
            itemCount: num(get(r, "itemCount", "item_count", "itemcount")) || 1,
          };
          const validated = validateRow(StrictOrderBody, candidate);
          if (!validated.ok) { errors.push(`Row ${i + 2}: ${validated.error}`); continue; }

          await db.insert(ordersTable).values({
            ...validated.data,
            companyId: req.user!.companyId,
            supplierName: supplier.name,
            status: get(r, "status") || "pending",
          });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    }

    res.json({ imported, skipped: rows.length - imported - errors.length, errors, total: rows.length });
  },
);

export default router;
