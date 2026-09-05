import { useState, useEffect, useCallback, useRef } from "react";
import {
  type OpsIntelState,
  type KpiId,
} from "@/services/operational-intelligence";
import { useRealOpsIntel } from "@/hooks/use-real-ops-intel";
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
  Sparkles,
  RotateCw,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Icon map ─────────────────────────────────────────────────────────────────

const KPI_ICONS: Record<KpiId, React.ReactNode> = {
  inventory_accuracy: <Package className="w-3.5 h-3.5" />,
  production_utilization: <Activity className="w-3.5 h-3.5" />,
  supplier_performance: <Users className="w-3.5 h-3.5" />,
  warehouse_fill_rate: <Warehouse className="w-3.5 h-3.5" />,
  purchase_lead_time: <Clock className="w-3.5 h-3.5" />,
  stock_turnover: <RotateCcw className="w-3.5 h-3.5" />,
  late_deliveries: <TruckIcon className="w-3.5 h-3.5" />,
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
  const good = ops.kpis.filter((k) => k.status === "good").length;
  const warning = ops.kpis.filter((k) => k.status === "warning").length;
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

function SyncPill({ isFetching }: { isFetching: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", isFetching ? "animate-ping bg-amber-500" : "bg-emerald-500")} />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", isFetching ? "bg-amber-500" : "bg-emerald-500")} />
      </span>
      <Wifi className="w-3 h-3" />
      <span className="font-medium">{isFetching ? "Refreshing operational data…" : "Operational snapshot ready"}</span>
    </div>
  );
}

// ─── AI Copilot panel ─────────────────────────────────────────────────────────

// Section config keyed by "## N." number string
const SECTION_META: Record<string, { label: string; border: string; bg: string; heading: string; icon: string }> = {
  "1": { label: "Overall Operations Summary", icon: "◈", border: "border-blue-200 dark:border-blue-800", bg: "bg-blue-50/60 dark:bg-blue-950/20", heading: "text-blue-700 dark:text-blue-400" },
  "2": { label: "Top Risks", icon: "◉", border: "border-red-200 dark:border-red-800", bg: "bg-red-50/60 dark:bg-red-950/20", heading: "text-red-700 dark:text-red-400" },
  "3": { label: "KPI Relationships", icon: "◎", border: "border-purple-200 dark:border-purple-800", bg: "bg-purple-50/60 dark:bg-purple-950/20", heading: "text-purple-700 dark:text-purple-400" },
  "4": { label: "Priority Action Plan", icon: "◆", border: "border-emerald-200 dark:border-emerald-800", bg: "bg-emerald-50/60 dark:bg-emerald-950/20", heading: "text-emerald-700 dark:text-emerald-400" },
};

interface ParsedSection { id: string; content: string }

// Matches "## 1. Overall Operations Summary" style headers
const SECTION_HEADER_RE = /^##\s+(\d+)\.\s+/;

function parseSections(text: string): ParsedSection[] {
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const m = line.match(SECTION_HEADER_RE);
    if (m) {
      if (current) sections.push(current);
      current = { id: m[1], content: "" };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ─── Block types ──────────────────────────────────────────────────────────────

type TextBlock = { kind: "text"; text: string };
type BulletBlock = { kind: "bullet"; text: string };
type ArrowBlock = { kind: "arrow"; parts: string[] };
type NumberedBlock = { kind: "numbered"; num: string; title: string; rows: string[] };
type Block = TextBlock | BulletBlock | ArrowBlock | NumberedBlock;

function parseBlocks(content: string): Block[] {
  const lines = content.trim().split("\n");
  const blocks: Block[] = [];
  let cur: NumberedBlock | null = null;

  const flush = () => { if (cur) { blocks.push(cur); cur = null; } };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { flush(); continue; }

    // Numbered item: "1. Title"
    const numMatch = t.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) { flush(); cur = { kind: "numbered", num: numMatch[1], title: numMatch[2], rows: [] }; continue; }

    // Sub-bullet inside a numbered block
    if (cur && (t.startsWith("- ") || t.startsWith("• "))) {
      cur.rows.push(t.replace(/^[-•]\s*/, ""));
      continue;
    }

    flush();

    // Accept both Unicode → and ASCII -> as arrow chains
    if (t.includes("→") || t.includes("->")) {
      const parts = t.includes("→")
        ? t.split("→").map((p) => p.trim())
        : t.split("->").map((p) => p.trim());
      blocks.push({ kind: "arrow", parts });
      continue;
    }
    if (t.startsWith("- ") || t.startsWith("• ")) { blocks.push({ kind: "bullet", text: t.replace(/^[-•]\s*/, "") }); continue; }
    blocks.push({ kind: "text", text: t });
  }

  flush();
  return blocks;
}

