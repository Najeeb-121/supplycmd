/**
 * Operational Intelligence Service
 * Derives 8 live KPI metrics from the ERP sync state produced by
 * erp-integration.ts.  No backend calls — all values are computed from
 * the same mock data layer, keeping the two services in sync.
 */

import type { ErpConnectionState } from "./erp-integration";

// ─── Types ────────────────────────────────────────────────────────────────────

export type KpiStatus = "good" | "warning" | "critical";
export type KpiTrend = "up" | "down" | "flat";
export type KpiId =
  | "inventory_accuracy"
  | "production_utilization"
  | "supplier_performance"
  | "warehouse_fill_rate"
  | "purchase_lead_time"
  | "stock_turnover"
  | "late_deliveries"
  | "order_fulfillment_rate";

export interface KpiMetric {
  id: KpiId;
  label: string;
  description: string;
  /** Current value in the metric's native unit */
  value: number;
  /** Value from the previous tick — used to derive delta */
  prevValue: number;
  unit: string;
  /** Formatting hint for the display layer */
  format: "percent" | "decimal" | "integer" | "days";
  /** Which direction is healthy (affects delta colour) */
  goodDirection: "up" | "down";
  /** Operational target */
  target: number;
  status: KpiStatus;
  trend: KpiTrend;
  /** 10-point sparkline history (oldest → newest) */
  sparkline: number[];
}

export interface OpsIntelState {
  kpis: KpiMetric[];
  healthScore: number;      // 0-100 composite
  lastUpdatedAt: Date;
  syncCycleCount: number;
}

// ─── KPI metadata (static) ───────────────────────────────────────────────────

interface KpiMeta {
  id: KpiId;
  label: string;
  description: string;
  unit: string;
  format: KpiMetric["format"];
  goodDirection: KpiMetric["goodDirection"];
  target: number;
  baseline: number;        // starting realistic value
  volatility: number;      // max ± change per tick
  goodThreshold: number;   // value at/above (for "up") or at/below (for "down") which status is good
  warnThreshold: number;   // boundary between warning and critical
}

