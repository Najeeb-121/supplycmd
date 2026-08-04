export type ScenarioType = "SUPPLIER_DELAY" | "DEMAND_INCREASE" | "WAREHOUSE_CLOSURE";

export interface SimulationParameters {
  delayDays?: number;
  increasePct?: number;
  closureDays?: number;
}

export interface ScenarioDef {
  id: string;
  type: ScenarioType;
  title: string;
  description: string;
  parameters: SimulationParameters;
}

export interface KpiImpact {
  label: string;
  before: number;
  after: number;
  unit: string;
  trend: "up" | "down" | "flat";
  isPositive: boolean;
}

export interface TimelineEvent {
  day: number;
  title: string;
  description: string;
  impact: "low" | "medium" | "high" | "critical";
  department: string;
}

export interface ScoreBreakdown {
  serviceLevel: number;
  financial: number;
  speed: number;
  operationalRisk: number;
  resourceAvailability: number;
}

export interface MitigationOption {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  revenueAtRisk: number;
  additionalCost: number;
  otif: number;
  recoveryTimeDays: number;
  operationalRisk: "low" | "medium" | "high" | "critical";
  workingCapitalImpact: number;
  customerImpact: "low" | "medium" | "high" | "critical";
  aiScore?: number;
  confidenceLevel?: "High" | "Medium" | "Low";
  isRecommended?: boolean;
  scoreBreakdown?: ScoreBreakdown;
  recommendationReason?: string;
  reasoningChain?: string[];
}

export interface SimulationResult {
  scenario: ScenarioDef;
  kpis: KpiImpact[];
  timeline: TimelineEvent[];
  options: MitigationOption[];
  financialImpact: number;
  executiveSummary: string;
}

function calculateAIScores(options: MitigationOption[]): MitigationOption[] {
  return options.map(opt => {
    let serviceLevel = Math.max(10, Math.min(100, opt.otif));
    let financial = Math.max(10, Math.min(100, 100 - ((opt.revenueAtRisk + opt.additionalCost) / 5000)));
    let speed = Math.max(10, Math.min(100, 100 - (opt.recoveryTimeDays * 5)));
    let opRiskNum = opt.operationalRisk === "low" ? 90 : opt.operationalRisk === "medium" ? 70 : opt.operationalRisk === "high" ? 40 : 20;
    let resourceAvailability = 80;

    let totalScore = Math.round((serviceLevel * 0.3) + (financial * 0.3) + (speed * 0.2) + (opRiskNum * 0.1) + (resourceAvailability * 0.1));

    return {
      ...opt,
      aiScore: totalScore,
      confidenceLevel: (totalScore > 80 ? "High" : totalScore > 60 ? "Medium" : "Low") as "High" | "Medium" | "Low",
      scoreBreakdown: { serviceLevel: Math.round(serviceLevel), financial: Math.round(financial), speed: Math.round(speed), operationalRisk: Math.round(opRiskNum), resourceAvailability }
    };
  }).sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).map((opt, i) => ({
    ...opt,
    isRecommended: i === 0
  }));
}