// ─── Inline helpers ───────────────────────────────────────────────────────────

function applyMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code class='bg-muted px-1 rounded text-xs font-mono'>$1</code>");
}

/** Splits "Label: value" into a bold label + plain value; renders plain text otherwise */
function LabelValue({ text, className }: { text: string; className?: string }) {
  const colon = text.indexOf(": ");
  if (colon > 0 && colon < 44) {
    const label = text.slice(0, colon);
    const value = text.slice(colon + 2);
    return (
      <span className={className}>
        <span className="font-semibold text-foreground">{label}:</span>{" "}
        <span dangerouslySetInnerHTML={{ __html: applyMarkdown(value) }} />
      </span>
    );
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: applyMarkdown(text) }} />;
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function ArrowChain({ parts }: { parts: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 my-1 py-2 px-3 rounded-lg bg-background/60 border border-border/50">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{p}</span>
          {i < parts.length - 1 && <span className="text-primary font-bold text-sm leading-none">→</span>}
        </span>
      ))}
    </div>
  );
}

function BulletRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-foreground leading-snug">
      <span className="mt-[6px] w-[5px] h-[5px] rounded-full bg-foreground/25 shrink-0" />
      <LabelValue text={text} />
    </div>
  );
}

function NumberedCard({ block }: { block: NumberedBlock }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-background/80 border border-border/60 px-3 py-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
        {block.num}
      </span>
      <div className="flex-1 space-y-1.5 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug"
          dangerouslySetInnerHTML={{ __html: applyMarkdown(block.title) }} />
        {block.rows.length > 0 && (
          <div className="space-y-1 border-t border-border/40 pt-1.5 mt-1.5">
            {block.rows.map((r, i) => (
              <LabelValue key={i} text={r} className="block text-xs text-muted-foreground leading-snug" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionBlocks({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.kind === "numbered") return <NumberedCard key={i} block={b} />;
        if (b.kind === "arrow") return <ArrowChain key={i} parts={b.parts} />;
        if (b.kind === "bullet") return <BulletRow key={i} text={b.text} />;
        return (
          <p key={i} className="text-sm text-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: applyMarkdown(b.text) }} />
        );
      })}
    </div>
  );
}

function CopilotSection({ id, content }: ParsedSection) {
  const meta = SECTION_META[id];
  if (!meta) return null;
  return (
    <Card className={cn("border", meta.border, meta.bg)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className={cn("text-sm font-bold flex items-center gap-2", meta.heading)}>
          <span className="text-sm font-mono opacity-60">{id}.</span>
          {meta.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <SectionBlocks content={content} />
      </CardContent>
    </Card>
  );
}

function AICopilotPanel({ ops }: { ops: OpsIntelState }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [rawText, setRawText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setStatus("loading");
    setRawText("");
    setErrorMsg("");

    const payload = {
      healthScore: ops.healthScore,
      kpis: ops.kpis.map((k) => ({
        label: k.label,
        value: k.value,
        unit: k.unit,
        target: k.target,
        trend: k.trend,
        status: k.status,
        description: k.description,
      })),
    };

    try {
      const res = await fetch(`${BASE}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.error) { setErrorMsg(msg.error); setStatus("error"); return; }
            if (msg.done) { setStatus("done"); setAnalyzedAt(new Date()); return; }
            if (msg.content) setRawText((prev) => prev + msg.content);
          } catch { /* non-JSON line */ }
        }
      }

      setStatus("done");
      setAnalyzedAt(new Date());
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setErrorMsg(err.message ?? "Request failed");
      setStatus("error");
    }
  }, [ops]);

  const sections = parseSections(rawText);

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                AI Ops Copilot
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                  GPT-5.6
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Analyzes all {ops.kpis.length} currently supported KPIs and surfaces risks, relationships, and top 3 actions
                {analyzedAt && (
                  <span className="ml-2 text-muted-foreground/70">
                    · last run {formatDistanceToNow(analyzedAt, { addSuffix: true })}
                  </span>
                )}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === "done" && (
              <Button variant="outline" size="sm" onClick={runAnalysis} className="gap-1.5 text-xs">
                <RotateCw className="w-3.5 h-3.5" />
                Re-analyze
              </Button>
            )}
            {status === "idle" || status === "error" ? (
              <Button size="sm" onClick={runAnalysis} className="gap-1.5 font-semibold">
                <Sparkles className="w-4 h-4" />
                Run Analysis
              </Button>
            ) : status === "loading" ? (
              <Button size="sm" disabled className="gap-1.5">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing…
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {/* Idle state */}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3 border border-dashed border-border rounded-lg bg-muted/20">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Brain className="w-6 h-6 text-primary opacity-60" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No analysis yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Click <strong>Run Analysis</strong> to get a senior operations manager assessment of your current KPI state
              </p>
            </div>
          </div>
        )}

        {/* Loading / streaming */}
        {status === "loading" && (
          <div className="space-y-3">
            {rawText === "" ? (
              // Before first token
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 animate-pulse">
                    <div className="h-4 w-1/3 bg-muted rounded" />
                    <div className="h-3 w-full bg-muted rounded" />
                    <div className="h-3 w-5/6 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : (
              // Streaming in
              <div className="space-y-3">
                {sections.length > 0
                  ? sections.map((s) => <CopilotSection key={s.id} id={s.id} content={s.content} />)
                  : (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/20 rounded-lg p-4 border border-border">
                      {rawText}
                      <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse" />
                    </div>
                  )
                }
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {status === "done" && sections.length > 0 && (
          <div className="space-y-3">
            {sections.map((s) => <CopilotSection key={s.id} id={s.id} content={s.content} />)}
          </div>
        )}

        {/* Fallback: done but no sections parsed */}
        {status === "done" && sections.length === 0 && rawText && (
          <div className="text-sm text-foreground whitespace-pre-wrap bg-muted/20 rounded-lg p-4 border border-border leading-relaxed">
            {rawText}
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">Analysis failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000;

export default function OperationalIntelligencePage() {
  const { ops, isFetching, refetchAll } = useRealOpsIntel();
  const [flashedIds, setFl] = useState<Set<KpiId>>(new Set());

  // Flash all when ops changes significantly, or just omit flashing since data updates smoothly now.
  useEffect(() => {
    if (!isFetching) {
      const all = new Set<KpiId>([
        "inventory_accuracy", "production_utilization", "supplier_performance",
        "warehouse_fill_rate", "purchase_lead_time", "stock_turnover",
        "late_deliveries", "order_fulfillment_rate",
      ]);
      setFl(all);
      setTimeout(() => setFl(new Set()), 900);
    }
  }, [isFetching]);

  function handleRefresh() {
    if (isFetching) return;
    refetchAll();
  }

  const good = ops.kpis.filter((k) => k.status === "good").length;
  const warning = ops.kpis.filter((k) => k.status === "warning").length;
  const critical = ops.kpis.filter((k) => k.status === "critical").length;

  return (
    <div className="p-8 space-y-8 bg-background min-h-[100dvh]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Operational Intelligence
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Operations Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            {ops.kpis.length} KPIs currently supported by ERP-backed operational data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncPill isFetching={isFetching} />
          <Button onClick={handleRefresh} disabled={isFetching} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            {isFetching ? "Fetching…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Health summary bar ── */}
      <Card className="border-border shadow-sm">
        <CardContent className="py-4 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
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
                <span className="text-sm font-semibold text-foreground">Overall Operations Health</span>
                <StatusCount ops={ops} />
              </div>
              <Progress value={ops.healthScore} className="h-2" />
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span><span className="text-emerald-600 font-semibold">{good}</span> KPIs on target</span>
                <span><span className="text-amber-500 font-semibold">{warning}</span> need attention</span>
                <span><span className="text-destructive font-semibold">{critical}</span> critical</span>
                <span className="ml-auto">
                  Updated {formatDistanceToNow(ops.lastUpdatedAt, { addSuffix: true })}
                </span>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
              <Badge variant="outline" className="text-xs font-mono">
                ERP-Backed Snapshot
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Data derived directly from Odoo
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

      {/* ── Alert strips ── */}
      {critical > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {critical} Critical KPI{critical > 1 ? "s" : ""} Require Attention
            </CardTitle>
            <CardDescription>The following metrics are below safe operating thresholds.</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {ops.kpis.filter((k) => k.status === "critical").map((k) => (
                <Badge key={k.id} variant="destructive" className="gap-1.5 font-normal">
                  {KPI_ICONS[k.id]}
                  {k.label} — <span className="font-mono">{(k.value || 0).toFixed(k.format === "integer" ? 0 : 1)}{k.unit}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {warning > 0 && (
        <Card className="border-amber-400/30 bg-amber-400/5 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              {warning} KPI{warning > 1 ? "s" : ""} Need Monitoring
            </CardTitle>
            <CardDescription>These metrics are currently within the warning range and need monitoring.</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {ops.kpis.filter((k) => k.status === "warning").map((k) => (
                <Badge key={k.id} variant="secondary" className="gap-1.5 font-normal bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  {KPI_ICONS[k.id]}
                  {k.label} — <span className="font-mono">{(k.value || 0).toFixed(k.format === "integer" ? 0 : 1)}{k.unit}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── AI Copilot ── */}
      <AICopilotPanel ops={ops} />
    </div>
  );
}
