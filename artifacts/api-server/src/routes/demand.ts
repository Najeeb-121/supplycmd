import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, demandRecordsTable } from "@workspace/db";
import { CreateDemandRecordBody } from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter demand schema ─────────────────────────────────────────────────────
export const StrictDemandBody = CreateDemandRecordBody.extend({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must match YYYY-MM format (e.g. 2026-07)"),
  actualDemand: z.number().min(0),
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
    // Forecast accuracy is valid only when both actual demand
    // and a historical forecast exist on the same record.
    const validPairs = recs.filter(
      (r) => r.actualDemand !== null && r.forecastedDemand !== null
    );

    if (validPairs.length === 0) return null;

    // MAPE is undefined when actual demand is zero,
    // so zero-actual rows are excluded from the denominator.
    const mapePairs = validPairs.filter(
      (r) => r.actualDemand !== null && r.actualDemand > 0
    );

    if (mapePairs.length === 0) return null;

    const mape =
      (mapePairs.reduce((sum, r) => {
        const actual = r.actualDemand!;
        const forecast = r.forecastedDemand!;
        return sum + Math.abs(actual - forecast) / actual;
      }, 0) /
        mapePairs.length) *
      100;

    const mad =
      validPairs.reduce((sum, r) => {
        const actual = r.actualDemand!;
        const forecast = r.forecastedDemand!;
        return sum + Math.abs(actual - forecast);
      }, 0) / validPairs.length;

    const forecastAccuracy = Math.max(0, 100 - mape);

    // Deterministic exponential smoothing using only valid pairs.
    const alpha = 0.3;
    let smoothed = validPairs[0].forecastedDemand!;

    for (const r of validPairs) {
      smoothed =
        alpha * r.actualDemand! +
        (1 - alpha) * smoothed;
    }

    const nextPeriodForecast = Math.round(smoothed * 10) / 10;

    // Trend uses only valid actual-demand observations.
    let trend: "up" | "down" | "stable" = "stable";

    if (validPairs.length >= 2) {
      const previousActual = validPairs[validPairs.length - 2].actualDemand!;
      const latestActual = validPairs[validPairs.length - 1].actualDemand!;
      const diff = latestActual - previousActual;

      if (diff > previousActual * 0.05) {
        trend = "up";
      } else if (diff < -previousActual * 0.05) {
        trend = "down";
      }
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

  const [record] = await db
    .insert(demandRecordsTable)
    .values({
      ...result.data,
      companyId: req.user!.companyId,
      source: "MANUAL",
      replenishmentQty: null,
    })
    .returning();
  res.status(201).json(record);
});

export default router;