import { useState, useEffect, useCallback, useRef } from "react";
import { useRealOpsIntel } from "@/hooks/use-real-ops-intel";
import { useRealDecisionEngine } from "@/hooks/use-real-decision-engine";
import { useListOrders, useGetOdooSyncLog, getGetOdooSyncLogQueryKey } from "@workspace/api-client-react";
import {
  computeExecState,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  LineChart, Line, ComposedChart, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  RefreshCw, ShieldAlert, BrainCircuit, Lightbulb, TrendingUp, TrendingDown,
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

const fmt$ = (n: number | "UNKNOWN") =>
  n === "UNKNOWN" ? "UNKNOWN" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n as number);

const fmtK = (n: number | "UNKNOWN") =>
  n === "UNKNOWN" ? "UNKNOWN" : (n as number) >= 1_000_000 ? `$${((n as number) / 1_000_000).toFixed(1)}M` : (n as number) >= 1_000 ? `$${((n as number) / 1_000).toFixed(0)}K` : `$${n}`;

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

function RiskRing({ score }: { score: number | "UNKNOWN" }) {
  if (score === "UNKNOWN") {
    return (
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r="22" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      </svg>
    );
  }
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
        
        {/* Highlighted Recommendation/Detail Box */}
        <div className={cn("mt-2 p-2.5 rounded-md flex gap-2 items-start", 
          risk.severity === "critical" ? "bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20" : 
          risk.severity === "high" ? "bg-amber-500/10 text-amber-900 dark:text-amber-400 border border-amber-500/20" : 
          "bg-muted/50 text-foreground dark:text-muted-foreground"
        )}>
          <Zap className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs font-medium leading-relaxed">
            {risk.detail}
          </p>
        </div>
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
  const pct = metric.value === "UNKNOWN" || metric.target === "UNKNOWN" ? 0 : Math.min(100, ((metric.value as number) / (metric.unit === "/100" ? 100 : Math.max((metric.target as number) * 1.2, metric.value as number))) * 100);
  const color =
    metric.status === "good" ? "bg-emerald-500" :
    metric.status === "warning" ? "bg-amber-500" :
    metric.status === "critical" ? "bg-destructive" : "bg-muted";
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{metric.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-bold text-foreground">
            {metric.value === "UNKNOWN" ? "UNKNOWN" : (metric.value as number).toFixed(metric.unit === "×" ? 1 : 1)}{metric.unit}
          </span>
          <span className="text-[10px] text-muted-foreground">/ {metric.target === "UNKNOWN" ? "UNKNOWN" : metric.target}{metric.unit}</span>
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
  const scoreColor = dept.score === "UNKNOWN" ? "text-muted-foreground" : dept.score >= 80 ? "text-emerald-600" : dept.score >= 60 ? "text-amber-600" : "text-destructive";
  const delta = dept.score === "UNKNOWN" || dept.prevScore === "UNKNOWN" ? 0 : dept.score - dept.prevScore;
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
            style={{ width: `${dept.score === "UNKNOWN" ? 0 : dept.score}%`, backgroundColor: dept.score === "UNKNOWN" ? "var(--muted)" : color }} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn("text-sm font-mono font-bold w-12 text-right", scoreColor)}>{dept.score}</span>
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
            {typeof p.value === "number" && unit === "$" ? fmtK(p.value) : p.value + unit}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExecutiveIntelligencePage() {
  const { ops, isFetching: opsFetching, refetchAll: refetchOps } = useRealOpsIntel();
  const { engine, isFetching: engFetching, refetchAll: refetchEng } = useRealDecisionEngine();
  const ordersQuery = useListOrders();

  const { data: syncLog, isFetching: isSyncLogFetching } = useGetOdooSyncLog({
    query: { queryKey: getGetOdooSyncLogQueryKey(), refetchInterval: SYNC_MS }
  });

  const isFetching = opsFetching || engFetching || ordersQuery.isFetching || isSyncLogFetching;

  const [showAllRisks, setShowAllRisks] = useState(false);

  function handleRefresh() {
    if (isFetching) return;
    refetchOps();
    refetchEng();
    ordersQuery.refetch();
  }

  // We don't actually use cycleCount from ERP anymore, but we can compute exec safely
  const exec = computeExecState(
    { system: { name: "Odoo" }, entities: [] } as any,
    ops,
    engine,
    1,
    ordersQuery.data || []
  );

  const visibleRisks = showAllRisks ? exec.todaysRisks : exec.todaysRisks.slice(0, 5);
  const riskColor    = exec.riskScore === "UNKNOWN" ? "blue" : exec.riskScore >= 60 ? "red" : exec.riskScore >= 35 ? "amber" : "green";
  const effColor     = exec.efficiencyIndex === "UNKNOWN" ? "blue" : exec.efficiencyIndex >= 80 ? "green" : exec.efficiencyIndex >= 60 ? "amber" : "red";

  return (
    <div className="p-4 lg:p-8 bg-background min-h-[100dvh] flex flex-col gap-6 max-w-[1800px] mx-auto font-sans">

      {/* -- Header -- */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Executive Intelligence
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
            Supply Chain Command
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {format(exec.lastUpdatedAt, "EEEE, d MMMM yyyy")} � Updated{" "}
            {formatDistanceToNow(exec.lastUpdatedAt, { addSuffix: true })} � Cycle #{exec.cycleCount}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-border bg-card shadow-sm">
            <span className={cn("w-2 h-2 rounded-full", isFetching ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
            <span className="text-muted-foreground font-mono">
              {isFetching ? "Syncing�" : `Live API Data`}
            </span>
          </div>
          <Button onClick={handleRefresh} disabled={isFetching} size="sm" className="gap-2 shadow-sm">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* -- Row 1: Hero Metrics (Bento top) -- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Risk Score Bento */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Risk Index</span>
            <ShieldAlert className={cn("w-4 h-4", riskColor === "red" ? "text-destructive" : riskColor === "amber" ? "text-amber-500" : "text-emerald-500")} />
          </div>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <RiskRing score={exec.riskScore} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn("font-mono font-bold", exec.riskScore === "UNKNOWN" ? "text-[9px]" : "text-sm")}>{exec.riskScore}</span>
              </div>
            </div>
            <div>
              <div className="text-2xl font-mono font-extrabold tracking-tight leading-none">
                {exec.riskScore === "UNKNOWN" ? "Unknown" : exec.riskScore >= 60 ? "Critical" : exec.riskScore >= 35 ? "Elevated" : "Nominal"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{exec.activeIssues} active systemic issues</div>
            </div>
          </div>
        </div>

        {/* Opportunity Bento */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Opportunity</span>
            <Lightbulb className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-mono font-extrabold tracking-tight leading-none text-foreground">
            {fmtK(exec.opportunityValue)}
          </div>
          <div className="text-sm text-muted-foreground mt-2">{exec.aiOpportunities.length} actionable AI recommendations</div>
        </div>

        {/* Efficiency Bento */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Efficiency</span>
            <Activity className={cn("w-4 h-4", effColor === "red" ? "text-destructive" : effColor === "amber" ? "text-amber-500" : "text-emerald-500")} />
          </div>
          <div className="flex items-end gap-2">
            <div className="text-3xl font-mono font-extrabold tracking-tight leading-none text-foreground">
              {exec.efficiencyIndex}
            </div>
            <span className="text-sm text-muted-foreground font-mono mb-0.5">/ 100</span>
          </div>
          <div className="text-sm text-muted-foreground mt-2">Composite operational score</div>
        </div>

        {/* Spend Bento */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Spend YTD</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-mono font-extrabold tracking-tight leading-none text-foreground">
            {fmtK(exec.financialSummary.spendYTD)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Progress value={exec.financialSummary.achievementPct === "UNKNOWN" ? 0 : Math.min(exec.financialSummary.achievementPct, 100)} className="h-1.5 flex-1" />
            <span className="text-xs font-mono font-semibold text-muted-foreground">{exec.financialSummary.achievementPct === "UNKNOWN" ? "UNKNOWN" : `${exec.financialSummary.achievementPct}%`} budget</span>
          </div>
        </div>
      </div>

      {/* -- Row 2: Primary Visualizations -- */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Financial Chart (Span 2) */}
        <div className="xl:col-span-2 rounded-2xl border border-border/50 bg-card shadow-sm p-5 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Financial Impact & Budget Burn
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Monthly purchase order spend against targeted budget</p>
            </div>
            <Badge variant="outline" className="font-mono text-xs shadow-sm bg-background">
              Total Budget: {fmtK(exec.financialSummary.budgetTarget)}
            </Badge>
          </div>
          <div className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={exec.monthlyCosts} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} dx={-4} />
                <Tooltip content={<ChartTooltip unit="$" />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs font-medium text-foreground">{v}</span>} />
                <Bar dataKey="spend" name="Monthly Spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={32} />
                <Line type="monotone" dataKey="budget" name="Budget Target" stroke="#f59e0b" strokeWidth={3} dot={false} strokeDasharray="6 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Activity (Span 1) */}
        <div className="xl:col-span-1 rounded-2xl border border-border/50 bg-card shadow-sm p-5 flex flex-col">
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Weekly Operations Volume
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Orders placed vs Expected deliveries over 7 days</p>
          </div>
          <div className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={exec.weeklyTrends} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-placed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-expected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                <YAxis domain={[50, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} dx={-4} />
                <Tooltip content={<ChartTooltip unit="%" />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs font-medium text-foreground">{v}</span>} wrapperStyle={{ fontSize: '10px' }} />
                <Area type="monotone" dataKey="ordersPlaced" name="Orders Placed" stroke="hsl(var(--primary))" fill="url(#grad-placed)" strokeWidth={3} dot={false} />
                <Area type="monotone" dataKey="deliveriesExpected" name="Deliveries" stroke="#10b981" fill="url(#grad-expected)" strokeWidth={3} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* -- Row 3: Action Items & Deep Dives -- */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Action Center: Risks & Issues */}
        <div className="xl:col-span-2 rounded-2xl border border-border/50 bg-card shadow-sm p-5 flex flex-col h-[650px]">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-border/50">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Action Center
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Live critical issues and top priorities requiring executive intervention</p>
            </div>
            <Badge variant="destructive" className="font-mono text-xs shadow-sm">
              {fmtK(exec.top5Issues.some(r => r.financialExposure === "UNKNOWN") ? "UNKNOWN" : exec.top5Issues.reduce((s, r) => s + (r.financialExposure as number), 0))} Exposure
            </Badge>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
            {exec.top5Issues.length === 0 && exec.todaysRisks.length === 0 ? (
              <div className="py-12 text-center h-full flex flex-col items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-base font-medium text-foreground">All Systems Nominal</p>
                <p className="text-sm text-muted-foreground mt-1">No outstanding issues detected by the AI Engine.</p>
              </div>
            ) : (
              <>
                {Array.from(new Map([...exec.todaysRisks, ...exec.top5Issues].map(item => [item.id, item])).values())
                  .sort((a, b) => (a.financialExposure === "UNKNOWN" ? 0 : a.financialExposure) - (b.financialExposure === "UNKNOWN" ? 0 : b.financialExposure))
                  .map((issue, i) => (
                    <RiskRow key={issue.id} risk={issue} rank={i + 1} />
                  ))}
              </>
            )}
          </div>
        </div>

        {/* Operational Efficiency Drilldown */}
        <div className="xl:col-span-1 rounded-2xl border border-border/50 bg-card shadow-sm p-5 flex flex-col h-[650px]">
          <div className="mb-4 pb-4 border-b border-border/50">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Efficiency Deep Dive
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Core KPI performance breakdown</p>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            <div className="space-y-4">
              {exec.efficiencyMetrics.map((m) => (
                <EfficiencyStrip key={m.label} metric={m} />
              ))}
            </div>
            
            <div className="pt-4 border-t border-border/50">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Departmental Health</h4>
              {exec.deptPerformance.map((d) => <DeptRow key={d.department} dept={d} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Sync History UI */}
      <div className="mx-0 lg:mx-0 mb-6 rounded-2xl border border-border/50 bg-card shadow-sm p-5 w-full">
        <div className="mb-4 pb-4 border-b border-border/50 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <RefreshCw className={cn("w-4 h-4 text-primary", isSyncLogFetching && "animate-spin")} />
              Integration Sync History
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Recent ERP synchronization logs</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Synced</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {syncLog?.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">No sync history available.</td></tr>
              ) : (
                syncLog?.slice(0, 5).map((log: any) => (
                  <tr key={log.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono text-xs">{format(new Date(log.syncedAt!), "MMM dd, HH:mm:ss")}</td>
                    <td className="px-4 py-3 font-medium capitalize">{log.entity}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        log.status === "success" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : 
                        log.status === "partial" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : 
                        "bg-destructive/10 text-destructive border-destructive/20"
                      )}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-500">{log.recordsSynced}</td>
                    <td className="px-4 py-3 font-mono text-xs text-destructive">{log.recordsFailed}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.message ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs truncate max-w-[200px] justify-start font-normal text-muted-foreground hover:text-foreground">
                              {log.message}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Sync Message Details</DialogTitle>
                            </DialogHeader>
                            <div className="text-sm mt-4 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {log.message}
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
