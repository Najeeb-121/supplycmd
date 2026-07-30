/**
 * Executive Intelligence Service
 * Composes ERP, Operational, and AI Decision Engine state into a single
 * executive summary. Pure logic — no UI imports, no API calls.
 */

import type { ErpConnectionState } from "./erp-integration";
import type { OpsIntelState, KpiMetric } from "./operational-intelligence";
import type { DecisionEngineState, Recommendation } from "./ai-decision-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface RiskItem {
  id: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
  module: string;
  department: string;
  financialExposure: number; // USD
}

export interface OpportunityItem {
  id: string;
  title: string;
  estimatedSavings: number;
  confidence: number;
  department: string;
  type: string;
}

export interface DeptScore {
  department: string;
  score: number;       // 0–100
  prevScore: number;
  issueCount: number;
  kpiLabel: string;
  trend: "up" | "down" | "flat";
}

export interface WeeklyTrendPoint {
  day: string;
  inventoryAccuracy: number;
  productionUtil: number;
  fulfillmentRate: number;
  supplierPerf: number;
}

export interface MonthlyCostPoint {
  month: string;
  savings: number;
  avoidedCosts: number;
  target: number;
}

export interface FinancialSummary {
  savingsYTD: number;
  avoidedCostsYTD: number;
  opportunityPipeline: number;
  savingsTarget: number;
  achievementPct: number;
}

export interface EfficiencyMetric {
  label: string;
  value: number;
  unit: string;
  target: number;
  status: "good" | "warning" | "critical";
}

export interface ExecState {
  riskScore: number;          // 0–100 higher = riskier
  opportunityValue: number;
  efficiencyIndex: number;    // 0–100
  activeIssues: number;

  todaysRisks: RiskItem[];
  aiOpportunities: OpportunityItem[];
  top5Issues: RiskItem[];

  weeklyTrends: WeeklyTrendPoint[];
  monthlyCosts: MonthlyCostPoint[];
  deptPerformance: DeptScore[];
  financialSummary: FinancialSummary;
  efficiencyMetrics: EfficiencyMetric[];

  lastUpdatedAt: Date;
  cycleCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function kpiVal(ops: OpsIntelState, id: string): number {
  return ops.kpis.find((k) => k.id === id)?.value ?? 0;
}

function kpiStatus(ops: OpsIntelState, id: string) {
  return ops.kpis.find((k) => k.id === id)?.status ?? "good";
}

function kpiSpark(ops: OpsIntelState, id: string): number[] {
  return ops.kpis.find((k) => k.id === id)?.sparkline ?? [];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Risk derivation ──────────────────────────────────────────────────────────

function deriveRisks(
  ops: OpsIntelState,
  engine: DecisionEngineState
): RiskItem[] {
  const risks: RiskItem[] = [];

  // From OPS KPIs
  for (const kpi of ops.kpis) {
    if (kpi.status === "good") continue;
    const severity: RiskSeverity = kpi.status === "critical" ? "critical" : "high";
    const exposure =
      kpi.id === "inventory_accuracy"      ? 18_000 :
      kpi.id === "production_utilization"  ? 24_000 :
      kpi.id === "order_fulfillment_rate"  ? 31_000 :
      kpi.id === "supplier_performance"    ? 15_000 :
      kpi.id === "purchase_lead_time"      ? 12_000 :
      kpi.id === "stock_turnover"          ? 9_000  :
      kpi.id === "late_deliveries"         ? 20_000 :
      kpi.id === "warehouse_fill_rate"     ? 7_000  : 5_000;

    risks.push({
      id: `kpi-${kpi.id}`,
      severity,
      title: `${kpi.label} ${kpi.status === "critical" ? "Critical" : "Below Target"}`,
      detail: `${kpi.label} at ${kpi.value.toFixed(kpi.format === "integer" ? 0 : 1)}${kpi.unit} — target is ${kpi.target}${kpi.unit}`,
      module: "Operational KPIs",
      department:
        kpi.id.includes("supplier") || kpi.id.includes("lead") || kpi.id.includes("order_fulfillment")
          ? "Procurement"
          : kpi.id.includes("production")
          ? "Production"
          : kpi.id.includes("warehouse") || kpi.id.includes("stock") || kpi.id.includes("inventory")
          ? "Warehouse"
          : "Supply Chain",
      financialExposure: exposure,
    });
  }

  // From AI engine critical/high recs
  for (const rec of engine.recommendations) {
    if (rec.priority !== "critical" && rec.priority !== "high") continue;
    if (rec.status === "dismissed" || rec.status === "applied") continue;
    risks.push({
      id: `ai-${rec.id}`,
      severity: rec.priority as RiskSeverity,
      title: rec.title,
      detail: rec.recommendation.slice(0, 120) + (rec.recommendation.length > 120 ? "…" : ""),
      module: "AI Decision Engine",
      department: rec.affectedDepartment,
      financialExposure: rec.estimatedSavings,
    });
  }

  // Sort: critical first, then by exposure
  return risks.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return b.financialExposure - a.financialExposure;
  });
}