const KPI_META: KpiMeta[] = [
  {
    id: "inventory_accuracy",
    label: "Inventory Accuracy",
    description: "Physical count matches system-of-record",
    unit: "%",
    format: "percent",
    goodDirection: "up",
    target: 99,
    baseline: 97.4,
    volatility: 0.3,
    goodThreshold: 98,
    warnThreshold: 95,
  },
  {
    id: "production_utilization",
    label: "Production Utilization",
    description: "Actual vs available machine capacity",
    unit: "%",
    format: "percent",
    goodDirection: "up",
    target: 85,
    baseline: 78.2,
    volatility: 1.5,
    goodThreshold: 75,
    warnThreshold: 60,
  },
  {
    id: "supplier_performance",
    label: "Supplier Performance",
    description: "Composite on-time, quality & accuracy score",
    unit: "/100",
    format: "decimal",
    goodDirection: "up",
    target: 85,
    baseline: 81.5,
    volatility: 0.8,
    goodThreshold: 80,
    warnThreshold: 65,
  },
  {
    id: "warehouse_fill_rate",
    label: "Warehouse Fill Rate",
    description: "Storage capacity currently in use",
    unit: "%",
    format: "percent",
    goodDirection: "up",
    target: 80,
    baseline: 73.6,
    volatility: 1.2,
    goodThreshold: 60,
    warnThreshold: 40,
  },
  {
    id: "purchase_lead_time",
    label: "Purchase Lead Time",
    description: "Average days from PO to goods receipt",
    unit: " days",
    format: "days",
    goodDirection: "down",
    target: 12,
    baseline: 14.3,
    volatility: 0.5,
    goodThreshold: 14,    // ≤ 14 days = good (goodDirection = down, so good when ≤ threshold)
    warnThreshold: 21,
  },
  {
    id: "stock_turnover",
    label: "Stock Turnover",
    description: "Annual inventory turns (COGS ÷ avg inventory)",
    unit: "×",
    format: "decimal",
    goodDirection: "up",
    target: 10,
    baseline: 8.7,
    volatility: 0.2,
    goodThreshold: 8,
    warnThreshold: 4,
  },
  {
    id: "late_deliveries",
    label: "Late Deliveries",
    description: "Open orders past confirmed delivery date",
    unit: " orders",
    format: "integer",
    goodDirection: "down",
    target: 0,
    baseline: 4,
    volatility: 1,
    goodThreshold: 3,   // ≤ 3 = good
    warnThreshold: 8,
  },
  {
    id: "order_fulfillment_rate",
    label: "Order Fulfillment Rate",
    description: "Orders shipped complete and on time (OTIF)",
    unit: "%",
    format: "percent",
    goodDirection: "up",
    target: 98,
    baseline: 95.1,
    volatility: 0.4,
    goodThreshold: 95,
    warnThreshold: 90,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function resolveStatus(meta: KpiMeta, value: number): KpiStatus {
  if (meta.goodDirection === "up") {
    if (value >= meta.goodThreshold) return "good";
    if (value >= meta.warnThreshold) return "warning";
    return "critical";
  } else {
    if (value <= meta.goodThreshold) return "good";
    if (value <= meta.warnThreshold) return "warning";
    return "critical";
  }
}

function resolveTrend(current: number, prev: number): KpiTrend {
  const diff = current - prev;
  if (Math.abs(diff) < 0.01) return "flat";
  return diff > 0 ? "up" : "down";
}

/** Build a plausible 10-point history ending at `current`. */
function buildSparkline(meta: KpiMeta, current: number): number[] {
  const points: number[] = [];
  let v = clamp(current - meta.volatility * 3, 0, 200);
  for (let i = 0; i < 9; i++) {
    v += (Math.random() - 0.45) * meta.volatility;
    // Gently revert toward baseline so sparkline looks realistic
    v += (meta.baseline - v) * 0.05;
    if (meta.format === "percent") v = clamp(v, 0, 100);
    if (meta.format === "integer") v = Math.max(0, Math.round(v));
    points.push(parseFloat(v.toFixed(2)));
  }
  points.push(parseFloat(current.toFixed(2)));
  return points;
}

/**
 * Derive a small influence from the ERP sync state to make KPIs feel
 * connected to the integration layer without hard-coding magic numbers.
 */
function erpInfluence(erp: ErpConnectionState): Record<KpiId, number> {
  const invEnt = erp.entities.find((e) => e.entity === "Inventory");
  const poEnt  = erp.entities.find((e) => e.entity === "Purchase Orders");
  const soEnt  = erp.entities.find((e) => e.entity === "Sales Orders");
  const supEnt = erp.entities.find((e) => e.entity === "Suppliers");
  const prodEnt = erp.entities.find((e) => e.entity === "Production Orders");

  // Error in a related entity nudges the KPI toward worse territory
  const invNudge  = invEnt?.status  === "error" ? -0.5 : 0;
  const poNudge   = poEnt?.status   === "error" ? -0.3 : 0;
  const soNudge   = soEnt?.status   === "error" ? -0.4 : 0;
  const supNudge  = supEnt?.status  === "error" ? -0.6 : 0;
  const prodNudge = prodEnt?.status === "error" ? -0.8 : 0;

  return {
    inventory_accuracy:      invNudge,
    production_utilization:  prodNudge,
    supplier_performance:    supNudge,
    warehouse_fill_rate:     invNudge * 0.5,
    purchase_lead_time:      poNudge * -1,  // nudge increases lead time (bad)
    stock_turnover:          invNudge * 0.3,
    late_deliveries:         (soNudge + poNudge) * -2, // nudge increases late orders (bad)
    order_fulfillment_rate:  soNudge + poNudge * 0.5,
  };
}

function computeHealthScore(kpis: KpiMetric[]): number {
  const weights: Record<KpiStatus, number> = { good: 100, warning: 55, critical: 10 };
  const total = kpis.reduce((s, k) => s + weights[k.status], 0);
  return Math.round(total / kpis.length);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Call once at mount time to seed the dashboard. */
export function buildInitialOpsState(erp: ErpConnectionState): OpsIntelState {
  const influence = erpInfluence(erp);
  const kpis: KpiMetric[] = KPI_META.map((meta) => {
    const raw = meta.baseline + influence[meta.id];
    const value = parseFloat(
      meta.format === "integer"
        ? String(Math.max(0, Math.round(raw)))
        : raw.toFixed(meta.format === "percent" ? 1 : 2)
    );
    return {
      id: meta.id,
      label: meta.label,
      description: meta.description,
      unit: meta.unit,
      format: meta.format,
      goodDirection: meta.goodDirection,
      target: meta.target,
      value,
      prevValue: value,
      status: resolveStatus(meta, value),
      trend: "flat",
      sparkline: buildSparkline(meta, value),
    };
  });

  return {
    kpis,
    healthScore: computeHealthScore(kpis),
    lastUpdatedAt: new Date(),
    syncCycleCount: 0,
  };
}

/**
 * Advance all KPIs by one tick.  Pass the current ERP state so that
 * entity-level errors propagate into the relevant metrics.
 */
export function tickOpsState(
  prev: OpsIntelState,
  erp: ErpConnectionState
): OpsIntelState {
  const influence = erpInfluence(erp);

  const kpis: KpiMetric[] = prev.kpis.map((kpi) => {
    const meta = KPI_META.find((m) => m.id === kpi.id)!;

    // Random walk + mean reversion toward baseline
    const walk = (Math.random() - 0.48) * meta.volatility;
    const revert = (meta.baseline - kpi.value) * 0.08;
    let raw = kpi.value + walk + revert + influence[meta.id];

    // Clamp to sensible ranges
    if (meta.format === "percent") raw = clamp(raw, 0, 100);
    if (meta.format === "integer") raw = Math.max(0, raw);
    if (meta.id === "stock_turnover") raw = clamp(raw, 1, 30);
    if (meta.id === "supplier_performance") raw = clamp(raw, 0, 100);
    if (meta.id === "purchase_lead_time") raw = clamp(raw, 1, 60);

    const value = parseFloat(
      meta.format === "integer"
        ? String(Math.round(raw))
        : raw.toFixed(meta.format === "percent" ? 1 : 2)
    );

    return {
      ...kpi,
      prevValue: kpi.value,
      value,
      status: resolveStatus(meta, value),
      trend: resolveTrend(value, kpi.value),
      sparkline: [...kpi.sparkline.slice(1), value],
    };
  });

  return {
    kpis,
    healthScore: computeHealthScore(kpis),
    lastUpdatedAt: new Date(),
    syncCycleCount: prev.syncCycleCount + 1,
  };
}
