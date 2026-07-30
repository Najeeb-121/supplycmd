/**
 * KpiCard — reusable operational KPI card.
 * Shows: label, value+unit, delta vs previous, status colour, sparkline,
 * target bar, and a trend icon.  Zero duplicate card logic — built on top
 * of the existing Card primitives.
 */

import { memo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KpiMetric, KpiStatus, KpiTrend } from "@/services/operational-intelligence";

// ─── Status colour tokens ─────────────────────────────────────────────────────

const STATUS_STYLES: Record<
  KpiStatus,
  { border: string; accent: string; text: string; sparkColor: string; badgeCls: string }
> = {
  good: {
    border: "border-emerald-500/30",
    accent: "bg-emerald-500/10",
    text: "text-emerald-600",
    sparkColor: "#10b981",
    badgeCls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  warning: {
    border: "border-amber-400/40",
    accent: "bg-amber-400/10",
    text: "text-amber-600",
    sparkColor: "#f59e0b",
    badgeCls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  critical: {
    border: "border-destructive/40",
    accent: "bg-destructive/5",
    text: "text-destructive",
    sparkColor: "hsl(var(--destructive))",
    badgeCls: "bg-destructive/10 text-destructive",
  },
};

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatValue(kpi: KpiMetric): string {
  switch (kpi.format) {
    case "percent":
      return kpi.value.toFixed(1);
    case "integer":
      return String(Math.round(kpi.value));
    case "days":
      return kpi.value.toFixed(1);
    default:
      return kpi.value.toFixed(1);
  }
}

function formatDelta(kpi: KpiMetric): { label: string; positive: boolean } | null {
  const diff = kpi.value - kpi.prevValue;
  if (Math.abs(diff) < 0.005) return null;
  const sign = diff > 0 ? "+" : "";
  const label =
    kpi.format === "integer"
      ? `${sign}${Math.round(diff)}`
      : `${sign}${diff.toFixed(kpi.format === "percent" ? 1 : 2)}`;
  // "positive" means the change is GOOD for this KPI
  const isGoodChange = kpi.goodDirection === "up" ? diff > 0 : diff < 0;
  return { label, positive: isGoodChange };
}

function TrendIcon({
  trend,
  goodDirection,
  className,
}: {
  trend: KpiTrend;
  goodDirection: KpiMetric["goodDirection"];
  className?: string;
}) {
  if (trend === "flat")
    return <Minus className={cn("w-4 h-4 text-muted-foreground", className)} />;
  const isGood =
    (trend === "up" && goodDirection === "up") ||
    (trend === "down" && goodDirection === "down");
  const Icon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <Icon
      className={cn(
        "w-4 h-4",
        isGood ? "text-emerald-500" : "text-destructive",
        className
      )}
    />
  );
}

// ─── Target progress strip ────────────────────────────────────────────────────

function TargetStrip({ kpi, sparkColor }: { kpi: KpiMetric; sparkColor: string }) {
  // For "down-is-good" KPIs, progress = (1 - value/target) clamped to 0-1
  let pct: number;
  if (kpi.goodDirection === "up") {
    pct = Math.min(1, kpi.value / kpi.target);
  } else {
    // lower is better — full bar = at or below target
    pct = kpi.value <= kpi.target ? 1 : clamp(kpi.target / kpi.value, 0, 1);
  }

  return (
    <div className="mt-2 space-y-0.5">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Target className="w-2.5 h-2.5" />
          Target{" "}
          {kpi.format === "percent" || kpi.unit === "%"
            ? `${kpi.target}%`
            : kpi.format === "days"
            ? `${kpi.target} days`
            : kpi.unit === "×"
            ? `${kpi.target}×`
            : `${kpi.target}${kpi.unit}`}
        </span>
        <span className="font-mono">{Math.round(pct * 100)}%</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct * 100}%`, backgroundColor: sparkColor }}
        />
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="10%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, "")})`}
          dot={false}
          isAnimationActive={false}
        />
        <RechartsTooltip
          contentStyle={{
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--foreground))",
          }}
          itemStyle={{ color: color }}
          formatter={(v: number) => [v.toFixed(1), ""]}
          labelFormatter={() => ""}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface KpiCardProps {
  kpi: KpiMetric;
  /** Icon element rendered next to the label */
  icon?: React.ReactNode;
  /** Extra className forwarded to the card root */
  className?: string;
  /** Flash animation when value just changed */
  flash?: boolean;
}

export const KpiCard = memo(function KpiCard({
  kpi,
  icon,
  className,
  flash = false,
}: KpiCardProps) {
  const styles = STATUS_STYLES[kpi.status];
  const delta = formatDelta(kpi);

  return (
    <Card
      className={cn(
        "border shadow-sm overflow-hidden transition-all duration-500",
        styles.border,
        flash && "ring-2 ring-primary/40",
        className
      )}
    >
      {/* Coloured accent strip on top */}
      <div className={cn("h-0.5 w-full", styles.accent.replace("bg-", "bg-"))} style={{ backgroundColor: styles.sparkColor + "66" }} />

      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className={cn("shrink-0", styles.text)}>{icon}</span>
            )}
            <CardTitle
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight"
            >
              {kpi.label}
            </CardTitle>
          </div>
          <Badge
            variant="secondary"
            className={cn("text-[10px] font-semibold capitalize shrink-0 px-1.5 py-0", styles.badgeCls)}
          >
            {kpi.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-2">
        {/* Value row */}
        <div className="flex items-end justify-between gap-1">
          <div className="flex items-baseline gap-0.5 leading-none">
            <span
              className={cn(
                "text-3xl font-mono font-bold transition-colors duration-300",
                flash ? "text-primary" : "text-foreground"
              )}
            >
              {formatValue(kpi)}
            </span>
            <span className="text-sm text-muted-foreground ml-0.5">{kpi.unit}</span>
          </div>

          <div className="flex flex-col items-end gap-1">
            <TrendIcon trend={kpi.trend} goodDirection={kpi.goodDirection} />
            {delta && (
              <span
                className={cn(
                  "text-[11px] font-mono font-medium",
                  delta.positive ? "text-emerald-600" : "text-destructive"
                )}
              >
                {delta.label}
              </span>
            )}
          </div>
        </div>

        {/* Sparkline */}
        <Sparkline data={kpi.sparkline} color={styles.sparkColor} />

        {/* Target strip */}
        <TargetStrip kpi={kpi} sparkColor={styles.sparkColor} />

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-tight">
          {kpi.description}
        </p>
      </CardContent>
    </Card>
  );
});