// ─── Opportunity derivation ───────────────────────────────────────────────────

function deriveOpportunities(engine: DecisionEngineState): OpportunityItem[] {
  return engine.recommendations
    .filter((r) => r.status !== "dismissed" && r.status !== "applied")
    .sort((a, b) => b.estimatedSavings - a.estimatedSavings)
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      title: r.title,
      estimatedSavings: r.estimatedSavings,
      confidence: r.confidenceScore,
      department: r.affectedDepartment,
      type: r.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
}

// ─── Weekly trends ────────────────────────────────────────────────────────────

function buildWeeklyTrends(ops: OpsIntelState): WeeklyTrendPoint[] {
  const invSpark  = kpiSpark(ops, "inventory_accuracy");
  const prodSpark = kpiSpark(ops, "production_utilization");
  const ofrSpark  = kpiSpark(ops, "order_fulfillment_rate");
  const supSpark  = kpiSpark(ops, "supplier_performance");

  return DAYS.map((day, i) => ({
    day,
    inventoryAccuracy: parseFloat((invSpark[i]  ?? 97).toFixed(1)),
    productionUtil:    parseFloat((prodSpark[i] ?? 78).toFixed(1)),
    fulfillmentRate:   parseFloat((ofrSpark[i]  ?? 95).toFixed(1)),
    supplierPerf:      parseFloat((supSpark[i]  ?? 81).toFixed(1)),
  }));
}

// ─── Monthly costs ────────────────────────────────────────────────────────────

function buildMonthlyCosts(cycle: number): MonthlyCostPoint[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-based

  return MONTHS.map((month, i) => {
    const seed = i * 137 + cycle * 7;
    // Pseudo-random but stable per seed
    const rand = (s: number) => Math.abs(Math.sin(s) * 10000) % 1;

    const base = 18_000 + i * 800;
    const savings     = Math.round(base + rand(seed)       * 8_000);
    const avoidedCosts = Math.round(base * 0.6 + rand(seed + 1) * 6_000);
    const target      = Math.round(base * 1.1);
    return {
      month,
      savings:      i <= currentMonth ? savings      : 0,
      avoidedCosts: i <= currentMonth ? avoidedCosts : 0,
      target,
    };
  });
}

// ─── Department performance ───────────────────────────────────────────────────

function buildDeptPerformance(
  ops: OpsIntelState,
  engine: DecisionEngineState
): DeptScore[] {
  const depts: Array<{ dept: string; kpiIds: string[]; kpiLabel: string }> = [
    { dept: "Procurement",  kpiIds: ["purchase_lead_time", "supplier_performance"],  kpiLabel: "Lead Time / Supplier" },
    { dept: "Warehouse",    kpiIds: ["inventory_accuracy", "warehouse_fill_rate"],   kpiLabel: "Accuracy / Fill Rate" },
    { dept: "Production",   kpiIds: ["production_utilization"],                      kpiLabel: "Utilisation" },
    { dept: "Supply Chain", kpiIds: ["stock_turnover", "order_fulfillment_rate"],    kpiLabel: "Turnover / OTIF" },
    { dept: "Logistics",    kpiIds: ["late_deliveries", "order_fulfillment_rate"],   kpiLabel: "OTIF / Delays" },
    { dept: "Finance",      kpiIds: ["stock_turnover", "inventory_accuracy"],        kpiLabel: "Working Capital" },
  ];

  return depts.map(({ dept, kpiIds, kpiLabel }) => {
    const scores: number[] = kpiIds.map((id) => {
      const kpi = ops.kpis.find((k) => k.id === id);
      if (!kpi) return 75;
      // Normalise to 0-100 based on status
      if (kpi.status === "good")     return clamp(80 + (kpi.value / kpi.target) * 15, 0, 100);
      if (kpi.status === "warning")  return clamp(50 + (kpi.value / kpi.target) * 20, 0, 79);
      return clamp(20 + (kpi.value / kpi.target) * 20, 0, 49);
    });

    const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const issueCount = engine.recommendations.filter(
      (r) => r.affectedDepartment === dept && r.status !== "dismissed" && r.status !== "applied"
    ).length;

    return {
      department: dept,
      score,
      prevScore: clamp(score + (Math.sin(dept.length * 3) > 0 ? -2 : 2), 0, 100),
      issueCount,
      kpiLabel,
      trend: score > clamp(score + 2, 0, 100) ? "down" : score < clamp(score - 2, 0, 100) ? "up" : "flat" as "up" | "down" | "flat",
    };
  });
}

