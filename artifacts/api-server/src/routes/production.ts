import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, avg, sum } from "drizzle-orm";
import { db, productionRunsTable } from "@workspace/db";
import {
  CreateProductionRunBody,
  UpdateProductionRunBody,
  UpdateProductionRunParams,
} from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter production schema with cross-field rule ──────────────────────────
const StrictProductionBody = CreateProductionRunBody
  .extend({
    plannedUnits:   z.number().int().min(0),
    actualUnits:    z.number().int().min(0),
    plannedTimeMin: z.number().int().min(0),
    actualTimeMin:  z.number().int().min(0),
    defects:        z.number().int().min(0),
    downtimeMin:    z.number().int().min(0),
  })
  .refine(
    (d) => d.defects <= d.actualUnits,
    { message: "Defects cannot exceed Actual Units Produced", path: ["defects"] },
  );

const router: IRouter = Router();

router.get("/production", async (_req, res): Promise<void> => {
  const runs = await db.select().from(productionRunsTable).orderBy(productionRunsTable.runDate);
  res.json(runs);
});

router.get("/production/metrics/oee", async (_req, res): Promise<void> => {
  const runs = await db.select().from(productionRunsTable);
  const totalRuns = runs.length;

  if (totalRuns === 0) {
    res.json({
      oeePercent: 0,
      availabilityPercent: 0,
      performancePercent: 0,
      qualityPercent: 0,
      avgTaktTimeSec: 0,
      avgCycleTimeSec: 0,
      throughputPerHour: 0,
      totalRuns: 0,
    });
    return;
  }

  // OEE = Availability × Performance × Quality
  // Availability = (Actual Time - Downtime) / Planned Time
  // Performance = Actual Units / (Actual Units + what could have been made in lost time)
  // Quality = (Actual Units - Defects) / Actual Units
  let totalAvailability = 0;
  let totalPerformance = 0;
  let totalQuality = 0;
  let totalTaktSec = 0;
  let totalCycleSec = 0;
  let totalThroughput = 0;

  for (const run of runs) {
    const availability = run.plannedTimeMin > 0
      ? Math.min(1, (run.actualTimeMin - run.downtimeMin) / run.plannedTimeMin)
      : 0;
    const performance = run.plannedUnits > 0
      ? Math.min(1, run.actualUnits / run.plannedUnits)
      : 0;
    const quality = run.actualUnits > 0
      ? Math.max(0, (run.actualUnits - run.defects) / run.actualUnits)
      : 0;

    totalAvailability += availability;
    totalPerformance += performance;
    totalQuality += quality;

    // Takt time = Available time (min) / demand units, in seconds
    const taktSec = run.plannedUnits > 0 ? (run.plannedTimeMin * 60) / run.plannedUnits : 0;
    const cycleSec = run.actualUnits > 0 ? (run.actualTimeMin * 60) / run.actualUnits : 0;
    totalTaktSec += taktSec;
    totalCycleSec += cycleSec;

    // Throughput per hour
    const throughput = run.actualTimeMin > 0 ? (run.actualUnits / run.actualTimeMin) * 60 : 0;
    totalThroughput += throughput;
  }

  const avgAvailability = totalAvailability / totalRuns;
  const avgPerformance = totalPerformance / totalRuns;
  const avgQuality = totalQuality / totalRuns;
  const oee = avgAvailability * avgPerformance * avgQuality;

  res.json({
    oeePercent: Math.round(oee * 1000) / 10,
    availabilityPercent: Math.round(avgAvailability * 1000) / 10,
    performancePercent: Math.round(avgPerformance * 1000) / 10,
    qualityPercent: Math.round(avgQuality * 1000) / 10,
    avgTaktTimeSec: Math.round((totalTaktSec / totalRuns) * 10) / 10,
    avgCycleTimeSec: Math.round((totalCycleSec / totalRuns) * 10) / 10,
    throughputPerHour: Math.round((totalThroughput / totalRuns) * 10) / 10,
    totalRuns,
  });
});

router.post("/production", async (req, res): Promise<void> => {
  const result = validateBody(StrictProductionBody, req, res);
  if (!result.ok) return;

  const [run] = await db.insert(productionRunsTable).values(result.data).returning();
  res.status(201).json(run);
});

router.patch("/production/:id", async (req, res): Promise<void> => {
  const params = UpdateProductionRunParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateProductionRunBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(productionRunsTable)
    .set(parsed.data)
    .where(eq(productionRunsTable.id, params.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Production run not found" }); return; }
  res.json(updated);
});

export default router;
