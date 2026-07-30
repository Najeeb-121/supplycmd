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
  type KpiId,
} from "@/services/operational-intelligence";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  Package,
  Activity,
  Users,
  Warehouse,
  Clock,
  RotateCcw,
  TruckIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Brain,
  Wifi,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Icon map ─────────────────────────────────────────────────────────────────

const KPI_ICONS: Record<KpiId, React.ReactNode> = {
  inventory_accuracy:     <Package      className="w-3.5 h-3.5" />,
  production_utilization: <Activity     className="w-3.5 h-3.5" />,
  supplier_performance:   <Users        className="w-3.5 h-3.5" />,
  warehouse_fill_rate:    <Warehouse    className="w-3.5 h-3.5" />,
  purchase_lead_time:     <Clock        className="w-3.5 h-3.5" />,
  stock_turnover:         <RotateCcw    className="w-3.5 h-3.5" />,
  late_deliveries:        <TruckIcon    className="w-3.5 h-3.5" />,
  order_fulfillment_rate: <CheckCircle2 className="w-3.5 h-3.5" />,
};

// ─── Health score display ─────────────────────────────────────────────────────

function HealthGrade({ score }: { score: number }) {
  if (score >= 90) return <span className="text-emerald-600 font-bold">A</span>;
  if (score >= 75) return <span className="text-emerald-500 font-bold">B</span>;
  if (score >= 60) return <span className="text-amber-500 font-bold">C</span>;
  if (score >= 45) return <span className="text-orange-500 font-bold">D</span>;
  return <span className="text-destructive font-bold">F</span>;
}

function HealthRing({ score }: { score: number }) {
  const color =
    score >= 90 ? "#10b981"
    : score >= 75 ? "#34d399"
    : score >= 60 ? "#f59e0b"
    : score >= 45 ? "#f97316"
    : "hsl(var(--destructive))";

  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <svg width="80" height="80" className="-rotate-90">
      <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      <circle
        cx="40" cy="40" r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.7s ease" }}
      />
    </svg>
  );
}

function StatusCount({ ops }: { ops: OpsIntelState }) {
  const good     = ops.kpis.filter((k) => k.status === "good").length;
  const warning  = ops.kpis.filter((k) => k.status === "warning").length;
  const critical = ops.kpis.filter((k) => k.status === "critical").length;
  return (
    <div className="flex gap-3 text-sm">
      <span className="flex items-center gap-1 text-emerald-600 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> {good}
      </span>
      <span className="flex items-center gap-1 text-amber-500 font-medium">
        <AlertTriangle className="w-3.5 h-3.5" /> {warning}
      </span>
      <span className="flex items-center gap-1 text-destructive font-medium">
        <XCircle className="w-3.5 h-3.5" /> {critical}
      </span>
    </div>
  );
}

// ─── Sync status pill ─────────────────────────────────────────────────────────

function SyncPill({
  erp,
  countdown,
}: {
  erp: ErpConnectionState;
  countdown: number;
}) {
  const isSyncing = erp.status === "syncing";
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-60",
            isSyncing ? "animate-ping bg-amber-500" : "bg-emerald-500"
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isSyncing ? "bg-amber-500" : "bg-emerald-500"
          )}
        />
      </span>
      <Wifi className="w-3 h-3" />
      <span className="font-medium">
        {isSyncing ? "Syncing ERP…" : `Next sync ${countdown}s`}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000;