// ─── Efficiency metrics ───────────────────────────────────────────────────────

function buildEfficiencyMetrics(ops: OpsIntelState): EfficiencyMetric[] {
  return [
    {
      label: "OEE (Est.)",
      value: parseFloat((kpiVal(ops, "production_utilization") * 0.92).toFixed(1)),
      unit: "%",
      target: 85,
      status: kpiStatus(ops, "production_utilization"),
    },
    {
      label: "OTIF Rate",
      value: kpiVal(ops, "order_fulfillment_rate"),
      unit: "%",
      target: 98,
      status: kpiStatus(ops, "order_fulfillment_rate"),
    },
    {
      label: "Inventory Turns",
      value: kpiVal(ops, "stock_turnover"),
      unit: "×",
      target: 10,
      status: kpiStatus(ops, "stock_turnover"),
    },
    {
      label: "Supplier OTIF",
      value: kpiVal(ops, "supplier_performance"),
      unit: "/100",
      target: 85,
      status: kpiStatus(ops, "supplier_performance"),
    },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildInitialExecState(
  erp: ErpConnectionState,
  ops: OpsIntelState,
  engine: DecisionEngineState
): ExecState {
  return computeExecState(erp, ops, engine, 0);
}

export function tickExecState(
  prev: ExecState,
  erp: ErpConnectionState,
  ops: OpsIntelState,
  engine: DecisionEngineState
): ExecState {
  return computeExecState(erp, ops, engine, prev.cycleCount + 1);
}

function computeExecState(
  _erp: ErpConnectionState,
  ops: OpsIntelState,
  engine: DecisionEngineState,
  cycle: number
): ExecState {
  const risks       = deriveRisks(ops, engine);
  const opps        = deriveOpportunities(engine);
  const weekly      = buildWeeklyTrends(ops);
  const monthly     = buildMonthlyCosts(cycle);
  const depts       = buildDeptPerformance(ops, engine);
  const efficiency  = buildEfficiencyMetrics(ops);

  const criticalCount = risks.filter((r) => r.severity === "critical").length;
  const highCount     = risks.filter((r) => r.severity === "high").length;
  const riskScore     = clamp(criticalCount * 25 + highCount * 12 + (100 - ops.healthScore) * 0.4, 0, 100);

  const opportunityValue = opps.reduce((s, o) => s + o.estimatedSavings, 0);

  const effKeys = ["production_utilization", "order_fulfillment_rate", "inventory_accuracy", "supplier_performance"];
  const effVals = effKeys.map((id) => {
    const kpi = ops.kpis.find((k) => k.id === id);
    if (!kpi) return 75;
    return clamp((kpi.value / kpi.target) * 100, 0, 100);
  });
  const efficiencyIndex = Math.round(effVals.reduce((a, b) => a + b, 0) / effVals.length);

  const completedMonths = monthly.filter((m) => m.savings > 0);
  const savingsYTD       = completedMonths.reduce((s, m) => s + m.savings, 0);
  const avoidedCostsYTD  = completedMonths.reduce((s, m) => s + m.avoidedCosts, 0);
  const savingsTarget    = monthly.reduce((s, m) => s + m.target, 0);
  const achievementPct   = savingsTarget > 0 ? Math.round((savingsYTD / savingsTarget) * 100) : 0;

  return {
    riskScore: Math.round(riskScore),
    opportunityValue,
    efficiencyIndex,
    activeIssues: risks.length,

    todaysRisks: risks,
    aiOpportunities: opps,
    top5Issues: risks.slice(0, 5),

    weeklyTrends: weekly,
    monthlyCosts: monthly,
    deptPerformance: depts,
    efficiencyMetrics: efficiency,
    financialSummary: {
      savingsYTD,
      avoidedCostsYTD,
      opportunityPipeline: opportunityValue,
      savingsTarget,
      achievementPct,
    },

    lastUpdatedAt: new Date(),
    cycleCount: cycle,
  };
}
