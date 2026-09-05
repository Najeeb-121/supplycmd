import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Variable = { symbol: string; name: string; unit?: string };

type EquationDef = {
  id: string;
  title: string;
  description: string;
  formulaRender: React.ReactNode;
  variables: Variable[];
  exampleSteps: React.ReactNode;
  calcParams: { key: string; label: string; defaultValue: number; step?: string }[];
  calculate: (values: Record<string, number>) => number | string;
  resultLabel: string;
  formatResult: (val: number | string) => string;
};

const equations: Record<string, EquationDef[]> = {
  inventory: [
    {
      id: "eoq",
      title: "Economic Order Quantity (EOQ)",
      description: "Determines the optimal order quantity that minimizes total inventory holding costs and ordering costs.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">EOQ</span>
          <span>=</span>
          <span className="flex items-center gap-1">
            <span className="text-3xl font-light">√</span>
            <span className="flex flex-col items-center">
              <span className="border-b border-primary pb-1 px-2 mb-1">2 × D × S</span>
              <span className="px-2">H</span>
            </span>
          </span>
        </div>
      ),
      variables: [
        { symbol: "D", name: "Annual Demand", unit: "units" },
        { symbol: "S", name: "Ordering Cost per order", unit: "currency/order" },
        { symbol: "H", name: "Holding Cost per unit per year", unit: "currency/unit/year" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: D = 10,000, S = 50, H = 2</div>
          <div>EOQ = √(2 × 10,000 × 50 / 2)</div>
          <div>EOQ = √(1,000,000 / 2)</div>
          <div>EOQ = √500,000 = 707.11 units</div>
        </div>
      ),
      calcParams: [
        { key: "d", label: "Annual Demand (D)", defaultValue: 10000 },
        { key: "s", label: "Ordering Cost (S)", defaultValue: 50 },
        { key: "h", label: "Holding Cost (H)", defaultValue: 2, step: "0.1" },
      ],
      calculate: (v) => Math.sqrt((2 * v.d * v.s) / (v.h || 1)),
      resultLabel: "Optimal Order Qty",
      formatResult: (v) => `${Number(v).toFixed(2)} units`
    },
    {
      id: "rop",
      title: "Reorder Point (ROP)",
      description: "The inventory level at which a new order should be placed to avoid a stockout.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">ROP</span>
          <span>=</span>
          <span>(d × L) + SS</span>
        </div>
      ),
      variables: [
        { symbol: "d", name: "Average Daily Demand", unit: "units/day" },
        { symbol: "L", name: "Lead Time", unit: "days" },
        { symbol: "SS", name: "Safety Stock", unit: "units" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: d = 50, L = 7, SS = 100</div>
          <div>ROP = (50 × 7) + 100</div>
          <div>ROP = 350 + 100 = 450 units</div>
        </div>
      ),
      calcParams: [
        { key: "d", label: "Daily Demand (d)", defaultValue: 50 },
        { key: "l", label: "Lead Time (L)", defaultValue: 7 },
        { key: "ss", label: "Safety Stock (SS)", defaultValue: 100 },
      ],
      calculate: (v) => (v.d * v.l) + v.ss,
      resultLabel: "Reorder Point",
      formatResult: (v) => `${Number(v).toFixed(0)} units`
    },
    {
      id: "inventory_turnover",
      title: "Inventory Turnover Ratio",
      description: "Measures how many times inventory is sold and replaced over a period.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">ITR</span>
          <span>=</span>
          <span className="flex flex-col items-center">
            <span className="border-b border-primary pb-1 px-2 mb-1">COGS</span>
            <span className="px-2">Average Inventory</span>
          </span>
        </div>
      ),
      variables: [
        { symbol: "COGS", name: "Cost of Goods Sold", unit: "currency" },
        { symbol: "Average Inventory", name: "(Beginning + Ending) / 2", unit: "currency" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: COGS = 500k, Avg Inv = 100k</div>
          <div>ITR = 500,000 / 100,000</div>
          <div>ITR = 5.0 times</div>
        </div>
      ),
      calcParams: [
        { key: "cogs", label: "COGS", defaultValue: 500000 },
        { key: "avg", label: "Avg Inventory", defaultValue: 100000 },
      ],
      calculate: (v) => v.cogs / (v.avg || 1),
      resultLabel: "Turnover Ratio",
      formatResult: (v) => `${Number(v).toFixed(1)} turns/period`
    }
  ],
  production: [
    {
      id: "oee",
      title: "Overall Equipment Effectiveness (OEE)",
      description: "The gold standard for measuring manufacturing productivity.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">OEE</span>
          <span>=</span>
          <span>A × P × Q</span>
        </div>
      ),
      variables: [
        { symbol: "A", name: "Availability ((Actual Time - Downtime) / Planned Time)", unit: "%" },
        { symbol: "P", name: "Performance (Actual Units / Planned Units)", unit: "%" },
        { symbol: "Q", name: "Quality ((Actual Units - Defects) / Actual Units)", unit: "%" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: A = 90%, P = 95%, Q = 99%</div>
          <div>OEE = 0.90 × 0.95 × 0.99</div>
          <div>OEE = 0.84645 = 84.6%</div>
        </div>
      ),
      calcParams: [
        { key: "a", label: "Availability (%)", defaultValue: 90, step: "0.1" },
        { key: "p", label: "Performance (%)", defaultValue: 95, step: "0.1" },
        { key: "q", label: "Quality (%)", defaultValue: 99, step: "0.1" },
      ],
      calculate: (v) => ((v.a / 100) * (v.p / 100) * (v.q / 100)) * 100,
      resultLabel: "OEE Score",
      formatResult: (v) => `${Number(v).toFixed(2)}%`
    },
    {
      id: "takt",
      title: "Planned Production Pace",
      description: "SupplyCMD's planned production pace, calculated from planned production time and planned units.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">Pace</span>
          <span>=</span>
          <span className="flex flex-col items-center">
            <span className="border-b border-primary pb-1 px-2 mb-1">Planned Production Time</span>
            <span className="px-2">Planned Units</span>
          </span>
        </div>
      ),
      variables: [
        { symbol: "Time", name: "Planned production time", unit: "minutes" },
        { symbol: "Units", name: "Planned production units", unit: "units" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: Planned Time = 420 mins, Planned Units = 840</div>
          <div>Planned Pace = (420 × 60 sec) / 840</div>
          <div>Planned Pace = 25,200 / 840 = 30 seconds/unit</div>
        </div>
      ),
      calcParams: [
        { key: "time", label: "Planned Time (mins)", defaultValue: 420 },
        { key: "units", label: "Planned Units", defaultValue: 840 },
      ],
      calculate: (v) => (v.time * 60) / (v.units || 1),
      resultLabel: "Planned Production Pace",
      formatResult: (v) => `${Number(v).toFixed(1)} seconds/unit`
    }
  ],
  demand: [
    {
      id: "mape",
      title: "Mean Absolute Percentage Error (MAPE)",
      description: "Measures the accuracy of a forecasting method in statistics.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">MAPE</span>
          <span>=</span>
          <span className="flex items-center gap-2">
            <span className="flex flex-col items-center">
              <span className="border-b border-primary pb-1 mb-1">1</span>
              <span>n</span>
            </span>
            <span>∑</span>
            <span className="flex flex-col items-center">
              <span className="border-b border-primary pb-1 px-2 mb-1">| A - F |</span>
              <span className="px-2">A</span>
            </span>
          </span>
        </div>
      ),
      variables: [
        { symbol: "n", name: "Number of periods", unit: "count" },
        { symbol: "A", name: "Actual Demand", unit: "units" },
        { symbol: "F", name: "Forecasted Demand", unit: "units" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Period 1: A=100, F=110 → Error = |100-110|/100 = 10%</div>
          <div>Period 2: A=120, F=115 → Error = |120-115|/120 = 4.1%</div>
          <div>MAPE = (10% + 4.1%) / 2 = 7.05%</div>
        </div>
      ),
      calcParams: [
        { key: "a", label: "Actual Demand (A)", defaultValue: 120 },
        { key: "f", label: "Forecasted (F)", defaultValue: 115 },
      ],
      calculate: (v) => (Math.abs(v.a - v.f) / (v.a || 1)) * 100,
      resultLabel: "Error % (1 Period)",
      formatResult: (v) => `${Number(v).toFixed(2)}%`
    }
  ],
  logistics: [
    {
      id: "fillrate",
      title: "Order Fill Rate (Reference)",
      description: "Reference order-fill formula. SupplyCMD's Logistics dashboard currently displays supplier-reported fill rate when available.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">Fill Rate</span>
          <span>=</span>
          <span className="flex flex-col items-center">
            <span className="border-b border-primary pb-1 px-2 mb-1">Orders Shipped Complete</span>
            <span className="px-2">Total Orders Placed</span>
          </span>
        </div>
      ),
      variables: [
        { symbol: "Shipped", name: "Orders shipped without backorder", unit: "orders" },
        { symbol: "Total", name: "Total orders placed", unit: "orders" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: Total = 5,000, Shipped Complete = 4,850</div>
          <div>Fill Rate = 4,850 / 5,000</div>
          <div>Fill Rate = 0.97 = 97%</div>
        </div>
      ),
      calcParams: [
        { key: "shipped", label: "Shipped Complete", defaultValue: 4850 },
        { key: "total", label: "Total Orders", defaultValue: 5000 },
      ],
      calculate: (v) => (v.shipped / (v.total || 1)) * 100,
      resultLabel: "Fill Rate",
      formatResult: (v) => `${Number(v).toFixed(1)}%`
    }
  ],
  lean: [
    {
      id: "littles",
      title: "Little's Law",
      description: "The long-term average number of items in a stationary system is equal to the long-term average effective arrival rate multiplied by the average time that an item spends in the system.",
      formulaRender: (
        <div className="font-mono text-xl flex items-center gap-3 py-4 text-primary">
          <span className="font-bold">WIP</span>
          <span>=</span>
          <span>TH × CT</span>
        </div>
      ),
      variables: [
        { symbol: "WIP", name: "Work In Process", unit: "units" },
        { symbol: "TH", name: "Throughput (Arrival Rate)", unit: "units/time" },
        { symbol: "CT", name: "Cycle Time", unit: "time" },
      ],
      exampleSteps: (
        <div className="text-sm space-y-1 font-mono text-muted-foreground bg-muted/30 p-3 rounded">
          <div>Given: Throughput = 10 units/hr, Cycle Time = 4 hours</div>
          <div>WIP = 10 × 4</div>
          <div>WIP = 40 units currently in process</div>
        </div>
      ),
      calcParams: [
        { key: "th", label: "Throughput (units/hr)", defaultValue: 10 },
        { key: "ct", label: "Cycle Time (hours)", defaultValue: 4 },
      ],
      calculate: (v) => v.th * v.ct,
      resultLabel: "WIP Level",
      formatResult: (v) => `${Number(v).toFixed(0)} units`
    }
  ]
};

