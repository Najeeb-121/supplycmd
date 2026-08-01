import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, demandRecordsTable } from "@workspace/db";
import { CreateDemandRecordBody } from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter demand schema ─────────────────────────────────────────────────────
export const StrictDemandBody = CreateDemandRecordBody.extend({
  period:           z.string().regex(/^\d{4}-\d{2}$/, "Period must match YYYY-MM format (e.g. 2026-07)"),
  actualDemand:     z.number().min(0),
  forecastedDemand: z.number().min(0),
});

const router: IRouter = Router();

router.get("/demand", async (req, res): Promise<void> => {
  const records = await db.select().from(demandRecordsTable).where(eq(demandRecordsTable.companyId, req.user!.companyId)).orderBy(demandRecordsTable.period);
  res.json(records);
});

router.get("/demand/forecast", async (req, res): Promise<void> => {
  const records = await db.select().from(demandRecordsTable).where(eq(demandRecordsTable.companyId, req.user!.companyId)).orderBy(demandRecordsTable.period);

  // Group by product
  const byProduct = new Map<string, typeof records>();
  for (const r of records) {
    if (!byProduct.has(r.productName)) byProduct.set(r.productName, []);
    byProduct.get(r.productName)!.push(r);
  }

  const results = Array.from(byProduct.entries()).map(([productName, recs]) => {
    const n = recs.length;
    if (n === 0) return null;

    // MAPE = (1/n) * Σ |actual - forecast| / actual * 100
    const mape = recs.reduce((sum, r) => {
      if (r.actualDemand === 0) return sum;
      return sum + Math.abs(r.actualDemand - r.forecastedDemand) / r.actualDemand;
    }, 0) / n * 100;

    // MAD = (1/n) * Σ |actual - forecast|
    const mad = recs.reduce((sum, r) => sum + Math.abs(r.actualDemand - r.forecastedDemand), 0) / n;

    const forecastAccuracy = Math.max(0, 100 - mape);

    // Next period forecast using exponential smoothing (α = 0.3)
    const alpha = 0.3;
    let smoothed = recs[0].forecastedDemand;
    for (const r of recs) {
      smoothed = alpha * r.actualDemand + (1 - alpha) * smoothed;
    }
    const nextPeriodForecast = Math.round(smoothed * 10) / 10;

    // Trend: compare last 2 actuals
    let trend: "up" | "down" | "stable" = "stable";
    if (n >= 2) {
      const diff = recs[n - 1].actualDemand - recs[n - 2].actualDemand;
      if (diff > recs[n - 2].actualDemand * 0.05) trend = "up";
      else if (diff < -recs[n - 2].actualDemand * 0.05) trend = "down";
    }

    return {
      productName,
      mape: Math.round(mape * 10) / 10,
      mad: Math.round(mad * 10) / 10,
      forecastAccuracy: Math.round(forecastAccuracy * 10) / 10,
      nextPeriodForecast,
      trend,
    };
  }).filter(Boolean);

  res.json(results);
});

router.post("/demand", async (req, res): Promise<void> => {
  const result = validateBody(StrictDemandBody, req, res);
  if (!result.ok) return;

  const [record] = await db.insert(demandRecordsTable).values({ ...result.data, companyId: req.user!.companyId }).returning();
  res.status(201).json(record);
});

export default router;