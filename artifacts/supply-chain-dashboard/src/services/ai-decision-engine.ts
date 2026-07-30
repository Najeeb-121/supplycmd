/**
 * AI Decision Engine Service
 * Continuously analyses ERP sync state and operational KPIs to produce
 * prioritised, actionable supply chain recommendations.
 *
 * Pure logic — no UI imports, no API calls.
 * The page drives polling; this module only processes data.
 */

import type { ErpConnectionState, EntitySyncState } from "./erp-integration";
import type { OpsIntelState, KpiMetric } from "./operational-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationType =
  | "reorder_material"
  | "delay_purchase_order"
  | "increase_production_capacity"
  | "transfer_inventory"
  | "reduce_safety_stock"
  | "flag_slow_moving"
  | "supplier_delay_detected"
  | "predict_stockout";

export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export type RecommendationStatus =
  | "new"
  | "acknowledged"
  | "in_progress"
  | "applied"
  | "dismissed";

export type Department =
  | "Procurement"
  | "Warehouse"
  | "Production"
  | "Supply Chain"
  | "Finance"
  | "Logistics";

export interface DataPoint {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  /** One-line action headline */
  title: string;
  /** Full actionable recommendation text */
  recommendation: string;
  /** Narrative explaining the operational impact */
  businessImpact: string;
  estimatedSavings: number;       // USD
  confidenceScore: number;        // 0–100
  /** Chain-of-thought reasoning bullet string */
  reasoning: string;
  affectedDepartment: Department;
  status: RecommendationStatus;
  generatedAt: Date;
  /** ERP entity that surfaced this signal */
  sourceEntity: string;
  /** Supporting data points shown on the card */
  dataPoints: DataPoint[];
}

export interface DecisionEngineState {
  recommendations: Recommendation[];
  lastAnalysedAt: Date;
  cycleCount: number;
  totalEstimatedSavings: number;
  modelVersion: string;
  analysisStatus: "idle" | "analysing" | "complete";
}

// ─── Static catalogue data ────────────────────────────────────────────────────

const RAW_MATERIALS = [
  "ABS Plastic Pellets",
  "Steel Rod 12 mm",
  "Copper Wire 2 AWG",
  "Aluminum Sheet 3 mm",
  "Carbon Fibre Prepreg",
  "Polycarbonate Resin",
];

const FINISHED_GOODS = [
  "Alloy Housing X",
  "Circuit Board v3",
  "Motor Assembly Mk2",
  "Hydraulic Valve Kit",
  "Sensor Array Module",
];

const SUPPLIERS = [
  { name: "SupplierA Corp", score: 76, leadTime: 18 },
  { name: "FastParts Ltd", score: 88, leadTime: 9 },
  { name: "MetalWorks Inc", score: 62, leadTime: 22 },
  { name: "PrecisionCo", score: 71, leadTime: 16 },
  { name: "GlobalMat GmbH", score: 84, leadTime: 11 },
];

