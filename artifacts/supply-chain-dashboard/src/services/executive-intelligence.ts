import type { ErpConnectionState } from "./erp-integration";
import type { OpsIntelState } from "./operational-intelligence";
import type { DecisionEngineState } from "./ai-decision-engine";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface RiskItem {
  id: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
  module: string;
  department: string;
  financialExposure: number | "UNKNOWN";
}

export interface OpportunityItem {
  id: string;
  title: string;
  estimatedSavings: number | "UNKNOWN";
  confidence: number;
  department: string;
  type: string;
}

export interface DeptScore {
  department: string;
  score: number | "UNKNOWN";
  prevScore: number | "UNKNOWN";
  issueCount: number;
  kpiLabel: string;
  trend: "up" | "down" | "flat" | "UNKNOWN";
}

export interface WeeklyTrendPoint {
  day: string;
  ordersPlaced: number;
  deliveriesExpected: number;
}

export interface MonthlyCostPoint {
  month: string;
  spend: number;
  budget: number | "UNKNOWN";
}

export interface FinancialSummary {
  spendYTD: number;
  opportunityPipeline: number | "UNKNOWN";
  budgetTarget: number | "UNKNOWN";
  achievementPct: number | "UNKNOWN";
}

export interface EfficiencyMetric {
  label: string;
  value: number | "UNKNOWN";
  unit: string;
  target: number | "UNKNOWN";
  status: "good" | "warning" | "critical" | "UNKNOWN";
}

export interface ExecState {
  riskScore: number | "UNKNOWN";
  opportunityValue: number | "UNKNOWN";
  efficiencyIndex: number | "UNKNOWN";
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

function deriveRisks(engine: DecisionEngineState): RiskItem[] {
  const risks: RiskItem[] = [];

  if (engine.deterministicContext?.baselineExposures) {
    for (const exp of engine.deterministicContext.baselineExposures) {
      risks.push({
        id: exp.riskId || "UNKNOWN",
        severity: (exp.severity ? String(exp.severity).toLowerCase() : "medium") as RiskSeverity,
        title: "Risk Detected: " + (exp.type || exp.exposureType || "Unknown"),
        detail: "Buffer depletion in " + (exp.productId || "Unknown"),
        module: "Deterministic Engine",
        department: "Supply Chain",
        financialExposure: exp.financialImpact !== undefined ? exp.financialImpact : "UNKNOWN"
      });
    }
  }

  return risks.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}

function deriveOpportunities(engine: DecisionEngineState): OpportunityItem[] {
  return engine.recommendations
    .filter((r) => r.status !== "dismissed" && r.status !== "applied")
    .map((r) => ({
      id: r.id,
      title: r.title,
      estimatedSavings: r.estimatedSavings,
      confidence: r.confidenceScore,
      department: r.affectedDepartment,
      type: r.type,
    }));
}

function buildWeeklyTrends(orders: any[]): WeeklyTrendPoint[] {
  const points: WeeklyTrendPoint[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", { weekday: "short" });

    const placed = orders.filter((o) => o.orderDate && o.orderDate.startsWith(dayStr)).length;
    const expected = orders.filter((o) => o.expectedDelivery && o.expectedDelivery.startsWith(dayStr)).length;

    points.push({
      day: label,
      ordersPlaced: placed,
      deliveriesExpected: expected,
    });
  }
  return points;
}

function buildMonthlyCosts(orders: any[]): MonthlyCostPoint[] {
  const points: MonthlyCostPoint[] = [];
  const now = new Date();
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toLocaleDateString("en-US", { month: "short" });
    const monthPrefix = d.toISOString().substring(0, 7);

    let spend = 0;
    for (const o of orders) {
      if (o.orderDate && o.orderDate.startsWith(monthPrefix)) {
        spend += o.totalValue || 0;
      }
    }

    points.push({
      month: monthStr,
      spend,
      budget: "UNKNOWN",
    });
  }
  return points;
}

function buildDeptPerformance(): DeptScore[] {
  return [
    { department: "Procurement",  score: "UNKNOWN", prevScore: "UNKNOWN", issueCount: 0, kpiLabel: "Lead Time / Supplier", trend: "UNKNOWN" },
    { department: "Warehouse",    score: "UNKNOWN", prevScore: "UNKNOWN", issueCount: 0, kpiLabel: "Accuracy / Fill Rate", trend: "UNKNOWN" },
    { department: "Production",   score: "UNKNOWN", prevScore: "UNKNOWN", issueCount: 0, kpiLabel: "Utilisation", trend: "UNKNOWN" },
    { department: "Supply Chain", score: "UNKNOWN", prevScore: "UNKNOWN", issueCount: 0, kpiLabel: "Turnover / OTIF", trend: "UNKNOWN" },
    { department: "Logistics",    score: "UNKNOWN", prevScore: "UNKNOWN", issueCount: 0, kpiLabel: "OTIF / Delays", trend: "UNKNOWN" },
    { department: "Finance",      score: "UNKNOWN", prevScore: "UNKNOWN", issueCount: 0, kpiLabel: "Working Capital", trend: "UNKNOWN" },
  ];
}

function buildEfficiencyMetrics(): EfficiencyMetric[] {
  return [
    { label: "OEE (Est.)", value: "UNKNOWN", unit: "%", target: "UNKNOWN", status: "UNKNOWN" },
    { label: "OTIF Rate", value: "UNKNOWN", unit: "%", target: "UNKNOWN", status: "UNKNOWN" },
    { label: "Inventory Turns", value: "UNKNOWN", unit: "×", target: "UNKNOWN", status: "UNKNOWN" },
    { label: "Supplier OTIF", value: "UNKNOWN", unit: "/100", target: "UNKNOWN", status: "UNKNOWN" },
  ];
}

export function computeExecState(
  _erp: ErpConnectionState,
  ops: OpsIntelState,
  engine: DecisionEngineState,
  cycle: number,
  orders: any[] = []
): ExecState {
  const risks       = deriveRisks(engine);
  const opps        = deriveOpportunities(engine);
  const weekly      = buildWeeklyTrends(orders);
  const monthly     = buildMonthlyCosts(orders);
  const depts       = buildDeptPerformance();
  const efficiency  = buildEfficiencyMetrics();

  const riskScore = "UNKNOWN";

  const opportunityValue = engine.totalEstimatedSavings;

  const spendYTD = monthly.reduce((s, m) => s + m.spend, 0);

  return {
    riskScore,
    opportunityValue,
    efficiencyIndex: "UNKNOWN",
    activeIssues: risks.length,

    todaysRisks: risks,
    aiOpportunities: opps,
    top5Issues: risks.slice(0, 5),

    weeklyTrends: weekly,
    monthlyCosts: monthly,
    deptPerformance: depts,
    efficiencyMetrics: efficiency,
    financialSummary: {
      spendYTD,
      opportunityPipeline: opportunityValue,
      budgetTarget: "UNKNOWN",
      achievementPct: "UNKNOWN",
    },

    lastUpdatedAt: new Date(),
    cycleCount: cycle,
  };
}
