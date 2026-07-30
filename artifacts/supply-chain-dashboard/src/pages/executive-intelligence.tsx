import { useState, useEffect, useCallback, useRef } from "react";
import {
  buildInitialConnectionState,
  simulateSyncCycle,
  buildSyncingState,
  type ErpConnectionState,
} from "@/services/erp-integration";
import {
  buildInitialOpsState,
  tickOpsState,
  type OpsIntelState,
} from "@/services/operational-intelligence";
import {
  buildInitialDecisionState,
  tickDecisionEngine,
  buildAnalysingState,
  type DecisionEngineState,
} from "@/services/ai-decision-engine";
import {
  buildInitialExecState,
  tickExecState,
  type ExecState,
  type RiskItem,
  type DeptScore,
  type EfficiencyMetric,
} from "@/services/executive-intelligence";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  LineChart, Line, ComposedChart, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  RefreshCw, ShieldAlert, Lightbulb, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, Zap, DollarSign,
  Activity, BarChart3, Building2, Target, Cpu, Calendar,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_MS = 30_000;

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    borderRadius: "6px",
    fontSize: 12,
  },
  itemStyle: { fontFamily: "var(--font-mono)", fontSize: 11 },
};

const RISK_STYLES = {
  critical: { bar: "bg-destructive",  badge: "bg-destructive text-destructive-foreground",           dot: "bg-destructive"  },
  high:     { bar: "bg-orange-500",   badge: "bg-orange-500 text-white",                             dot: "bg-orange-500"   },
  medium:   { bar: "bg-amber-400",    badge: "bg-amber-100 text-amber-700",                          dot: "bg-amber-400"    },
  low:      { bar: "bg-blue-400",     badge: "bg-blue-100 text-blue-700",                            dot: "bg-blue-400"     },
};

const DEPT_COLORS: Record<string, string> = {
  Procurement:  "hsl(var(--primary))",
  Warehouse:    "#10b981",
  Production:   "#f59e0b",
  "Supply Chain": "#8b5cf6",
  Logistics:    "#06b6d4",
  Finance:      "#ec4899",
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmt$ = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

function TrendIcon({ trend, size = "sm" }: { trend: "up" | "down" | "flat"; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  if (trend === "up")   return <TrendingUp   className={cn(cls, "text-emerald-500")} />;
  if (trend === "down") return <TrendingDown className={cn(cls, "text-destructive")} />;
  return <Minus className={cn(cls, "text-muted-foreground")} />;
}

// ─── Summary KPI cards ────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon, color,
}: {
  label: string; value: React.ReactNode; sub: string;
  icon: React.ReactNode; color: "red" | "green" | "amber" | "blue" | "purple";
}) {
  const ring = {
    red:    "border-destructive/30 bg-destructive/5",
    green:  "border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-900/10",
    amber:  "border-amber-400/30 bg-amber-50/50 dark:bg-amber-900/10",
    blue:   "border-blue-400/30 bg-blue-50/50 dark:bg-blue-900/10",
    purple: "border-purple-400/30 bg-purple-50/50 dark:bg-purple-900/10",
  };
  const ic = {
    red:    "text-destructive", green: "text-emerald-600",
    amber:  "text-amber-600",   blue:  "text-blue-600", purple: "text-purple-600",
  };
  return (
    <Card className={cn("border shadow-sm", ring[color])}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        <span className={ic[color]}>{icon}</span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-mono font-bold text-foreground leading-none">{value}</div>
        <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ─── Risk score ring ──────────────────────────────────────────────────────────

function RiskRing({ score }: { score: number }) {
  const r = 22, circ = 2 * Math.PI * r;
  const dash = ((100 - score) / 100) * circ; // inverse: low risk = full green ring
  const color = score >= 60 ? "hsl(var(--destructive))" : score >= 35 ? "#f59e0b" : "#10b981";
  return (
    <svg width="64" height="64" className="-rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${circ - dash} ${dash}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.7s ease" }} />
    </svg>
  );
}

// ─── Risk row ─────────────────────────────────────────────────────────────────

function RiskRow({ risk, rank }: { risk: RiskItem; rank: number }) {
  const s = RISK_STYLES[risk.severity];
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
      <div className={cn("w-1 self-stretch rounded-full shrink-0 mt-0.5", s.bar)} />
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground leading-tight">{risk.title}</p>
          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 capitalize", s.badge)}>
            {risk.severity}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{risk.department}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{risk.detail}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-mono font-semibold text-destructive">{fmtK(risk.financialExposure)}</p>
        <p className="text-[10px] text-muted-foreground">exposure</p>
      </div>
    </div>
  );
}

