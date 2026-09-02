import { useState, useEffect, useCallback, useRef } from "react";
import { useRealDecisionEngine } from "@/hooks/use-real-decision-engine";
import type {
  DecisionEngineState,
  RecommendationStatus,
  RecommendationPriority,
  RecommendationType,
  Department,
} from "@/services/ai-decision-engine";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Brain,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  BarChart3,
  Loader2,
  Wifi,
  Filter,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000;

const PRIORITY_ORDER: RecommendationPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

const TYPE_LABELS: Record<RecommendationType, string> = {
  ALTERNATE_SUPPLIER: "Alternate Supplier",
  FOLLOW_UP_INBOUND: "Follow Up Inbound",
  COVER_FROM_AVAILABLE_STOCK: "Cover From Available Stock",
  PRIORITIZE_DOWNSTREAM_DEMAND: "Prioritize Downstream Demand",
  MONITOR_UNVERIFIED_LEAD_TIME: "Monitor Unverified Lead Time",
  CAPACITY_DATA_REQUIRED: "Capacity Data Required",
};

// ─── Summary stat card ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  highlight?: "red" | "amber" | "green" | "blue";
}) {
  const bg = {
    red: "bg-destructive/5 border-destructive/30",
    amber: "bg-amber-50 border-amber-300/40 dark:bg-amber-900/10",
    green: "bg-emerald-50 border-emerald-300/40 dark:bg-emerald-900/10",
    blue: "bg-blue-50 border-blue-300/40 dark:bg-blue-900/10",
  };
  const ic = {
    red: "text-destructive",
    amber: "text-amber-600",
    green: "text-emerald-600",
    blue: "text-blue-600",
  };
  return (
    <Card className={cn("border shadow-sm", highlight ? bg[highlight] : "border-border")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
        <span className={cn("w-4 h-4", highlight ? ic[highlight] : "text-primary")}>
          {icon}
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-mono font-bold text-foreground leading-none">
          {value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Model status bar ─────────────────────────────────────────────────────────

function ModelStatusBar({
  engine,
  isError,
}: {
  engine: DecisionEngineState;
  isError: boolean;
}) {
  const isAnalysing = engine.analysisStatus === "analysing";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card text-xs">
      {/* Model ID */}
      <div className="flex items-center gap-1.5">
        <Brain className="w-3.5 h-3.5 text-primary" />
        <span className="font-mono font-semibold text-foreground">
          SupplyCmd Deterministic {engine.modelVersion}
        </span>
      </div>

      <span className="text-border">|</span>

      {/* ERP-backed decision data */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-2 w-2 rounded-full",
            isError
              ? "bg-destructive"
              : isAnalysing
                ? "bg-amber-500 animate-pulse"
                : "bg-emerald-500"
          )}
        />
        <Wifi className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground">Odoo-backed decision data</span>
      </div>

      <span className="text-border">|</span>

      {/* Last analysis */}
      <span className="text-muted-foreground">
        {engine.lastAnalysedAt ? (
          <>
            Analysed{" "}
            <span className="text-foreground font-medium">
              {formatDistanceToNow(engine.lastAnalysedAt, { addSuffix: true })}
            </span>
          </>
        ) : (
          <span className="text-foreground font-medium">Not analysed yet</span>
        )}
      </span>

      <span className="ml-auto text-muted-foreground font-mono">
        {isError ? (
          <span className="flex items-center gap-1 text-destructive">
            <XCircle className="w-3 h-3" /> Unavailable
          </span>
        ) : isAnalysing ? (
          <span className="flex items-center gap-1 text-amber-600">
            <Loader2 className="w-3 h-3 animate-spin" /> Analysing...
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="w-3 h-3" /> Available
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface Filters {
  priority: RecommendationPriority | "all";
  status: RecommendationStatus | "all";
  type: RecommendationType | "all";
  dept: Department | "all";
}

const DEFAULT_FILTERS: Filters = {
  priority: "all",
  status: "all",
  type: "all",
  dept: "all",
};

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...filters, [k]: v });

  const hasActive = Object.values(filters).some((v) => v !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />

      <Select value={filters.priority} onValueChange={(v) => set("priority", v as Filters["priority"])}>
        <SelectTrigger className="h-8 text-xs w-[130px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {PRIORITY_ORDER.map((p) => (
            <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(v) => set("status", v as Filters["status"])}>
        <SelectTrigger className="h-8 text-xs w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All review states</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="acknowledged">Reviewed</SelectItem>
          <SelectItem value="in_progress">Reviewing Action</SelectItem>
          <SelectItem value="applied">Reviewed as Applied</SelectItem>
          <SelectItem value="dismissed">Dismissed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.type} onValueChange={(v) => set("type", v as Filters["type"])}>
        <SelectTrigger className="h-8 text-xs w-[170px]">
          <SelectValue placeholder="Recommendation type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {(Object.entries(TYPE_LABELS) as [RecommendationType, string][]).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.dept} onValueChange={(v) => set("dept", v as Filters["dept"])}>
        <SelectTrigger className="h-8 text-xs w-[140px]">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {(["Procurement", "Warehouse", "Production", "Supply Chain", "Finance", "Logistics"] as Department[]).map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => onChange(DEFAULT_FILTERS)}
        >
          <XCircle className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

// ─── Priority section header ──────────────────────────────────────────────────

const PRIORITY_STYLE_MAP: Record<
  RecommendationPriority,
  { dot: string; label: string }
> = {
  critical: { dot: "bg-destructive", label: "text-destructive" },
  high: { dot: "bg-orange-500", label: "text-orange-600" },
  medium: { dot: "bg-amber-400", label: "text-amber-600" },
  low: { dot: "bg-blue-400", label: "text-blue-600" },
};

function SectionHeader({
  priority,
  count,
}: {
  priority: RecommendationPriority;
  count: number;
}) {
  const s = PRIORITY_STYLE_MAP[priority];
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />
      <h2 className={cn("text-sm font-bold uppercase tracking-wider", s.label)}>
        {priority} Priority
      </h2>
      <Badge variant="outline" className="text-xs ml-1">{count}</Badge>
      <div className="flex-1 h-px bg-border ml-1" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiDecisionEnginePage() {
  const { engine, isFetching, isError, refetchAll, setStatus } = useRealDecisionEngine();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [flashIds, setFlash] = useState<Set<string>>(new Set());

  // Optionally flash new recs when they arrive (not strictly necessary for live sync, but nice)
  useEffect(() => {
    setFlash(new Set(engine.recommendations.map(r => r.id)));
    const t = setTimeout(() => setFlash(new Set()), 1000);
    return () => clearTimeout(t);
  }, [engine.recommendations]);

  function handleRefresh() {
    if (isFetching) return;
    refetchAll();
  }

  function handleStatusChange(id: string, status: RecommendationStatus) {
    setStatus(id, status);
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const visible = engine.recommendations.filter((r) => {
    if (filters.priority !== "all" && r.priority !== filters.priority) return false;
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.type !== "all" && r.type !== filters.type) return false;
    if (filters.dept !== "all" && r.affectedDepartment !== filters.dept) return false;
    return true;
  });

  const byPriority = PRIORITY_ORDER.reduce<Record<RecommendationPriority, typeof visible>>(
    (acc, p) => { acc[p] = visible.filter((r) => r.priority === p); return acc; },
    { critical: [], high: [], medium: [], low: [] }
  );

  const totalRecs = engine.recommendations.length;
  const critical = engine.recommendations.filter((r) => r.priority === "critical").length;
  const actionable = engine.recommendations.filter((r) => r.status === "new" || r.status === "acknowledged").length;
  const reviewedAsApplied = engine.recommendations.filter((r) => r.status === "applied").length;

  return (
    <div className="p-8 space-y-6 bg-background min-h-[100dvh]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Deterministic Decision Engine
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Recommendations
          </h1>
          <p className="text-muted-foreground mt-1">
            Continuously analysing ERP data to surface actionable supply chain decisions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => setLayout((l) => (l === "grid" ? "list" : "grid"))}
          >
            {layout === "grid"
              ? <List className="w-3.5 h-3.5" />
              : <LayoutGrid className="w-3.5 h-3.5" />}
            {layout === "grid" ? "List" : "Grid"}
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={isFetching}
            className="gap-2 h-9"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            {isFetching ? "Analysing..." : "Re-Analyse"}
          </Button>
        </div>
      </div>

      {/* ── Model status bar ── */}
      <ModelStatusBar engine={engine} isError={isError} />

      {/* ── KPI summary strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Recommendations"
          value={totalRecs}
          sub={`${visible.length} matching filters`}
          icon={<Brain className="w-4 h-4" />}
        />
        <StatCard
          label="Critical Alerts"
          value={critical}
          sub={critical === 0 ? "No critical issues" : "Immediate action needed"}
          icon={<AlertTriangle className="w-4 h-4" />}
          highlight={critical > 0 ? "red" : "green"}
        />
        <StatCard
          label="Actionable"
          value={actionable}
          sub={`${reviewedAsApplied} reviewed as applied`}
          icon={<Zap className="w-4 h-4" />}
          highlight={actionable > 0 ? "amber" : "green"}
        />
        <StatCard
          label="Portfolio Revenue Impact"
          value={
            engine.totalEstimatedSavings === "UNKNOWN"
              ? "UNKNOWN"
              : (engine.totalEstimatedSavings as number).toLocaleString()
          }
          sub="Deterministic portfolio result"
          icon={<BarChart3 className="w-4 h-4" />}
          highlight="green"
        />
      </div>

      {/* ── Priority breakdown bar ── */}
      <Card className="border-border shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
              Priority Breakdown
            </span>
            <div className="flex-1 grid grid-cols-4 gap-2">
              {PRIORITY_ORDER.map((p) => {
                const count = engine.recommendations.filter((r) => r.priority === p).length;
                const pct = totalRecs > 0 ? (count / totalRecs) * 100 : 0;
                const s = PRIORITY_STYLE_MAP[p];
                return (
                  <div key={p} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className={cn("text-xs capitalize font-medium", s.label)}>{p}</span>
                      <span className="text-xs font-mono text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", s.dot)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Filter bar ── */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* ── Recommendation cards ── */}
      {visible.length === 0 ? (
        <Card className="border-border shadow-sm">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-foreground">No recommendations match your filters</p>
            <p className="text-sm text-muted-foreground mt-1">
              {engine.recommendations.length === 0
                ? "No deterministic recommendations are currently available."
                : "Try clearing filters to see all recommendations."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {PRIORITY_ORDER.map((p) => {
            const recs = byPriority[p];
            if (recs.length === 0) return null;
            return (
              <section key={p}>
                <SectionHeader priority={p} count={recs.length} />
                <div
                  className={cn(
                    layout === "grid"
                      ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                      : "flex flex-col gap-3"
                  )}
                >
                  {recs.map((rec) => (
                    <RecommendationCard
                      key={rec.id}
                      rec={rec}
                      onStatusChange={handleStatusChange}
                      flash={flashIds.has(rec.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