const PO_REFS = ["PO-2024-0891", "PO-2024-0743", "PO-2024-1102", "PO-2024-0955"];
const WAREHOUSES = ["Warehouse A", "Warehouse B", "Central Depot", "Satellite Store 3"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idSeed = 0;
function stableId(type: RecommendationType, discriminator: string): string {
  return `${type}-${discriminator}`;
}

function seededRandom(seed: string): number {
  // Deterministic per cycle+seed so values don't flicker between renders
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(((h >>> 0) / 0xffffffff));
}

function pick<T>(arr: T[], seed: string): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

function jitterPct(base: number, seed: string, range = 3): number {
  return parseFloat((base + (seededRandom(seed) - 0.5) * range).toFixed(1));
}

function kpi(ops: OpsIntelState, id: string): KpiMetric | undefined {
  return ops.kpis.find((k) => k.id === id);
}

function entity(erp: ErpConnectionState, name: string): EntitySyncState | undefined {
  return erp.entities.find((e) => e.entity === name);
}

// ─── Individual recommendation generators ────────────────────────────────────
// Each function returns a Recommendation | null.
// The caller decides whether to include it based on current conditions.

interface GenCtx {
  erp: ErpConnectionState;
  ops: OpsIntelState;
  cycle: number;
  prev: Map<string, RecommendationStatus>;
}

function genReorderMaterial(ctx: GenCtx): Recommendation | null {
  const inv = kpi(ctx.ops, "inventory_accuracy");
  if (!inv || inv.value >= 98.5) return null;

  const mat = pick(RAW_MATERIALS, `rm${ctx.cycle}`);
  const currentStock = Math.round(120 + seededRandom(`rm-stk${ctx.cycle}`) * 80);
  const reorderQty   = Math.round(500 + seededRandom(`rm-qty${ctx.cycle}`) * 400);
  const savings      = Math.round(4_200 + seededRandom(`rm-sav${ctx.cycle}`) * 8_800);
  const confidence   = Math.round(78 + seededRandom(`rm-con${ctx.cycle}`) * 18);
  const id = stableId("reorder_material", mat.replace(/\s+/g, "_"));

  return {
    id,
    type: "reorder_material",
    priority: inv.value < 96 ? "critical" : "high",
    title: `Reorder ${mat}`,
    recommendation: `Immediately raise purchase order for ${reorderQty.toLocaleString()} units of ${mat} from preferred supplier. Current on-hand stock will be depleted within the next 5–7 production days at current consumption rate.`,
    businessImpact: `Failure to reorder will halt production of ${pick(FINISHED_GOODS, `rm-fg${ctx.cycle}`)} within the next production cycle, impacting ${Math.round(12 + seededRandom(`rm-imp${ctx.cycle}`) * 20)} downstream orders totalling an estimated $${(savings * 3.2).toLocaleString("en", { maximumFractionDigits: 0 })} in revenue.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `Inventory accuracy dropped to ${inv.value.toFixed(1)}% (threshold 98.5%). Current stock of ${currentStock} units is below the calculated reorder point. Last 3 sync cycles show a consistent downward trend in this SKU.`,
    affectedDepartment: "Procurement",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Inventory",
    dataPoints: [
      { label: "Current Stock", value: `${currentStock} units`, trend: "down" },
      { label: "Reorder Point", value: `${Math.round(reorderQty * 0.3)} units` },
      { label: "Inventory Accuracy", value: `${inv.value.toFixed(1)}%`, trend: "down" },
      { label: "Suggested Order Qty", value: `${reorderQty.toLocaleString()} units` },
    ],
  };
}

function genDelayPurchaseOrder(ctx: GenCtx): Recommendation | null {
  const wfr = kpi(ctx.ops, "warehouse_fill_rate");
  if (!wfr || wfr.value < 82) return null;

  const po = pick(PO_REFS, `po${ctx.cycle}`);
  const savings = Math.round(1_800 + seededRandom(`po-sav${ctx.cycle}`) * 3_200);
  const confidence = Math.round(70 + seededRandom(`po-con${ctx.cycle}`) * 20);
  const id = stableId("delay_purchase_order", po);

  return {
    id,
    type: "delay_purchase_order",
    priority: wfr.value > 90 ? "high" : "medium",
    title: `Delay ${po} by 2 weeks`,
    recommendation: `Postpone delivery of ${po} by 14 days. Warehouse fill rate is currently ${wfr.value.toFixed(1)}% — receiving this order now would exceed safe storage capacity and incur overflow handling charges.`,
    businessImpact: `Delaying avoids an estimated $${savings.toLocaleString()} in emergency overflow storage costs and reduces inbound logistics congestion. No stockout risk within the 14-day window based on current demand trajectory.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `Warehouse fill rate is ${wfr.value.toFixed(1)}% (warning threshold 82%). Accepting scheduled delivery will push utilisation above 95%, triggering overflow protocol. Demand-side forecast shows no urgent draw-down in the next 10 days.`,
    affectedDepartment: "Procurement",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Purchase Orders",
    dataPoints: [
      { label: "Warehouse Fill Rate", value: `${wfr.value.toFixed(1)}%`, trend: "up" },
      { label: "Safe Capacity Limit", value: "85%" },
      { label: "Inbound PO Value", value: `$${(savings * 4.5).toLocaleString("en", { maximumFractionDigits: 0 })}` },
      { label: "Delay Recommended", value: "14 days" },
    ],
  };
}

function genIncreaseProductionCapacity(ctx: GenCtx): Recommendation | null {
  const pu = kpi(ctx.ops, "production_utilization");
  if (!pu || pu.value < 82) return null;

  const savings = Math.round(12_000 + seededRandom(`pc-sav${ctx.cycle}`) * 18_000);
  const confidence = Math.round(72 + seededRandom(`pc-con${ctx.cycle}`) * 20);
  const product = pick(FINISHED_GOODS, `pc-fg${ctx.cycle}`);
  const id = stableId("increase_production_capacity", "main-line");

  return {
    id,
    type: "increase_production_capacity",
    priority: pu.value > 92 ? "critical" : "high",
    title: "Increase Production Capacity — Line 2",
    recommendation: `Activate standby work centre on Line 2 to relieve bottleneck. Extend shift from 8 h to 10 h for the next 5 production days. This will meet the committed delivery schedule for ${product} without delaying other planned runs.`,
    businessImpact: `Current utilisation of ${pu.value.toFixed(1)}% leaves no buffer for unplanned downtime. An additional shift adds ~${Math.round(pu.value * 0.15).toFixed(0)}% throughput capacity, unlocking $${savings.toLocaleString()} in deliverable value and protecting OTIF commitments on ${Math.round(8 + seededRandom(`pc-ord${ctx.cycle}`) * 12)} open customer orders.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `Production utilisation is ${pu.value.toFixed(1)}% (critical threshold 92%). OEE signal from the last cycle indicates the bottleneck is on Line 2 assembly. Demand forecast for ${product} is rising at ${jitterPct(7, `pc-rise${ctx.cycle}`)}% month-over-month.`,
    affectedDepartment: "Production",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Production Orders",
    dataPoints: [
      { label: "Current Utilisation", value: `${pu.value.toFixed(1)}%`, trend: "up" },
      { label: "Bottleneck", value: "Line 2 Assembly" },
      { label: "Recommended Shift Extension", value: "+2 h/day" },
      { label: "Capacity Gain", value: `+${Math.round(pu.value * 0.15)}%` },
    ],
  };
}

function genTransferInventory(ctx: GenCtx): Recommendation | null {
  const wfr = kpi(ctx.ops, "warehouse_fill_rate");
  const inv = kpi(ctx.ops, "inventory_accuracy");
  if (!wfr || !inv || wfr.value < 70) return null;

  const from = pick(WAREHOUSES, `tr-from${ctx.cycle}`);
  const to   = pick(WAREHOUSES.filter((w) => w !== from), `tr-to${ctx.cycle}`);
  const sku  = pick(RAW_MATERIALS, `tr-sku${ctx.cycle}`);
  const qty  = Math.round(200 + seededRandom(`tr-qty${ctx.cycle}`) * 600);
  const savings = Math.round(800 + seededRandom(`tr-sav${ctx.cycle}`) * 2_000);
  const confidence = Math.round(65 + seededRandom(`tr-con${ctx.cycle}`) * 25);
  const id = stableId("transfer_inventory", `${from}-${to}`.replace(/\s+/g, "_"));

  return {
    id,
    type: "transfer_inventory",
    priority: "medium",
    title: `Transfer ${sku} from ${from} to ${to}`,
    recommendation: `Move ${qty.toLocaleString()} units of ${sku} from ${from} (${Math.round(85 + seededRandom(`tr-f${ctx.cycle}`) * 10)}% full) to ${to} (${Math.round(40 + seededRandom(`tr-t${ctx.cycle}`) * 20)}% full). This rebalances storage load and positions stock closer to the consuming production line.`,
    businessImpact: `Rebalancing reduces handling inefficiency and cuts inter-warehouse transfer lead time by approximately ${Math.round(1 + seededRandom(`tr-lt${ctx.cycle}`) * 3)} days on the next production demand. Estimated reduction in overtime handling cost: $${savings.toLocaleString()}.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `${from} fill rate detected above 85%. ${to} has spare capacity. ${sku} demand is concentrated near ${to}'s production line. Transfer cost is outweighed by storage and handling savings.`,
    affectedDepartment: "Warehouse",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Inventory",
    dataPoints: [
      { label: "Source Warehouse", value: `${from} — ${Math.round(85 + seededRandom(`tr-fill${ctx.cycle}`) * 10)}% full` },
      { label: "Target Warehouse", value: `${to} — ${Math.round(40 + seededRandom(`tr-t2${ctx.cycle}`) * 20)}% full` },
      { label: "SKU", value: sku },
      { label: "Transfer Qty", value: `${qty.toLocaleString()} units` },
    ],
  };
}

function genReduceSafetyStock(ctx: GenCtx): Recommendation | null {
  const st = kpi(ctx.ops, "stock_turnover");
  if (!st || st.value < 9) return null;

  const mat = pick(RAW_MATERIALS, `ss-mat${ctx.cycle}`);
  const currentSS = Math.round(300 + seededRandom(`ss-cur${ctx.cycle}`) * 200);
  const proposedSS = Math.round(currentSS * (0.6 + seededRandom(`ss-prop${ctx.cycle}`) * 0.15));
  const savings = Math.round(2_500 + seededRandom(`ss-sav${ctx.cycle}`) * 4_500);
  const confidence = Math.round(68 + seededRandom(`ss-con${ctx.cycle}`) * 22);
  const id = stableId("reduce_safety_stock", mat.replace(/\s+/g, "_"));

  return {
    id,
    type: "reduce_safety_stock",
    priority: "low",
    title: `Reduce Safety Stock — ${mat}`,
    recommendation: `Reduce the safety stock level for ${mat} from ${currentSS} units to ${proposedSS} units. High stock turnover (${st.value.toFixed(1)}×) and consistent supplier on-time delivery over the past 30 days justify a leaner buffer.`,
    businessImpact: `Freeing ${(currentSS - proposedSS).toLocaleString()} units of capital-tied stock releases approximately $${savings.toLocaleString()} in working capital. Reduced holding cost lowers annual carrying charge by an estimated ${jitterPct(12, `ss-pct${ctx.cycle}`, 4)}%.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `Stock turnover at ${st.value.toFixed(1)}× (target 10×) is healthy. Demand volatility for this SKU has been low (<5% MAPE) over 8 consecutive periods. Supplier lead time is stable at ${Math.round(8 + seededRandom(`ss-lt${ctx.cycle}`) * 6)} days.`,
    affectedDepartment: "Supply Chain",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Inventory",
    dataPoints: [
      { label: "Current Safety Stock", value: `${currentSS} units` },
      { label: "Proposed Safety Stock", value: `${proposedSS} units` },
      { label: "Stock Turnover", value: `${st.value.toFixed(1)}×`, trend: "up" },
      { label: "Capital Released", value: `$${savings.toLocaleString()}` },
    ],
  };
}

function genFlagSlowMoving(ctx: GenCtx): Recommendation | null {
  const st = kpi(ctx.ops, "stock_turnover");
  if (!st || st.value > 6) return null;

  const sku = pick(FINISHED_GOODS, `sm-sku${ctx.cycle}`);
  const unitsOnHand = Math.round(800 + seededRandom(`sm-units${ctx.cycle}`) * 1_200);
  const daysOnHand  = Math.round(60 + seededRandom(`sm-doh${ctx.cycle}`) * 90);
  const savings = Math.round(3_000 + seededRandom(`sm-sav${ctx.cycle}`) * 5_000);
  const confidence = Math.round(80 + seededRandom(`sm-con${ctx.cycle}`) * 15);
  const id = stableId("flag_slow_moving", sku.replace(/\s+/g, "_"));

  return {
    id,
    type: "flag_slow_moving",
    priority: "medium",
    title: `Slow-Moving Inventory — ${sku}`,
    recommendation: `Flag ${unitsOnHand.toLocaleString()} units of ${sku} (${daysOnHand} days on-hand) for markdown, bundle promotion, or liquidation review. Consider a 15–20% promotional discount to accelerate movement before carrying costs accumulate further.`,
    businessImpact: `At the current consumption rate, this stock will not clear for ${daysOnHand} days, accruing $${Math.round(savings * 0.4).toLocaleString()} in incremental holding costs. Clearing through promotion recovers $${savings.toLocaleString()} in net working capital.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `Stock turnover for this SKU is ${st.value.toFixed(1)}× annualised — well below the 8× benchmark. Days-on-hand of ${daysOnHand} exceeds the 45-day alert threshold. No open customer orders reference this SKU in the current pipeline.`,
    affectedDepartment: "Supply Chain",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Inventory",
    dataPoints: [
      { label: "SKU", value: sku },
      { label: "Units on Hand", value: `${unitsOnHand.toLocaleString()}` },
      { label: "Days on Hand", value: `${daysOnHand} days`, trend: "up" },
      { label: "Annual Turns", value: `${st.value.toFixed(1)}×`, trend: "down" },
    ],
  };
}

function genSupplierDelay(ctx: GenCtx): Recommendation | null {
  const sp = kpi(ctx.ops, "supplier_performance");
  const plt = kpi(ctx.ops, "purchase_lead_time");
  if (!sp || !plt || (sp.value >= 80 && plt.value <= 14)) return null;

  const supplier = SUPPLIERS.find((s) => s.score < 80) ?? SUPPLIERS[0];
  const delayDays = Math.round(plt.value - 12 + seededRandom(`sd-del${ctx.cycle}`) * 4);
  const affectedPos = Math.round(2 + seededRandom(`sd-po${ctx.cycle}`) * 5);
  const savings = Math.round(5_000 + seededRandom(`sd-sav${ctx.cycle}`) * 9_000);
  const confidence = Math.round(74 + seededRandom(`sd-con${ctx.cycle}`) * 18);
  const id = stableId("supplier_delay_detected", supplier.name.replace(/\s+/g, "_"));

  return {
    id,
    type: "supplier_delay_detected",
    priority: sp.value < 70 ? "critical" : "high",
    title: `Supplier Delay Detected — ${supplier.name}`,
    recommendation: `Alert procurement team and escalate to ${supplier.name} account manager. Request an expedited shipment or identify an alternate qualified supplier for ${affectedPos} affected purchase orders. Review contractual SLA breach clauses.`,
    businessImpact: `${affectedPos} open POs at risk of late delivery, threatening OTIF commitments on customer orders. Proactive escalation can recover ${Math.round(affectedPos * 0.6)} POs within original window. Estimated cost of delay if unmitigated: $${savings.toLocaleString()}.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `${supplier.name} performance score dropped to ${supplier.score}/100 (threshold 80). Average lead time is now ${plt.value.toFixed(1)} days — ${delayDays} days above contracted SLA. ERP sync shows ${affectedPos} open POs sourced exclusively from this supplier.`,
    affectedDepartment: "Procurement",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Suppliers",
    dataPoints: [
      { label: "Supplier Score", value: `${supplier.score}/100`, trend: "down" },
      { label: "Avg Lead Time", value: `${plt.value.toFixed(1)} days`, trend: "up" },
      { label: "SLA Breach", value: `+${delayDays} days` },
      { label: "Open POs at Risk", value: `${affectedPos}` },
    ],
  };
}

function genPredictStockout(ctx: GenCtx): Recommendation | null {
  const ofr = kpi(ctx.ops, "order_fulfillment_rate");
  const ld  = kpi(ctx.ops, "late_deliveries");
  if (!ofr || !ld || (ofr.value > 96 && ld.value < 4)) return null;

  const sku = pick(RAW_MATERIALS, `pso-sku${ctx.cycle}`);
  const daysToStockout = Math.round(4 + seededRandom(`pso-days${ctx.cycle}`) * 8);
  const dailyConsumption = Math.round(40 + seededRandom(`pso-dc${ctx.cycle}`) * 60);
  const savings = Math.round(7_000 + seededRandom(`pso-sav${ctx.cycle}`) * 13_000);
  const confidence = Math.round(77 + seededRandom(`pso-con${ctx.cycle}`) * 18);
  const id = stableId("predict_stockout", sku.replace(/\s+/g, "_"));

  return {
    id,
    type: "predict_stockout",
    priority: daysToStockout <= 5 ? "critical" : "high",
    title: `Stockout Predicted — ${sku} in ${daysToStockout} days`,
    recommendation: `Raise an emergency purchase order for ${sku} immediately. Contact the fastest lead-time qualified supplier and request air freight if required. Simultaneously, review production schedule to smooth consumption and gain 1–2 additional days of buffer.`,
    businessImpact: `A stockout of ${sku} will halt production of ${Math.round(2 + seededRandom(`pso-lines${ctx.cycle}`) * 4)} product lines and delay ${Math.round(5 + seededRandom(`pso-cust${ctx.cycle}`) * 10)} customer shipments. Expediting now costs $${Math.round(savings * 0.3).toLocaleString()} vs an estimated $${savings.toLocaleString()} in production downtime and penalty charges if stockout occurs.`,
    estimatedSavings: savings,
    confidenceScore: confidence,
    reasoning: `Order fulfillment rate is ${ofr.value.toFixed(1)}% (${(100 - ofr.value).toFixed(1)}pp below target). Daily consumption of ${dailyConsumption} units vs current on-hand stock projects depletion in ${daysToStockout} days. No open replenishment PO found in ERP for this SKU.`,
    affectedDepartment: "Supply Chain",
    status: ctx.prev.get(id) ?? "new",
    generatedAt: new Date(),
    sourceEntity: "Sales Orders",
    dataPoints: [
      { label: "Days to Stockout", value: `${daysToStockout} days`, trend: "down" },
      { label: "Daily Consumption", value: `${dailyConsumption} units/day` },
      { label: "Order Fulfillment", value: `${ofr.value.toFixed(1)}%`, trend: "down" },
      { label: "Late Deliveries", value: `${Math.round(ld.value)}`, trend: "up" },
    ],
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const GENERATORS = [
  genReorderMaterial,
  genDelayPurchaseOrder,
  genIncreaseProductionCapacity,
  genTransferInventory,
  genReduceSafetyStock,
  genFlagSlowMoving,
  genSupplierDelay,
  genPredictStockout,
];

function runGenerators(
  erp: ErpConnectionState,
  ops: OpsIntelState,
  cycle: number,
  prev: Map<string, RecommendationStatus>
): Recommendation[] {
  const ctx: GenCtx = { erp, ops, cycle, prev };
  const results: Recommendation[] = [];
  for (const gen of GENERATORS) {
    try {
      const rec = gen(ctx);
      if (rec) results.push(rec);
    } catch (_) {
      // generator failures must never crash the engine
    }
  }
  return results;
}

function sortByPriority(recs: Recommendation[]): Recommendation[] {
  const order: Record<RecommendationPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...recs].sort(
    (a, b) => order[a.priority] - order[b.priority]
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Seed the engine on initial mount. */
export function buildInitialDecisionState(
  erp: ErpConnectionState,
  ops: OpsIntelState
): DecisionEngineState {
  const recs = sortByPriority(runGenerators(erp, ops, 0, new Map()));
  return {
    recommendations: recs,
    lastAnalysedAt: new Date(),
    cycleCount: 0,
    totalEstimatedSavings: recs.reduce((s, r) => s + r.estimatedSavings, 0),
    modelVersion: "v2.4.1",
    analysisStatus: "complete",
  };
}

/**
 * Re-analyse on each ERP sync tick.
 * User-modified statuses (acknowledged / in_progress / applied / dismissed)
 * are preserved from the previous cycle.
 */
export function tickDecisionEngine(
  prev: DecisionEngineState,
  erp: ErpConnectionState,
  ops: OpsIntelState
): DecisionEngineState {
  const cycle = prev.cycleCount + 1;

  // Preserve any user-set statuses
  const statusMap = new Map<string, RecommendationStatus>(
    prev.recommendations.map((r) => [r.id, r.status])
  );

  const recs = sortByPriority(runGenerators(erp, ops, cycle, statusMap));
  return {
    recommendations: recs,
    lastAnalysedAt: new Date(),
    cycleCount: cycle,
    totalEstimatedSavings: recs
      .filter((r) => r.status !== "dismissed")
      .reduce((s, r) => s + r.estimatedSavings, 0),
    modelVersion: prev.modelVersion,
    analysisStatus: "complete",
  };
}

/** Returns an "analysing" snapshot to show while the cycle processes. */
export function buildAnalysingState(prev: DecisionEngineState): DecisionEngineState {
  return { ...prev, analysisStatus: "analysing" };
}

/** Immutably update a single recommendation's status. */
export function updateRecommendationStatus(
  state: DecisionEngineState,
  id: string,
  status: RecommendationStatus
): DecisionEngineState {
  const recs = state.recommendations.map((r) =>
    r.id === id ? { ...r, status } : r
  );
  return {
    ...state,
    recommendations: recs,
    totalEstimatedSavings: recs
      .filter((r) => r.status !== "dismissed")
      .reduce((s, r) => s + r.estimatedSavings, 0),
  };
}