// ─── Efficiency gauge strip ───────────────────────────────────────────────────

function EfficiencyStrip({ metric }: { metric: EfficiencyMetric }) {
  const pct = Math.min(100, (metric.value / (metric.unit === "/100" ? 100 : Math.max(metric.target * 1.2, metric.value))) * 100);
  const color =
    metric.status === "good" ? "bg-emerald-500" :
    metric.status === "warning" ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{metric.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-bold text-foreground">
            {metric.value.toFixed(metric.unit === "×" ? 1 : 1)}{metric.unit}
          </span>
          <span className="text-[10px] text-muted-foreground">/ {metric.target}{metric.unit}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Dept performance row ─────────────────────────────────────────────────────

function DeptRow({ dept }: { dept: DeptScore }) {
  const color = DEPT_COLORS[dept.department] ?? "hsl(var(--primary))";
  const scoreColor = dept.score >= 80 ? "text-emerald-600" : dept.score >= 60 ? "text-amber-600" : "text-destructive";
  const delta = dept.score - dept.prevScore;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="w-28 shrink-0">
        <p className="text-xs font-medium text-foreground leading-tight">{dept.department}</p>
        <p className="text-[10px] text-muted-foreground">{dept.kpiLabel}</p>
      </div>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${dept.score}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn("text-sm font-mono font-bold w-8 text-right", scoreColor)}>{dept.score}</span>
        <div className="flex items-center gap-0.5">
          {delta > 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> :
           delta < 0 ? <TrendingDown className="w-3 h-3 text-destructive" /> :
           <Minus className="w-3 h-3 text-muted-foreground" />}
          <span className={cn("text-[10px] font-mono", delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
            {delta > 0 ? "+" : ""}{delta}
          </span>
        </div>
        {dept.issueCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-destructive/10 text-destructive">
            {dept.issueCount}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Opportunity row ──────────────────────────────────────────────────────────

function OppRow({ opp, rank }: { opp: ExecState["aiOpportunities"][0]; rank: number }) {
  const pct = Math.round(opp.confidence);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-mono text-muted-foreground w-4 text-center shrink-0">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground leading-tight truncate">{opp.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{opp.department}</Badge>
          <span className="text-[10px] text-muted-foreground">{pct}% confidence</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-bold text-emerald-600">{fmtK(opp.estimatedSavings)}</p>
      </div>
    </div>
  );
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit = "" }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string; unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg p-2.5 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-mono font-semibold text-foreground ml-4">
            {typeof p.value === "number" && unit === "$" ? fmtK(p.value) : `${p.value}${unit}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExecutiveIntelligencePage() {
  // Bootstrap all three upstream state trees
  const initErp    = buildInitialConnectionState();
  const initOps    = buildInitialOpsState(initErp);
  const initEngine = buildInitialDecisionState(initErp, initOps);

  const [erp,    setErp]    = useState<ErpConnectionState>(initErp);
  const [ops,    setOps]    = useState<OpsIntelState>(initOps);
  const [engine, setEngine] = useState<DecisionEngineState>(initEngine);
  const [exec,   setExec]   = useState<ExecState>(() =>
    buildInitialExecState(initErp, initOps, initEngine)
  );
  const [isSyncing, setSyncing] = useState(false);
  const [countdown, setCD]      = useState(SYNC_MS / 1000);
  const [showAllRisks, setShowAllRisks] = useState(false);

  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const runCycle = useCallback((
    curErp: ErpConnectionState,
    curOps: OpsIntelState,
    curEngine: DecisionEngineState,
  ) => {
    setSyncing(true);
    setErp(buildSyncingState(curErp));
    setEngine(buildAnalysingState(curEngine));

    setTimeout(() => {
      setErp((prevErp) => {
        const nextErp = simulateSyncCycle(prevErp);
        setOps((prevOps) => {
          const nextOps = tickOpsState(prevOps, nextErp);
          setEngine((prevEng) => {
            const nextEng = tickDecisionEngine(prevEng, nextErp, nextOps);
            setExec((prevExec) => tickExecState(prevExec, nextErp, nextOps, nextEng));
            return nextEng;
          });
          return nextOps;
        });
        return nextErp;
      });
      setSyncing(false);
      setCD(SYNC_MS / 1000);
    }, 1800);
  }, []);

  useEffect(() => {
    cdRef.current   = setInterval(() => setCD((c) => (c > 0 ? c - 1 : 0)), 1000);
    syncRef.current = setInterval(() => {
      setErp((e) => { setOps((o) => { setEngine((en) => { runCycle(e, o, en); return en; }); return o; }); return e; });
    }, SYNC_MS);
    return () => {
      if (syncRef.current) clearInterval(syncRef.current);
      if (cdRef.current)   clearInterval(cdRef.current);
    };
  }, [runCycle]);

  function handleRefresh() {
    if (isSyncing) return;
    if (syncRef.current) clearInterval(syncRef.current);
    if (cdRef.current)   clearInterval(cdRef.current);
    runCycle(erp, ops, engine);
    cdRef.current   = setInterval(() => setCD((c) => (c > 0 ? c - 1 : 0)), 1000);
    syncRef.current = setInterval(() => {
      setErp((e) => { setOps((o) => { setEngine((en) => { runCycle(e, o, en); return en; }); return o; }); return e; });
    }, SYNC_MS);
  }

  const visibleRisks = showAllRisks ? exec.todaysRisks : exec.todaysRisks.slice(0, 5);
  const riskColor    = exec.riskScore >= 60 ? "red" : exec.riskScore >= 35 ? "amber" : "green";
  const effColor     = exec.efficiencyIndex >= 80 ? "green" : exec.efficiencyIndex >= 60 ? "amber" : "red";

  return (
    <div className="p-6 lg:p-8 space-y-6 bg-background min-h-[100dvh]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Executive Intelligence
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Supply Chain Overview
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {format(exec.lastUpdatedAt, "EEEE, d MMMM yyyy")} · Updated{" "}
            {formatDistanceToNow(exec.lastUpdatedAt, { addSuffix: true })} · Cycle #{exec.cycleCount}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-border bg-card">
            <span className={cn("w-2 h-2 rounded-full", isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
            <span className="text-muted-foreground font-mono">
              {isSyncing ? "Syncing…" : `Next in ${countdown}s`}
            </span>
          </div>
          <Button onClick={handleRefresh} disabled={isSyncing} size="sm" className="gap-2">
            <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary KPI strip ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Risk Score"
          value={
            <div className="flex items-center gap-2">
              <div className="relative shrink-0">
                <RiskRing score={exec.riskScore} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-mono font-bold">{exec.riskScore}</span>
                </div>
              </div>
              <div>
                <div className="text-lg font-mono font-bold leading-none">
                  {exec.riskScore >= 60 ? "High" : exec.riskScore >= 35 ? "Medium" : "Low"}
                </div>
                <div className="text-xs text-muted-foreground">{exec.activeIssues} active issues</div>
              </div>
            </div>
          }
          sub={`${exec.todaysRisks.filter((r) => r.severity === "critical").length} critical · ${exec.todaysRisks.filter((r) => r.severity === "high").length} high`}
          icon={<ShieldAlert className="w-4 h-4" />}
          color={riskColor}
        />
        <SummaryCard
          label="Opportunity Value"
          value={fmtK(exec.opportunityValue)}
          sub={`${exec.aiOpportunities.length} actionable recommendations`}
          icon={<Lightbulb className="w-4 h-4" />}
          color="green"
        />
        <SummaryCard
          label="Efficiency Index"
          value={`${exec.efficiencyIndex}`}
          sub={`${exec.efficiencyIndex >= 80 ? "Above target" : exec.efficiencyIndex >= 60 ? "Near target" : "Below target"} · composite score`}
          icon={<Activity className="w-4 h-4" />}
          color={effColor}
        />
        <SummaryCard
          label="Savings YTD"
          value={fmtK(exec.financialSummary.savingsYTD + exec.financialSummary.avoidedCostsYTD)}
          sub={`${exec.financialSummary.achievementPct}% of annual target achieved`}
          icon={<DollarSign className="w-4 h-4" />}
          color="blue"
        />
      </div>

      {/* ── Today's Risks + AI Opportunities ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Today's Risks */}
        <Card className="lg:col-span-3 border-border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-destructive" />
                  Today's Risks
                </CardTitle>
                <CardDescription>Live issues requiring executive attention</CardDescription>
              </div>
              <div className="flex gap-1.5">
                {(["critical","high","medium"] as const).map((s) => {
                  const n = exec.todaysRisks.filter((r) => r.severity === s).length;
                  if (n === 0) return null;
                  return (
                    <Badge key={s} variant="secondary"
                      className={cn("text-[10px] px-1.5 gap-1", RISK_STYLES[s].badge)}>
                      {n} {s}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            {exec.todaysRisks.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active risks — all systems nominal</p>
              </div>
            ) : (
              <>
                {visibleRisks.map((r, i) => <RiskRow key={r.id} risk={r} rank={i + 1} />)}
                {exec.todaysRisks.length > 5 && (
                  <Button variant="ghost" size="sm"
                    className="w-full mt-2 text-xs text-muted-foreground h-7"
                    onClick={() => setShowAllRisks((v) => !v)}>
                    {showAllRisks ? "Show fewer" : `Show ${exec.todaysRisks.length - 5} more risks`}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* AI Opportunities */}
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              AI Opportunities
            </CardTitle>
            <CardDescription>
              Top recommendations · {fmtK(exec.financialSummary.opportunityPipeline)} pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            {exec.aiOpportunities.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No open opportunities</p>
              </div>
            ) : (
              exec.aiOpportunities.map((o, i) => <OppRow key={o.id} opp={o} rank={i + 1} />)
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Weekly Trends ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Weekly KPI Trends
          </CardTitle>
          <CardDescription>7-day performance across key supply chain metrics</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={exec.weeklyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                {[
                  { id: "inv",  color: "hsl(var(--primary))"  },
                  { id: "prod", color: "#f59e0b" },
                  { id: "ofr",  color: "#10b981" },
                  { id: "sup",  color: "#8b5cf6" },
                ].map(({ id, color }) => (
                  <linearGradient key={id} id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={color} stopOpacity={0}    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={8} />
              <YAxis domain={[50, 100]} axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dx={-4} />
              <Tooltip content={<ChartTooltip unit="%" />} />
              <Legend iconType="circle" iconSize={8}
                formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Area type="monotone" dataKey="inventoryAccuracy" name="Inv. Accuracy"
                stroke="hsl(var(--primary))" fill="url(#grad-inv)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="productionUtil" name="Production Util."
                stroke="#f59e0b" fill="url(#grad-prod)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="fulfillmentRate" name="Fulfillment Rate"
                stroke="#10b981" fill="url(#grad-ofr)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="supplierPerf" name="Supplier Perf."
                stroke="#8b5cf6" fill="url(#grad-sup)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Financial Impact + Operational Efficiency ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Monthly Cost Savings */}
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Monthly Cost Savings
                </CardTitle>
                <CardDescription>Realised savings vs avoided costs vs target (YTD)</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Achievement</p>
                <p className="text-lg font-mono font-bold text-foreground">
                  {exec.financialSummary.achievementPct}%
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={exec.monthlyCosts} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} dx={-4} />
                <Tooltip content={<ChartTooltip unit="$" />} />
                <Legend iconType="square" iconSize={8}
                  formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                <Bar dataKey="savings" name="Savings" fill="hsl(var(--primary))"
                  radius={[3, 3, 0, 0]} barSize={14} />
                <Bar dataKey="avoidedCosts" name="Avoided Costs" fill="#10b981"
                  radius={[3, 3, 0, 0]} barSize={14} />
                <Line type="monotone" dataKey="target" name="Target" stroke="#f59e0b"
                  strokeWidth={2} dot={false} strokeDasharray="5 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Operational Efficiency */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Operational Efficiency
            </CardTitle>
            <CardDescription>Key performance vs target</CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-4">
            {/* Efficiency index ring */}
            <div className="flex items-center gap-4 pb-2 border-b border-border/50">
              <div className="relative">
                <svg width="72" height="72" className="-rotate-90">
                  <circle cx="36" cy="36" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                  <circle cx="36" cy="36" r="28" fill="none"
                    stroke={exec.efficiencyIndex >= 80 ? "#10b981" : exec.efficiencyIndex >= 60 ? "#f59e0b" : "hsl(var(--destructive))"}
                    strokeWidth="6"
                    strokeDasharray={`${(exec.efficiencyIndex / 100) * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.7s ease" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-mono font-bold text-foreground leading-none">
                    {exec.efficiencyIndex}
                  </span>
                  <span className="text-[9px] text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Efficiency Index</p>
                <p className="text-xs text-muted-foreground">Composite of 4 core KPIs</p>
                <Badge variant="secondary"
                  className={cn("text-[10px] mt-1",
                    exec.efficiencyIndex >= 80 ? "bg-emerald-100 text-emerald-700" :
                    exec.efficiencyIndex >= 60 ? "bg-amber-100 text-amber-700" :
                    "bg-destructive/10 text-destructive")}>
                  {exec.efficiencyIndex >= 80 ? "On Track" : exec.efficiencyIndex >= 60 ? "Improving" : "Needs Attention"}
                </Badge>
              </div>
            </div>
            {exec.efficiencyMetrics.map((m) => (
              <EfficiencyStrip key={m.label} metric={m} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Top 5 Issues ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Top 5 Issues
              </CardTitle>
              <CardDescription>Highest-priority items across all modules ranked by financial exposure</CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {fmtK(exec.top5Issues.reduce((s, r) => s + r.financialExposure, 0))} total exposure
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          {exec.top5Issues.length === 0 ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No outstanding issues — all clear</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left pb-2 pr-4 font-medium w-6">#</th>
                    <th className="text-left pb-2 pr-4 font-medium">Issue</th>
                    <th className="text-left pb-2 pr-4 font-medium hidden md:table-cell">Module</th>
                    <th className="text-left pb-2 pr-4 font-medium hidden sm:table-cell">Department</th>
                    <th className="text-left pb-2 pr-4 font-medium hidden lg:table-cell">Severity</th>
                    <th className="text-right pb-2 font-medium">Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {exec.top5Issues.map((issue, i) => (
                    <tr key={issue.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-foreground text-sm leading-tight">{issue.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 hidden sm:block">
                          {issue.detail}
                        </p>
                      </td>
                      <td className="py-3 pr-4 hidden md:table-cell">
                        <Badge variant="outline" className="text-xs">{issue.module}</Badge>
                      </td>
                      <td className="py-3 pr-4 hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">{issue.department}</span>
                      </td>
                      <td className="py-3 pr-4 hidden lg:table-cell">
                        <Badge variant="secondary"
                          className={cn("text-[10px] capitalize", RISK_STYLES[issue.severity].badge)}>
                          {issue.severity}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-mono font-semibold text-sm text-destructive">
                          {fmtK(issue.financialExposure)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Department Performance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bar chart */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Department Performance
            </CardTitle>
            <CardDescription>Composite scores derived from KPIs and open issues</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={exec.deptPerformance.map((d) => ({
                  dept: d.department.replace(" ", "\n"),
                  score: d.score,
                  fill: DEPT_COLORS[d.department] ?? "hsl(var(--primary))",
                }))}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="dept" type="category" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                  formatter={(v: number) => [`${v}/100`, "Score"]}
                  cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={18}>
                  {exec.deptPerformance.map((d) => (
                    <rect key={d.department} fill={DEPT_COLORS[d.department]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Score detail list */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Department Detail
            </CardTitle>
            <CardDescription>Score vs previous cycle · open AI issues</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {exec.deptPerformance.map((d) => <DeptRow key={d.department} dept={d} />)}
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Overall Operations Health</span>
                <span className="font-mono font-bold text-foreground">{ops.healthScore}/100</span>
              </div>
              <Progress value={ops.healthScore} className="h-2 mt-1.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Financial Impact summary ── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Financial Impact Summary
          </CardTitle>
          <CardDescription>Year-to-date financial performance vs annual targets</CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Realised Savings YTD",
                value: fmtK(exec.financialSummary.savingsYTD),
                sub: "Confirmed cost reductions",
                color: "text-emerald-600",
              },
              {
                label: "Avoided Costs YTD",
                value: fmtK(exec.financialSummary.avoidedCostsYTD),
                sub: "Costs prevented by early action",
                color: "text-blue-600",
              },
              {
                label: "Open Opportunity",
                value: fmtK(exec.financialSummary.opportunityPipeline),
                sub: `${exec.aiOpportunities.length} AI recommendations`,
                color: "text-amber-600",
              },
              {
                label: "Target Achievement",
                value: `${exec.financialSummary.achievementPct}%`,
                sub: `of ${fmtK(exec.financialSummary.savingsTarget)} annual target`,
                color: exec.financialSummary.achievementPct >= 75 ? "text-emerald-600" : "text-amber-600",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                <p className={cn("text-2xl font-mono font-bold leading-none", color)}>{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Annual savings target progress</span>
              <span className="font-mono font-semibold text-foreground">
                {fmtK(exec.financialSummary.savingsYTD + exec.financialSummary.avoidedCostsYTD)} / {fmtK(exec.financialSummary.savingsTarget)}
              </span>
            </div>
            <Progress value={exec.financialSummary.achievementPct} className="h-2" />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
