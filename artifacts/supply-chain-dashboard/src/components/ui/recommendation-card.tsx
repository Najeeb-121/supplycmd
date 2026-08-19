/**
 * RecommendationCard — reusable AI Decision Engine recommendation card.
 * Built on existing Card / Badge / Button primitives.
 * Zero new dependencies.
 */

import { memo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ShoppingCart,
  Clock,
  Activity,
  ArrowLeftRight,
  TrendingDown as TrendDown,
  Tag,
  AlertTriangle,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  Recommendation,
  RecommendationPriority,
  RecommendationStatus,
  RecommendationType,
} from "@/services/ai-decision-engine";

// ─── Colour tokens per priority ───────────────────────────────────────────────

const PRIORITY_STYLES: Record<
  RecommendationPriority,
  { border: string; topBar: string; badgeCls: string; labelCls: string }
> = {
  critical: {
    border: "border-destructive/40",
    topBar: "bg-destructive",
    badgeCls: "bg-destructive text-destructive-foreground",
    labelCls: "text-destructive",
  },
  high: {
    border: "border-orange-400/40",
    topBar: "bg-orange-500",
    badgeCls: "bg-orange-500 text-white",
    labelCls: "text-orange-600",
  },
  medium: {
    border: "border-amber-400/40",
    topBar: "bg-amber-400",
    badgeCls: "bg-amber-400 text-amber-900",
    labelCls: "text-amber-600",
  },
  low: {
    border: "border-blue-400/30",
    topBar: "bg-blue-400",
    badgeCls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    labelCls: "text-blue-600",
  },
};

// ─── Status display ───────────────────────────────────────────────────────────

const STATUS_META: Record<
  RecommendationStatus,
  { label: string; icon: React.ReactNode; cls: string }
> = {
  new: {
    label: "New",
    icon: <Zap className="w-3 h-3" />,
    cls: "bg-primary text-primary-foreground",
  },
  acknowledged: {
    label: "Acknowledged",
    icon: <CheckCircle2 className="w-3 h-3" />,
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  in_progress: {
    label: "In Progress",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  applied: {
    label: "Applied",
    icon: <CheckCircle2 className="w-3 h-3" />,
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  dismissed: {
    label: "Dismissed",
    icon: <XCircle className="w-3 h-3" />,
    cls: "bg-muted text-muted-foreground",
  },
};

// ─── Type icons ───────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<RecommendationType, React.ReactNode> = {
  reorder_material:            <ShoppingCart   className="w-4 h-4" />,
  delay_purchase_order:        <Clock          className="w-4 h-4" />,
  increase_production_capacity: <Activity      className="w-4 h-4" />,
  transfer_inventory:          <ArrowLeftRight className="w-4 h-4" />,
  reduce_safety_stock:         <TrendDown      className="w-4 h-4" />,
  flag_slow_moving:            <Tag            className="w-4 h-4" />,
  supplier_delay_detected:     <AlertTriangle  className="w-4 h-4" />,
  predict_stockout:            <Zap            className="w-4 h-4" />,
};

// ─── Confidence ring ──────────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    score >= 85 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="38" height="38" className="-rotate-90">
        <circle cx="19" cy="19" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="3.5" />
        <circle
          cx="19" cy="19" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-mono font-bold text-foreground leading-none">
          {score}
        </span>
      </div>
    </div>
  );
}

// ─── Data point row ───────────────────────────────────────────────────────────

function DataPointRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {trend === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
        {trend === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
        {trend === "flat" && <Minus className="w-3 h-3 text-muted-foreground" />}
        <span className="text-xs font-mono font-medium text-foreground">{value}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface RecommendationCardProps {
  rec: Recommendation;
  onStatusChange: (id: string, status: RecommendationStatus) => void;
  flash?: boolean;
}

export const RecommendationCard = memo(function RecommendationCard({
  rec,
  onStatusChange,
  flash = false,
}: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const pStyles = PRIORITY_STYLES[rec.priority];
  const sMeta   = STATUS_META[rec.status];
  const isDismissed = rec.status === "dismissed";
  const isApplied   = rec.status === "applied";

  return (
    <Card
      className={cn(
        "border shadow-sm overflow-hidden transition-all duration-500 flex flex-col",
        pStyles.border,
        isDismissed && "opacity-50",
        flash && "ring-2 ring-primary/40"
      )}
    >
      {/* Priority top bar */}
      <div className={cn("h-1 w-full shrink-0", pStyles.topBar)} />

      <CardHeader className="px-4 pt-3 pb-0">
        {/* Header row: icon + title + priority badge */}
        <div className="flex items-start gap-2">
          <span className={cn("mt-0.5 shrink-0", pStyles.labelCls)}>
            {TYPE_ICONS[rec.type]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              {rec.title}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge
                variant="secondary"
                className={cn("text-[10px] font-bold uppercase px-1.5 py-0", pStyles.badgeCls)}
              >
                {rec.priority}
              </Badge>
              <Badge
                variant="secondary"
                className={cn("text-[10px] gap-1 px-1.5 py-0", sMeta.cls)}
              >
                {sMeta.icon}
                {sMeta.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {rec.affectedDepartment}
              </Badge>
            </div>
          </div>

          {/* Confidence ring */}
          <div className="shrink-0 flex flex-col items-center">
            <ConfidenceRing score={rec.confidenceScore} />
            <span className="text-[9px] text-muted-foreground mt-0.5 text-center leading-tight">
              Confidence
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pt-3 pb-3 space-y-3 flex-1 flex flex-col">
        {/* Recommendation text */}
        <p className="text-xs text-foreground leading-relaxed">
          {rec.recommendation}
        </p>

        {/* Key metrics row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/50 px-2.5 py-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Est. Savings
            </p>
            <p className="text-base font-mono font-bold text-emerald-600">
              {rec.estimatedSavings === "UNKNOWN" ? "UNKNOWN" : `$${(rec.estimatedSavings as number).toLocaleString()}`}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              ERP Source
            </p>
            <p className="text-xs font-medium text-foreground">{rec.sourceEntity}</p>
          </div>
        </div>

        {/* Expandable detail */}
        <div className="mt-auto">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span>View details</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              {/* Business impact */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Business Impact
                </p>
                <p className="text-xs text-foreground leading-relaxed">{rec.businessImpact}</p>
              </div>

              {/* Reasoning */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Reasoning
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{rec.reasoning}</p>
              </div>

              {/* Data points */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Supporting Data
                </p>
                <div>
                  {rec.dataPoints.map((dp) => (
                    <DataPointRow
                      key={dp.label}
                      label={dp.label}
                      value={dp.value}
                      trend={dp.trend}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-1" />

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {rec.status === "new" && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs flex-1 min-w-[80px]"
                onClick={() => onStatusChange(rec.id, "acknowledged")}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" /> Acknowledge
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onStatusChange(rec.id, "dismissed")}
              >
                Dismiss
              </Button>
            </>
          )}
          {rec.status === "acknowledged" && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs flex-1 min-w-[80px]"
                onClick={() => onStatusChange(rec.id, "in_progress")}
              >
                <Loader2 className="w-3 h-3 mr-1" /> Start Action
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onStatusChange(rec.id, "dismissed")}
              >
                Dismiss
              </Button>
            </>
          )}
          {rec.status === "in_progress" && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs flex-1 min-w-[80px] bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onStatusChange(rec.id, "applied")}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Applied
              </Button>
            </>
          )}
          {(rec.status === "applied" || rec.status === "dismissed") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onStatusChange(rec.id, "new")}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Reopen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
