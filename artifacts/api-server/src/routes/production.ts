import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, productionRunsTable } from "@workspace/db";
import {
  CreateProductionRunBody,
  UpdateProductionRunBody,
  UpdateProductionRunParams,
} from "@workspace/api-zod";
import { validateBody } from "../lib/validate.js";

// ── Stricter production schema with cross-field rule ──────────────────────────
export const StrictProductionBody = CreateProductionRunBody
  .extend({
    plannedUnits: z.number().min(0),
    actualUnits: z.number().min(0),
    plannedTimeMin: z.number().int().min(0),
    actualTimeMin: z.number().int().min(0),
    defects: z.number().int().min(0),
    downtimeMin: z.number().int().min(0),
  })
  .refine(
    (d) => d.defects <= d.actualUnits,
    { message: "Defects cannot exceed Actual Units Produced", path: ["defects"] },
  );

const router: IRouter = Router();

router.get("/production", async (req, res): Promise<void> => {
  const runs = await db.select().from(productionRunsTable).where(eq(productionRunsTable.companyId, req.user!.companyId)).orderBy(productionRunsTable.runDate);
  res.json(runs);
});

router.get("/production/metrics/oee", async (req, res): Promise<void> => {
  const runs = await db
    .select()
    .from(productionRunsTable)
    .where(eq(productionRunsTable.companyId, req.user!.companyId));
  const executedRuns = runs.filter(
    (run) =>
      run.moState !== "cancel" &&
      (
        run.actualUnits > 0 ||
        (run.actualTimeMin !== null && run.actualTimeMin > 0)
      ),
  );

  const average = (values: number[]): number | null =>
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

  const roundMetric = (value: number | null): number | null =>
    value === null ? null : Math.round(value * 10) / 10;

  const roundPercent = (value: number | null): number | null =>
    value === null ? null : Math.round(value * 1000) / 10;

  const availabilityValues: number[] = [];
  const performanceValues: number[] = [];
  const qualityValues: number[] = [];
  const oeeValues: number[] = [];
  const taktValues: number[] = [];
  const cycleValues: number[] = [];
  const throughputValues: number[] = [];

  for (const run of executedRuns) {
    const availability =
      run.plannedTimeMin !== null &&
        run.plannedTimeMin > 0 &&
        run.actualTimeMin !== null &&
        run.downtimeMin !== null
        ? Math.max(
          0,
          Math.min(
            1,
            (run.actualTimeMin - run.downtimeMin) /
            run.plannedTimeMin,
          ),
        )
        : null;

    const performance =
      run.plannedUnits > 0
        ? Math.max(0, Math.min(1, run.actualUnits / run.plannedUnits))
        : null;

    const quality =
      run.actualUnits > 0 && run.defects !== null
        ? Math.max(
          0,
          Math.min(
            1,
            (run.actualUnits - run.defects) / run.actualUnits,
          ),
        )
        : null;

    if (availability !== null) availabilityValues.push(availability);
    if (performance !== null) performanceValues.push(performance);
    if (quality !== null) qualityValues.push(quality);

    if (
      availability !== null &&
      performance !== null &&
      quality !== null
    ) {
      oeeValues.push(availability * performance * quality);
    }

    if (run.plannedTimeMin !== null && run.plannedUnits > 0) {
      taktValues.push(
        (run.plannedTimeMin * 60) / run.plannedUnits,
      );
    }

    if (run.actualTimeMin !== null && run.actualUnits > 0) {
      cycleValues.push(
        (run.actualTimeMin * 60) / run.actualUnits,
      );
    }

    if (run.actualTimeMin !== null && run.actualTimeMin > 0) {
      throughputValues.push(
        (run.actualUnits / run.actualTimeMin) * 60,
      );
    }
  }

  res.json({
    oeePercent: roundPercent(average(oeeValues)),
    availabilityPercent: roundPercent(average(availabilityValues)),
    performancePercent: roundPercent(average(performanceValues)),
    qualityPercent: roundPercent(average(qualityValues)),
    avgTaktTimeSec: roundMetric(average(taktValues)),
    avgCycleTimeSec: roundMetric(average(cycleValues)),
    throughputPerHour: roundMetric(average(throughputValues)),
    totalRuns: runs.length,
  });
});

router.post("/production", async (req, res): Promise<void> => {
  const result = validateBody(StrictProductionBody, req, res);
  if (!result.ok) return;

  const [run] = await db.insert(productionRunsTable).values({ ...result.data, companyId: req.user!.companyId }).returning();
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
    .where(and(eq(productionRunsTable.id, params.data.id), eq(productionRunsTable.companyId, req.user!.companyId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Production run not found" }); return; }
  res.json(updated);
});

export default router;
