import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bomsTable, bomLinesTable } from "@workspace/db";
import { DataValue } from "@workspace/db/simulation-types";

export function wrap<T>(value: T | null | undefined, status: DataValue<T>["status"] = "VERIFIED", source: string = "ERP"): DataValue<T> {
  if (value === null || value === undefined) {
    return { value: null, status: "MISSING", source, confidence: "LOW" };
  }
  return { value, status, source, confidence: "HIGH" };
}

const router: IRouter = Router();

// ── GET /manufacturing/kpis ──────────────────────────────────────────────────
router.get("/manufacturing/kpis", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;
  
  const boms = await db.select().from(bomsTable).where(eq(bomsTable.companyId, companyId));
  const lines = await db.select().from(bomLinesTable).where(eq(bomLinesTable.companyId, companyId));
  
  const activeBoms = boms.filter(b => b.isActive);
  const totalBoms = activeBoms.length;
  
  let phantomCount = 0;
  let totalScrapPct = 0;
  
  for (const bom of activeBoms) {
    if (bom.bomType === 'phantom') phantomCount++;
    totalScrapPct += bom.scrapChargePct;
  }
  
  const activeBomIds = new Set(activeBoms.map(b => b.id));
  const activeLines = lines.filter(l => activeBomIds.has(l.bomId) && !l.isDeleted);
  
  const avgScrapPct = totalBoms > 0 ? (totalScrapPct / totalBoms) : 0;
  const avgComponents = totalBoms > 0 ? (activeLines.length / totalBoms) : 0;
  
  res.json({
    totalBoms: wrap(totalBoms, "VERIFIED"),
    phantomBoms: wrap(phantomCount, "DERIVED"),
    avgScrapPercentage: wrap(Math.round(avgScrapPct * 10) / 10, "DERIVED"),
    avgComponentsPerBom: wrap(Math.round(avgComponents * 10) / 10, "DERIVED"),
  });
});

// ── GET /manufacturing/boms ──────────────────────────────────────────────────
router.get("/manufacturing/boms", async (req, res): Promise<void> => {
  const companyId = req.user!.companyId;
  
  const boms = await db.select().from(bomsTable).where(eq(bomsTable.companyId, companyId));
  const lines = await db.select().from(bomLinesTable).where(eq(bomLinesTable.companyId, companyId));
  
  const bomsResult = boms.map(bom => {
    const bomLines = lines.filter(l => l.bomId === bom.id && !l.isDeleted);
    return {
      ...bom,
      components: bomLines
    };
  });
  
  res.json(bomsResult);
});

export default router;