export function runSimulation(scenario: ScenarioDef, currentData: any): SimulationResult {
  let kpis: KpiImpact[] = [];
  let timeline: TimelineEvent[] = [];
  let options: MitigationOption[] = [];
  let financialImpact = 0;
  let executiveSummary = "";

  if (scenario.type === "SUPPLIER_DELAY") {
    const delay = scenario.parameters.delayDays || 14;
    
    timeline.push({ day: 1, title: "Aluminium Coil Delay", description: `Supplier 'GlobalAlum' confirms a ${delay}-day delay on 300MT of 0.23mm Aluminium Coils.`, impact: "high", department: "Procurement" });
    timeline.push({ day: Math.floor(delay * 0.3), title: "Production Capacity Starved", description: `Can forming lines 3 and 4 halt due to raw material stockout.`, impact: "critical", department: "Production" });
    timeline.push({ day: Math.floor(delay * 0.6), title: "Finished Goods Depleted", description: `Buffer stock for 250ml Slim Cans falls below safety limits.`, impact: "high", department: "Warehouse" });
    timeline.push({ day: Math.floor(delay * 0.8), title: "FIRST POINT OF FAILURE", description: `Delivery constraints hit. Unable to fulfill 45% of Red Bull's scheduled call-offs.`, impact: "critical", department: "Logistics" });
    timeline.push({ day: delay, title: "Customer SLA Breached", description: `Red Bull and Pepsi OTIF drops below 95% threshold. Penalties activate.`, impact: "critical", department: "Finance" });

    financialImpact = -185000;
    
    kpis.push({ label: "Red Bull OTIF", before: 99.2, after: 84.5, unit: "%", trend: "down", isPositive: false });
    kpis.push({ label: "Line 3/4 OEE", before: 88, after: 62, unit: "%", trend: "down", isPositive: false });
    kpis.push({ label: "Revenue at Risk", before: 0, after: 185, unit: "k", trend: "up", isPositive: false });

    executiveSummary = `SCENARIO: GlobalAlum delays 300MT of 0.23mm Aluminium Coils by ${delay} days. BASELINE: Current coil stock is 120MT (6 days coverage). CASCADE: Stockout occurs on Day 4. Lines 3 & 4 halt. Red Bull 250ml slim can buffer depletes by Day 8. FIRST POINT OF FAILURE: Day 8 - Missed Red Bull call-offs. MAGNITUDE: 2.4M cans short, $185k revenue at risk, SLA penalties triggered.`;

    options = [
      {
        id: "opt1", title: "Spot Market Coil Purchase", description: "Buy 150MT of 0.23mm coils from secondary spot market at 40% premium.",
        pros: ["Prevents Red Bull stockout", "Maintains line OEE"], cons: ["Significant margin erosion", "Requires QA fast-track"],
        revenueAtRisk: 0, additionalCost: 65000, otif: 98.5, recoveryTimeDays: 2, operationalRisk: "medium", workingCapitalImpact: -65000, customerImpact: "low",
        recommendationReason: "Absorbing the $65k material premium is cheaper than the $185k SLA penalty and lost revenue from Red Bull.",
        reasoningChain: [
          "Identified 150MT of compatible coils available via spot broker in Rotterdam (Procurement).",
          "Calculated margin impact: COGS increases 40%, but preserves $185k in top-line revenue (Finance).",
          "Logistics confirms 48-hour expedited delivery to forming lines (Speed).",
          "Averts the primary failure point on Day 8, preserving Red Bull relationship."
        ]
      },
      {
        id: "opt2", title: "Reallocate Pepsi Coil Stock", description: "Divert standard coil stock from Pepsi 330ml lines to Red Bull 250ml lines.",
        pros: ["No immediate cash outlay", "Uses on-hand inventory"], cons: ["Requires re-tooling lines", "Shifts risk to Pepsi"],
        revenueAtRisk: 85000, additionalCost: 15000, otif: 92.0, recoveryTimeDays: 4, operationalRisk: "high", workingCapitalImpact: 0, customerImpact: "high",
        recommendationReason: "Robbing Peter to pay Paul. Averts Red Bull crisis but triggers a Pepsi shortage and requires costly line re-tooling.",
        reasoningChain: [
          "Identified 200MT of 0.25mm coil reserved for Pepsi standard cans (Warehouse).",
          "Engineering confirms feasibility of running 0.25mm on slim can lines with 24hr re-tooling (Production).",
          "Red Bull SLA preserved, but creates a new stockout for Pepsi by Day 12 (Cascade Effect).",
          "High operational risk due to non-standard material usage and dual-customer impact."
        ]
      }
    ];
  }

  else if (scenario.type === "DEMAND_INCREASE") {
    const increasePct = scenario.parameters.increasePct || 35;
    
    timeline.push({ day: 1, title: "Unforecasted Demand Spike", description: `Coca-Cola increases order for 330ml Standard Cans by ${increasePct}% for upcoming summer promo.`, impact: "high", department: "Sales" });
    timeline.push({ day: 2, title: "Inventory Depletion", description: `Finished goods buffer for Coca-Cola drops to 0.`, impact: "high", department: "Warehouse" });
    timeline.push({ day: 3, title: "FIRST POINT OF FAILURE", description: `Production lines maxed out. Cannot meet ${increasePct}% upside without dropping Seven Up runs.`, impact: "critical", department: "Production" });
    timeline.push({ day: 5, title: "Material Shortage", description: `Pull-forward of Aluminium Coils exhausts procurement safety stock early.`, impact: "medium", department: "Procurement" });

    financialImpact = 320000;
    
    kpis.push({ label: "Coca-Cola OTIF", before: 98.0, after: 72.1, unit: "%", trend: "down", isPositive: false });
    kpis.push({ label: "Line Utilization", before: 85, after: 100, unit: "%", trend: "up", isPositive: true });
    kpis.push({ label: "Upside Revenue", before: 0, after: 320, unit: "k", trend: "up", isPositive: true });

    executiveSummary = `SCENARIO: Coca-Cola increases 330ml can orders by ${increasePct}%. BASELINE: Current line utilization is 85%, leaving insufficient buffer. CASCADE: Finished goods deplete in 48 hrs. Lines hit 100% capacity. FIRST POINT OF FAILURE: Day 3 - Machine capacity ceiling reached; Seven Up orders at risk of preemption. MAGNITUDE: $320k upside revenue available, but 1.2M cans short on capacity.`;

    options = [
      {
        id: "opt1", title: "Activate Weekend Overtime", description: "Add Saturday/Sunday shifts to Lines 1 and 2 to absorb Coca-Cola volume.",
        pros: ["Captures all upside revenue", "No impact to Seven Up"], cons: ["High labor premium", "Maintenance window lost"],
        revenueAtRisk: 0, additionalCost: 45000, otif: 97.0, recoveryTimeDays: 2, operationalRisk: "medium", workingCapitalImpact: -45000, customerImpact: "low",
        recommendationReason: "Yields highest net profit ($275k) by capturing the demand spike using internal capacity, avoiding customer preemption.",
        reasoningChain: [
          "Calculated marginal revenue gained ($320k) vs marginal cost of weekend overtime ($45k) (Finance).",
          "Simulated raw material pull rates; confirmed adequate coil stock for extra runs (Warehouse).",
          "Avoids bumping Seven Up from the production schedule, preserving secondary SLAs (Production).",
          "Concluded this strategy secures 97% OTIF with acceptable medium operational risk."
        ]
      },
      {
        id: "opt2", title: "Preempt Seven Up Production", description: "Pause Seven Up 330ml runs to prioritize the Coca-Cola spike.",
        pros: ["Zero overtime costs", "Immediate capacity unlock"], cons: ["Breaches Seven Up SLA", "Damages customer trust"],
        revenueAtRisk: 120000, additionalCost: 0, otif: 85.0, recoveryTimeDays: 1, operationalRisk: "high", workingCapitalImpact: 0, customerImpact: "critical",
        recommendationReason: "Reallocates capacity but trades one stockout for another, resulting in severe penalties from Seven Up.",
        reasoningChain: [
          "Identified overlapping machine routing for Coca-Cola and Seven Up 330ml cans (Production).",
          "Diverted 100% of Line 2 capacity to Coca-Cola (Logistics).",
          "Avoids any labor premium (Finance).",
          "Creates immediate critical failure for Seven Up, risking $120k in penalties and lost future volume."
        ]
      }
    ];
  }

  else if (scenario.type === "WAREHOUSE_CLOSURE") {
    const closureDays = scenario.parameters.closureDays || 7;
    
    timeline.push({ day: 1, title: "DC Shutdown", description: `Primary Distribution Center goes offline due to regional power failure.`, impact: "critical", department: "Logistics" });
    timeline.push({ day: 1, title: "FIRST POINT OF FAILURE", description: `Outbound fulfillment to Mountain Dew and Pepsi drops to zero. 2.5M cans trapped.`, impact: "critical", department: "Warehouse" });
    timeline.push({ day: 2, title: "Inbound Bottleneck", description: `Forming lines back up as finished cans have nowhere to be stored.`, impact: "high", department: "Production" });
    timeline.push({ day: 3, title: "Line Stoppage", description: `Production lines forced to halt due to full output buffers.`, impact: "critical", department: "Production" });

    financialImpact = -450000;
    
    kpis.push({ label: "Network OTIF", before: 99.1, after: 42.1, unit: "%", trend: "down", isPositive: false });
    kpis.push({ label: "Lost Production", before: 0, after: 1.5, unit: "M", trend: "up", isPositive: false });
    kpis.push({ label: "Revenue at Risk", before: 0, after: 450, unit: "k", trend: "up", isPositive: false });

    executiveSummary = `SCENARIO: Primary DC offline for ${closureDays} days. BASELINE: DC handles 80% of regional outbound volume. CASCADE: Shipments halt immediately. Inbound cans from factory back up. FIRST POINT OF FAILURE: Day 1 - 2.5M cans trapped, missing Pepsi/Mountain Dew shipments. MAGNITUDE: Lines forced to halt by Day 3, $450k revenue at risk.`;

    options = [
      {
        id: "opt1", title: "Divert to Emergency 3PL", description: "Reroute factory output directly to third-party logistics cross-docks.",
        pros: ["Keeps production running", "Maintains partial fulfillment"], cons: ["High freight and handling premium", "Complex routing"],
        revenueAtRisk: 120000, additionalCost: 85000, otif: 78.0, recoveryTimeDays: 2, operationalRisk: "high", workingCapitalImpact: -85000, customerImpact: "medium",
        recommendationReason: "The only viable option to prevent a complete factory shutdown by relieving the finished goods bottleneck.",
        reasoningChain: [
          "Identified active 3PL cross-docks within a 50-mile radius of the factory (Logistics).",
          "Rerouted factory output directly to 3PL, bypassing the dead DC (Production).",
          "Salvages 78% of deliveries to Pepsi/Mountain Dew, avoiding catastrophic SLA breach (Speed).",
          "High premium cost ($85k) is justified to protect the $450k revenue at risk and prevent a factory hard-stop."
        ]
      }
    ];
  }

  // Calculate scores and sort options
  options = calculateAIScores(options);

  return {
    scenario,
    kpis,
    timeline,
    options,
    financialImpact,
    executiveSummary
  };
}
