import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, inventoryItemsTable, suppliersTable, productionRunsTable, demandRecordsTable, ordersTable } from "@workspace/db";
import { logger } from "../lib/logger";

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
    example: ["Acme Steel Works", "USA", "7", "0.96", "94", "0.98"],
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

// POST /api/import  (multipart: file + entity)
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

    let imported = 0;
    const errors: string[] = [];

    // Normalize header keys (trim, camelCase-ish: strip spaces/underscores, lowercase first compare)
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
          const unitCost     = num(get(r, "unitCost", "unit_cost", "unitcost"));
          const holdingCostRate = num(get(r, "holdingCostRate", "holding_cost_rate", "holdingcostrate")) || 0.25;
          const leadTimeDays = num(get(r, "leadTimeDays", "lead_time_days", "leadtimedays")) || 7;
          const eoq = calcEOQ(annualDemand, orderingCost, unitCost * holdingCostRate);
          const safetyStock = calcSafetyStock(leadTimeDays, annualDemand);
          const reorderPoint = calcROP(leadTimeDays, annualDemand);
          await db.insert(inventoryItemsTable).values({
            name, sku,
            category: get(r, "category") || "Uncategorized",
            currentStock: num(get(r, "currentStock", "current_stock", "currentstock")),
            leadTimeDays, unitCost, annualDemand, holdingCostRate, orderingCost,
            eoq, safetyStock, reorderPoint,
          }).onConflictDoUpdate({ target: inventoryItemsTable.sku, set: { name, currentStock: num(get(r, "currentStock", "current_stock", "currentstock")), unitCost, annualDemand, holdingCostRate, orderingCost, leadTimeDays, eoq, safetyStock, reorderPoint } });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "suppliers") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const name = get(r, "name");
          if (!name) { errors.push(`Row ${i + 2}: name is required`); continue; }
          await db.insert(suppliersTable).values({
            name,
            country: get(r, "country") || "Unknown",
            leadTimeDays: num(get(r, "leadTimeDays", "lead_time_days", "leadtimedays")) || 7,
            onTimeDeliveryRate: num(get(r, "onTimeDeliveryRate", "on_time_delivery_rate", "ontimedeliveryrate")) || 0.95,
            qualityScore: num(get(r, "qualityScore", "quality_score", "qualityscore")) || 90,
            fillRate: num(get(r, "fillRate", "fill_rate", "fillrate")) || 0.97,
          });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "production") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const productName = get(r, "productName", "product_name", "productname");
          const runDate = get(r, "runDate", "run_date", "rundate");
          if (!productName || !runDate) { errors.push(`Row ${i + 2}: productName and runDate are required`); continue; }
          await db.insert(productionRunsTable).values({
            productName,
            plannedUnits: num(get(r, "plannedUnits", "planned_units", "plannedunits")),
            actualUnits: num(get(r, "actualUnits", "actual_units", "actualunits")),
            plannedTimeMin: num(get(r, "plannedTimeMin", "planned_time_min", "plannedtimemin")),
            actualTimeMin: num(get(r, "actualTimeMin", "actual_time_min", "actualtimemin")),
            defects: num(get(r, "defects")) || 0,
            downtimeMin: num(get(r, "downtimeMin", "downtime_min", "downtimemin")) || 0,
            runDate,
          });
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
          await db.insert(demandRecordsTable).values({
            productName, period,
            actualDemand: num(get(r, "actualDemand", "actual_demand", "actualdemand")),
            forecastedDemand: num(get(r, "forecastedDemand", "forecasted_demand", "forecasteddemand")),
          });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    } else if (entity === "orders") {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          const orderDate = get(r, "orderDate", "order_date", "orderdate");
          const expectedDelivery = get(r, "expectedDelivery", "expected_delivery", "expecteddelivery");
          if (!orderDate || !expectedDelivery) { errors.push(`Row ${i + 2}: orderDate and expectedDelivery are required`); continue; }
          const supplierId = num(get(r, "supplierId", "supplier_id", "supplierid"));
          // Try to look up supplier name
          const suppliers = await db.select().from(suppliersTable);
          const supplier = suppliers.find(s => s.id === supplierId);
          await db.insert(ordersTable).values({
            supplierId,
            supplierName: (supplier?.name ?? get(r, "supplierName", "supplier_name", "suppliername")) || "Unknown",
            totalValue: num(get(r, "totalValue", "total_value", "totalvalue")),
            status: get(r, "status") || "pending",
            orderDate,
            expectedDelivery,
            itemCount: num(get(r, "itemCount", "item_count", "itemcount")) || 1,
          });
          imported++;
        } catch (err) { errors.push(`Row ${i + 2}: ${(err as Error).message}`); }
      }
    }

    res.json({ imported, skipped: rows.length - imported - errors.length, errors, total: rows.length });
  },
);

export default router;
