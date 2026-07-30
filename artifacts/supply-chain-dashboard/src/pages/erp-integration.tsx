import { useState, useEffect, useCallback, useRef } from "react";
import {
  buildInitialConnectionState,
  simulateSyncCycle,
  buildSyncingState,
  type ErpConnectionState,
  type EntitySyncState,
  type SyncLogEntry,
  type EntityName,
  MOCK_API_CONFIG,
} from "@/services/erp-integration";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Server,
  Database,
  Activity,
  Settings2,
  ShieldCheck,
  Zap,
  Package,
  ShoppingCart,
  Tag,
  Users,
  Factory,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000;

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

const ENTITY_ICONS: Record<EntityName, React.ElementType> = {
  Inventory: Package,
  "Purchase Orders": ShoppingCart,
  "Sales Orders": Tag,
  Suppliers: Users,
  "Production Orders": Factory,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ErpConnectionState["status"] }) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "syncing"
      ? "bg-amber-500"
      : status === "error"
      ? "bg-destructive"
      : "bg-muted-foreground";

  return (
    <span className="relative flex h-3 w-3">
      {status !== "disconnected" && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`}
        />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </span>
  );
}

function ConnectionBadge({ status }: { status: ErpConnectionState["status"] }) {
  const map = {
    connected: { label: "Connected", variant: "default" as const, className: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    syncing: { label: "Syncing…", variant: "secondary" as const, className: "bg-amber-500 hover:bg-amber-600 text-white" },
    error: { label: "Error", variant: "destructive" as const, className: "" },
    disconnected: { label: "Disconnected", variant: "secondary" as const, className: "" },
  };
  const { label, variant, className } = map[status];
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

function EntityStatusBadge({ status }: { status: EntitySyncState["status"] }) {
  if (status === "success")
    return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Synced</Badge>;
  if (status === "syncing")
    return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">Syncing</Badge>;
  if (status === "error")
    return <Badge variant="destructive" className="text-xs">Error</Badge>;
  return <Badge variant="secondary" className="text-xs">Idle</Badge>;
}

function SyncProgress({ entities }: { entities: EntitySyncState[] }) {
  const total = entities.reduce((s, e) => s + e.totalRecords, 0);
  const imported = entities.reduce((s, e) => s + e.importedRecords, 0);
  const pct = total > 0 ? Math.round((imported / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground font-medium">Overall Sync Coverage</span>
        <span className="font-mono font-bold text-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatNum(imported)} imported</span>
        <span>{formatNum(total - imported)} pending</span>
      </div>
    </div>
  );
}

function CounterCell({ value, animate }: { value: number; animate: boolean }) {
  return (
    <span
      className={`font-mono font-semibold transition-colors duration-300 ${
        animate ? "text-primary" : "text-foreground"
      }`}
    >
      {formatNum(value)}
    </span>
  );
}

function LogRow({ entry }: { entry: SyncLogEntry }) {
  const icon =
    entry.action === "error" ? (
      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
    ) : entry.action === "connect" ? (
      <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
    ) : entry.action === "disconnect" ? (
      <WifiOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    ) : (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
    );

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground leading-snug">{entry.message}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {entry.entity} · {format(entry.timestamp, "HH:mm:ss")} ·{" "}
          {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ErpIntegrationPage() {
  const [state, setState] = useState<ErpConnectionState>(() =>
    buildInitialConnectionState()
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastFlash, setLastFlash] = useState<Set<EntityName>>(new Set());
  const [countdown, setCountdown] = useState(SYNC_INTERVAL_MS / 1000);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-sync every 30 s ───────────────────────────────────────────────────
  const runSync = useCallback((current: ErpConnectionState) => {
    setIsSyncing(true);
    setState(buildSyncingState(current));

    setTimeout(() => {
      setState((prev) => {
        const next = simulateSyncCycle(prev);
        setLastFlash(new Set(next.entities.map((e) => e.entity)));
        setTimeout(() => setLastFlash(new Set()), 1200);
        return next;
      });
      setIsSyncing(false);
      setCountdown(SYNC_INTERVAL_MS / 1000);
    }, 1500);
  }, []);

  useEffect(() => {
    // Countdown tick
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    // Sync interval
    syncTimerRef.current = setInterval(() => {
      setState((prev) => {
        runSync(prev);
        return prev; // actual update happens inside runSync
      });
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [runSync]);

  // ── Manual sync ───────────────────────────────────────────────────────────
  function handleManualSync() {
    if (isSyncing) return;
    if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    runSync(state);

    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    syncTimerRef.current = setInterval(() => {
      setState((prev) => {
        runSync(prev);
        return prev;
      });
    }, SYNC_INTERVAL_MS);
  }

  const visibleLogs = showAllLogs ? state.logs : state.logs.slice(0, 6);
  const totalImported = state.entities.reduce((s, e) => s + e.importedRecords, 0);
  const totalFailed = state.entities.reduce((s, e) => s + e.failedRecords, 0);

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            ERP Integration
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time synchronisation with {state.system.name}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground font-mono">NEXT SYNC</p>
            <p className="text-sm font-mono font-semibold text-foreground">
              {countdown}s
            </p>
          </div>
          <Button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* ── Top KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Connection
            </CardTitle>
            <StatusDot status={state.status} />
          </CardHeader>
          <CardContent className="pt-0">
            <ConnectionBadge status={state.status} />
            <p className="text-xs text-muted-foreground mt-1.5">
              {state.system.environment === "production" ? "Production" : "Sandbox"} env
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Last Sync
            </CardTitle>
            <Clock className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm font-mono font-bold text-foreground leading-tight">
              {state.lastSyncAt
                ? formatDistanceToNow(state.lastSyncAt, { addSuffix: true })
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {state.lastSyncAt ? format(state.lastSyncAt, "HH:mm:ss") : "Never"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Records Synced
            </CardTitle>
            <Database className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-mono font-bold text-foreground">
              {formatNum(totalImported)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalFailed > 0 ? (
                <span className="text-destructive">{totalFailed} failed</span>
              ) : (
                "All records clean"
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Latency
            </CardTitle>
            <Zap className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-mono font-bold text-foreground">
              {formatMs(state.latencyMs)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Uptime {state.uptimePercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Main body: connected system + sync progress ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected system card */}
        <Card className="border-border shadow-sm lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                Connected System
              </CardTitle>
              <ConnectionBadge status={state.status} />
            </div>
            <CardDescription>ERP platform details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="System" value={state.system.name} />
            <Row label="Vendor" value={state.system.vendor} />
            <Row label="Version" value={state.system.version} />
            <Row
              label="Environment"
              value={
                <Badge
                  variant={
                    state.system.environment === "production"
                      ? "default"
                      : "secondary"
                  }
                  className={
                    state.system.environment === "production"
                      ? "bg-emerald-600 text-white text-xs"
                      : "text-xs"
                  }
                >
                  {state.system.environment}
                </Badge>
              }
            />
            <Row label="Region" value={state.system.region} />
            <Separator />
            <Row
              label="All-time synced"
              value={
                <span className="font-mono font-semibold text-foreground">
                  {formatNum(state.totalSyncedAllTime)}
                </span>
              }
            />
            <Row
              label="Sync interval"
              value={`${state.config.syncInterval} s`}
            />
          </CardContent>
        </Card>

        {/* Sync progress + entities */}
        <Card className="border-border shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Sync Progress
            </CardTitle>
            <CardDescription>Per-entity import coverage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SyncProgress entities={state.entities} />
            <Separator />

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Entity</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Imported</TableHead>
                    <TableHead className="text-xs text-right">Failed</TableHead>
                    <TableHead className="text-xs text-right hidden sm:table-cell">
                      Duration
                    </TableHead>
                    <TableHead className="text-xs text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.entities.map((ent) => {
                    const Icon = ENTITY_ICONS[ent.entity];
                    const pct =
                      ent.totalRecords > 0
                        ? Math.round(
                            (ent.importedRecords / ent.totalRecords) * 100
                          )
                        : 0;
                    return (
                      <TableRow key={ent.entity}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium text-sm leading-tight">
                                {ent.entity}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Progress value={pct} className="h-1 w-16" />
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  {pct}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-sm">
                            {formatNum(ent.totalRecords)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <CounterCell
                            value={ent.importedRecords}
                            animate={lastFlash.has(ent.entity)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {ent.failedRecords > 0 ? (
                            <span className="font-mono text-sm text-destructive font-semibold">
                              {ent.failedRecords}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <span className="font-mono text-xs text-muted-foreground">
                            {ent.durationMs ? formatMs(ent.durationMs) : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <EntityStatusBadge status={ent.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Connection health + API config + logs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection health */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Connection Health
            </CardTitle>
            <CardDescription>Live diagnostics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <HealthRow
              label="API Reachability"
              ok={state.status !== "error"}
              value={state.status !== "error" ? "Reachable" : "Unreachable"}
            />
            <HealthRow
              label="Auth Token"
              ok
              value="Valid (OAuth 2.0)"
            />
            <HealthRow
              label="Latency"
              ok={state.latencyMs < 100}
              value={formatMs(state.latencyMs)}
            />
            <HealthRow
              label="Uptime"
              ok={state.uptimePercent >= 99}
              value={`${state.uptimePercent.toFixed(2)}%`}
            />
            <HealthRow
              label="Last error"
              ok={totalFailed === 0}
              value={
                totalFailed === 0
                  ? "None"
                  : `${totalFailed} record(s) failed`
              }
            />
            <Separator />
            <div className="pt-1">
              <p className="text-xs text-muted-foreground">
                Polling every{" "}
                <span className="font-semibold text-foreground">
                  {MOCK_API_CONFIG.syncInterval} s
                </span>
                . Next sync in{" "}
                <span className="font-mono font-semibold text-primary">
                  {countdown}s
                </span>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                API Configuration
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowConfig((v) => !v)}
              >
                {showConfig ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
            <CardDescription>Connection parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Base URL"
              value={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-xs truncate max-w-[160px] block cursor-default">
                      {state.config.baseUrl}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">{state.config.baseUrl}</p>
                  </TooltipContent>
                </Tooltip>
              }
            />
            <Row
              label="Auth method"
              value={
                <Badge variant="outline" className="text-xs font-mono uppercase">
                  {state.config.authMethod}
                </Badge>
              }
            />
            {showConfig && (
              <>
                <Row
                  label="Batch size"
                  value={<span className="font-mono">{state.config.batchSize}</span>}
                />
                <Row
                  label="Retry attempts"
                  value={<span className="font-mono">{state.config.retryAttempts}</span>}
                />
                <Row
                  label="Timeout"
                  value={<span className="font-mono">{formatMs(state.config.timeout)}</span>}
                />
              </>
            )}
            <Separator />
            <div className="pt-1 text-xs text-muted-foreground">
              Configuration is read-only in this view. Contact your ERP administrator to modify connection settings.
            </div>
          </CardContent>
        </Card>

        {/* Sync log */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Sync Activity Log
            </CardTitle>
            <CardDescription>Last {visibleLogs.length} events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            <div className="max-h-[280px] overflow-y-auto pr-1">
              {visibleLogs.map((entry) => (
                <LogRow key={entry.id} entry={entry} />
              ))}
            </div>
            {state.logs.length > 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full text-xs text-muted-foreground"
                onClick={() => setShowAllLogs((v) => !v)}
              >
                {showAllLogs
                  ? "Show fewer"
                  : `Show all ${state.logs.length} entries`}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Utility layout helpers ───────────────────────────────────────────────────

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function HealthRow({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
        )}
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <span
        className={`text-sm font-medium ${
          ok ? "text-foreground" : "text-destructive"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