function EquationCard({ def }: { def: EquationDef }) {
  const [vals, setVals] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    def.calcParams.forEach(p => init[p.key] = p.defaultValue);
    return init;
  });

  const handleChange = (key: string, val: string) => {
    setVals(prev => ({ ...prev, [key]: Number(val) }));
  };

  const result = def.calculate(vals);

  return (
    <Card className="border-border shadow-sm flex flex-col">
      <CardHeader className="bg-muted/10 border-b border-border pb-4">
        <CardTitle className="text-xl text-foreground">{def.title}</CardTitle>
        <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {def.description}
        </div>
      </CardHeader>
      <CardContent className="p-6 flex-1 flex flex-col gap-6">
        {/* Formula */}
        <div className="flex justify-center bg-card border border-border rounded-lg shadow-sm">
          {def.formulaRender}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
          {/* Legend & Example */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Variables Legend</h4>
              <ul className="space-y-1.5 text-sm">
                {def.variables.map(v => (
                  <li key={v.symbol} className="flex items-start gap-2">
                    <span className="font-mono font-bold text-foreground w-8 shrink-0">{v.symbol}</span>
                    <span className="text-muted-foreground">
                      {v.name} <span className="text-xs text-muted-foreground/60 ml-1">({v.unit})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Worked Example</h4>
              {def.exampleSteps}
            </div>
          </div>

          {/* Calculator */}
          <div className="bg-muted/20 border border-border rounded-lg p-4 flex flex-col">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent"></div>
              Live Calculator
            </h4>

            <div className="space-y-3 flex-1">
              {def.calcParams.map(param => (
                <div key={param.key} className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-mono">{param.label}</Label>
                  <Input
                    type="number"
                    step={param.step || "1"}
                    value={vals[param.key]}
                    onChange={(e) => handleChange(param.key, e.target.value)}
                    className="h-8 font-mono"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground uppercase tracking-wider">
                {def.resultLabel}
              </span>
              <span className="text-lg font-mono font-bold text-accent">
                {def.formatResult(result)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EquationsPage() {
  return (
    <div className="p-8 space-y-8 min-h-[100dvh]">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight">Equations Reference Library</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          The mathematical foundation of operations management. Interactive formulas with real-time computation.
        </p>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="bg-muted/50 border border-border w-full justify-start h-12 rounded-lg p-1 overflow-x-auto">
          <TabsTrigger value="inventory" className="data-[state=active]:bg-card rounded-md">Inventory</TabsTrigger>
          <TabsTrigger value="production" className="data-[state=active]:bg-card rounded-md">Production</TabsTrigger>
          <TabsTrigger value="demand" className="data-[state=active]:bg-card rounded-md">Demand Planning</TabsTrigger>
          <TabsTrigger value="logistics" className="data-[state=active]:bg-card rounded-md">Logistics</TabsTrigger>
          <TabsTrigger value="lean" className="data-[state=active]:bg-card rounded-md">Lean Manufacturing</TabsTrigger>
        </TabsList>

        {Object.entries(equations).map(([category, eqList]) => (
          <TabsContent key={category} value={category} className="mt-6 focus-visible:outline-none">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {eqList.map(eq => (
                <EquationCard key={eq.id} def={eq} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