export default function OperationalIntelligencePage() {
  // Two parallel state trees — ERP connection mirrors the integration page
  const [erp, setErp]         = useState<ErpConnectionState>(() => buildInitialConnectionState());
  const [ops, setOps]         = useState<OpsIntelState>(() => buildInitialOpsState(buildInitialConnectionState()));
  const [isSyncing, setIs]    = useState(false);
  const [countdown, setCD]    = useState(SYNC_INTERVAL_MS / 1000);
  const [flashedIds, setFl]   = useState<Set<KpiId>>(new Set());

  const syncRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Flash all KPI card IDs briefly after an update
  const flashAll = useCallback(() => {
    const all = new Set<KpiId>([
      "inventory_accuracy","production_utilization","supplier_performance",
      "warehouse_fill_rate","purchase_lead_time","stock_turnover",
      "late_deliveries","order_fulfillment_rate",
    ]);
    setFl(all);
    setTimeout(() => setFl(new Set()), 900);
  }, []);

  const runCycle = useCallback((currentErp: ErpConnectionState) => {
    setIs(true);
    setErp(buildSyncingState(currentErp));

    setTimeout(() => {
      setErp((prevErp) => {
        const nextErp = simulateSyncCycle(prevErp);
        setOps((prevOps) => {
          const nextOps = tickOpsState(prevOps, nextErp);
          return nextOps;
        });
        flashAll();
        return nextErp;
      });
      setIs(false);
      setCD(SYNC_INTERVAL_MS / 1000);
    }, 1500);
  }, [flashAll]);

  // Start auto-poll on mount
  useEffect(() => {
    countdownRef.current = setInterval(() => setCD((c) => (c > 0 ? c - 1 : 0)), 1000);
    syncRef.current = setInterval(() => {
      setErp((prev) => { runCycle(prev); return prev; });
    }, SYNC_INTERVAL_MS);
    return () => {
      if (syncRef.current)      clearInterval(syncRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [runCycle]);

  function handleRefresh() {
    if (isSyncing) return;
    if (syncRef.current)      clearInterval(syncRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    runCycle(erp);
    countdownRef.current = setInterval(() => setCD((c) => (c > 0 ? c - 1 : 0)), 1000);
    syncRef.current      = setInterval(() => {
      setErp((prev) => { runCycle(prev); return prev; });
    }, SYNC_INTERVAL_MS);
  }

  const good     = ops.kpis.filter((k) => k.status === "good").length;
  const warning  = ops.kpis.filter((k) => k.status === "warning").length;
  const critical = ops.kpis.filter((k) => k.status === "critical").length;

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Live Operational Intelligence
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Operations Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            8 KPIs fed live from the ERP integration layer · auto-refreshes every 30 s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncPill erp={erp} countdown={countdown} />
          <Button onClick={handleRefresh} disabled={isSyncing} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Health summary bar ── */}
      <Card className="border-border shadow-sm">
        <CardContent className="py-4 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">

            {/* Ring + score */}
            <div className="relative shrink-0">
              <HealthRing score={ops.healthScore} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-mono font-bold leading-none text-foreground">
                  {ops.healthScore}
                </span>
                <HealthGrade score={ops.healthScore} />
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Overall Operations Health
                </span>
                <StatusCount ops={ops} />
              </div>
              <Progress value={ops.healthScore} className="h-2" />
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="text-emerald-600 font-semibold">{good}</span> KPIs on target
                </span>
                <span>
                  <span className="text-amber-500 font-semibold">{warning}</span> need attention
                </span>
                <span>
                  <span className="text-destructive font-semibold">{critical}</span> critical
                </span>
                <span className="ml-auto">
                  Updated {formatDistanceToNow(ops.lastUpdatedAt, { addSuffix: true })} ·{" "}
                  Cycle #{ops.syncCycleCount}
                </span>
              </div>
            </div>

            {/* ERP source tag */}
            <div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
              <Badge variant="outline" className="text-xs font-mono">
                {erp.system.name}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Last sync {erp.lastSyncAt ? format(erp.lastSyncAt, "HH:mm:ss") : "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ops.kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            icon={KPI_ICONS[kpi.id]}
            flash={flashedIds.has(kpi.id)}
          />
        ))}
      </div>

      {/* ── Alert strip (only shown when there are critical KPIs) ── */}
      {critical > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {critical} Critical KPI{critical > 1 ? "s" : ""} Require Attention
            </CardTitle>
            <CardDescription>
              The following metrics are below safe operating thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {ops.kpis
                .filter((k) => k.status === "critical")
                .map((k) => (
                  <Badge
                    key={k.id}
                    variant="destructive"
                    className="gap-1.5 font-normal"
                  >
                    {KPI_ICONS[k.id]}
                    {k.label} —{" "}
                    <span className="font-mono">
                      {k.value.toFixed(k.format === "integer" ? 0 : 1)}{k.unit}
                    </span>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Warning strip ── */}
      {warning > 0 && (
        <Card className="border-amber-400/30 bg-amber-400/5 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              {warning} KPI{warning > 1 ? "s" : ""} Need Monitoring
            </CardTitle>
            <CardDescription>
              These metrics are within acceptable range but trending toward warning thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {ops.kpis
                .filter((k) => k.status === "warning")
                .map((k) => (
                  <Badge
                    key={k.id}
                    variant="secondary"
                    className="gap-1.5 font-normal bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  >
                    {KPI_ICONS[k.id]}
                    {k.label} —{" "}
                    <span className="font-mono">
                      {k.value.toFixed(k.format === "integer" ? 0 : 1)}{k.unit}
                    </span>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
