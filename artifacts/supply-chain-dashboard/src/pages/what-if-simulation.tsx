import React, { useState } from "react";
import { 
  PlayCircle, Activity, Box, Truck, BarChart3, AlertTriangle, 
  ArrowRight, ShieldAlert, Zap, Factory, CheckCircle2, TrendingUp, TrendingDown, Clock, Brain
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { runSimulation, SimulationResult, ScenarioType } from "@/lib/simulation-engine";
import { StrategyComparisonTable } from "@/components/simulations/StrategyComparisonTable";

export default function WhatIfSimulationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  
  const [scenarioType, setScenarioType] = useState<ScenarioType>("SUPPLIER_DELAY");
  const [delayDays, setDelayDays] = useState(14);
  const [increasePct, setIncreasePct] = useState(35);

  const handleRun = () => {
    setIsRunning(true);
    setResult(null);
    
    // Simulate thinking delay to "Build Digital Twin"
    setTimeout(() => {
      const res = runSimulation({
        id: "sim-" + Date.now(),
        type: scenarioType,
        title: scenarioType.replace("_", " "),
        description: "Custom Scenario",
        parameters: { delayDays, increasePct }
      }, {});
      setResult(res);
      setIsRunning(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <PlayCircle className="w-6 h-6 text-primary" />
            Enterprise What-If Simulation
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Virtual Digital Twin Environment (ERP Unmodified)</p>
        </div>
      </header>

      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Column: Scenario Builder */}
        <div className="xl:col-span-3 space-y-6">
          <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-500" />
              Scenario Builder
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Scenario Type</label>
                <select 
                  className="w-full bg-muted border-none rounded-md text-sm p-2 outline-none focus:ring-1 focus:ring-primary transition-all"
                  value={scenarioType}
                  onChange={(e) => setScenarioType(e.target.value as ScenarioType)}
                >
                  <option value="SUPPLIER_DELAY">Supplier Delay</option>
                  <option value="DEMAND_INCREASE">Demand Spike</option>
                  <option value="WAREHOUSE_CLOSURE">Warehouse Closure</option>
                </select>
              </div>

              {scenarioType === "SUPPLIER_DELAY" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-semibold text-foreground">Delay Days: {delayDays}</label>
                  <input 
                    type="range" min="1" max="60" 
                    value={delayDays} onChange={(e) => setDelayDays(parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              )}

              {scenarioType === "DEMAND_INCREASE" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-semibold text-foreground">Volume Increase: {increasePct}%</label>
                  <input 
                    type="range" min="10" max="200" step="5"
                    value={increasePct} onChange={(e) => setIncreasePct(parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              )}

              <button 
                onClick={handleRun}
                disabled={isRunning}
                className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isRunning ? (
                  <span className="animate-pulse">Building Digital Twin...</span>
                ) : (
                  <>
                    <PlayCircle className="w-5 h-5" /> Run Simulation
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-5 text-sm text-muted-foreground flex flex-col gap-3">
            <p className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>All simulations run locally in a volatile sandbox.</span>
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>Production ERP data remains entirely unmodified.</span>
            </p>
          </div>
        </div>

        {/* Middle & Right Column: Results */}
        <div className="xl:col-span-9 space-y-6">
          {!result && !isRunning && (
            <div className="h-full min-h-[400px] border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium">Configure and run a scenario to see cascading impacts.</p>
            </div>
          )}

          {isRunning && (
            <div className="h-full min-h-[400px] border border-border/50 rounded-2xl flex flex-col items-center justify-center bg-card shadow-sm animate-pulse">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="font-semibold text-foreground">Calculating Cascade Impacts...</p>
              <p className="text-xs text-muted-foreground mt-2">Evaluating cross-functional risks</p>
            </div>
          )}

          {result && !isRunning && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 pb-12">
              
              {/* Executive Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Executive Summary</h3>
                  <p className="text-lg leading-relaxed font-medium text-foreground">{result.executiveSummary}</p>
                </div>
                <div className={cn(
                  "border rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center",
                  result.financialImpact < 0 ? "bg-destructive/10 border-destructive/20" : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Financial Impact</p>
                  <p className={cn(
                    "text-4xl font-extrabold tracking-tighter",
                    result.financialImpact < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {result.financialImpact < 0 ? "-" : "+"}${Math.abs(result.financialImpact).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* KPI Impacts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {result.kpis.map((kpi, idx) => (
                  <div key={idx} className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{kpi.label}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold line-through opacity-50">{kpi.before}{kpi.unit}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <span className={cn(
                          "text-3xl font-black",
                          kpi.isPositive ? "text-emerald-500" : "text-destructive"
                        )}>{kpi.after}{kpi.unit}</span>
                      </div>
                      {kpi.trend === "up" ? <TrendingUp className="w-6 h-6 opacity-20" /> : <TrendingDown className="w-6 h-6 opacity-20" />}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Mitigations */}
              <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm flex flex-col">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                  <Brain className="w-4 h-4" /> AI Mitigation Strategies
                </h3>
                <StrategyComparisonTable options={result.options} />
              </div>

              {/* Timeline */}
              <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm h-[400px] flex flex-col">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Cascade Timeline Replay
                </h3>
                <div className="flex-1 overflow-y-auto pr-4 space-y-6 relative">
                  <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border/50 z-0" />
                  {result.timeline.map((event, i) => (
                    <div key={i} className="relative z-10 flex gap-4 animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${i * 150}ms`, animationFillMode: "both" }}>
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 border-background",
                        event.impact === "critical" ? "bg-destructive text-white" :
                        event.impact === "high" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        <div className="w-2 h-2 rounded-full bg-current" />
                      </div>
                      <div className="pt-0.5 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-foreground uppercase tracking-widest">Day {event.day}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{event.department}</Badge>
                        </div>
                        <p className="text-sm font-bold text-foreground">{event.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
