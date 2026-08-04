import React, { useState, useEffect } from "react";
import { MitigationOption } from "@/lib/simulation-engine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Info, TrendingUp, TrendingDown, DollarSign, BrainCircuit, Clock, X } from "lucide-react";

interface StrategyComparisonTableProps {
  options: MitigationOption[];
}

export function StrategyComparisonTable({ options }: StrategyComparisonTableProps) {
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (expandedOptionId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [expandedOptionId]);

  if (!options || options.length === 0) return null;

  const winner = options.find(opt => opt.isRecommended) || options[0];
  const alternatives = options.filter(opt => opt.id !== winner.id);
  const expandedOpt = options.find(opt => opt.id === expandedOptionId);

  const getRiskColor = (risk: string) => {
    switch(risk) {
      case "low": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
      case "medium": return "bg-amber-500/10 text-amber-600 border-amber-500/30";
      case "high": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      case "critical": return "bg-destructive/10 text-destructive border-destructive/30";
      default: return "bg-muted text-foreground";
    }
  };

  const getCustomerImpactColor = (impact: string) => {
    switch(impact) {
      case "low": return "text-emerald-600";
      case "medium": return "text-amber-600";
      case "high": return "text-orange-600";
      case "critical": return "text-destructive";
      default: return "text-foreground";
    }
  };

  const getProgressColor = (value: number) => {
    if (value >= 80) return "bg-emerald-500";
    if (value >= 50) return "bg-amber-500";
    return "bg-destructive";
  };

  const MetricBox = ({ icon, label, value, valueClass }: any) => (
    <div className="bg-card border border-border/60 rounded-xl p-3 flex flex-col justify-center items-start shadow-sm hover:border-border transition-colors">
      <div className="flex items-center gap-1.5 mb-1 opacity-70">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <span className={cn("text-lg font-black", valueClass)}>{value}</span>
    </div>
  );

  return (
    <div className="w-full space-y-6 pb-6 relative">
      
      {/* ============================================================== */}
      {/* 1. HERO WINNER CARD */}
      {/* ============================================================== */}
      <div className="relative bg-background border border-primary/40 rounded-2xl shadow-[0_4px_20px_-5px_rgba(var(--primary),0.15)] overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/80 to-primary/40" />
        <div className="p-5 lg:p-6">
          <div className="flex flex-col lg:flex-row gap-5 justify-between items-start mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                  <BrainCircuit className="w-3.5 h-3.5" /> AI Recommended
                </div>
                <Badge variant="outline" className={cn(
                  "text-[10px] px-3 py-1 uppercase font-black shadow-sm",
                  winner.confidenceLevel === "High" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/50" : 
                  winner.confidenceLevel === "Medium" ? "bg-amber-500/10 text-amber-700 border-amber-500/50" : "bg-destructive/10 text-destructive border-destructive/50"
                )}>
                  {winner.confidenceLevel} Confidence
                </Badge>
              </div>
              <h2 className="text-2xl font-black text-foreground mb-2 leading-tight">{winner.title}</h2>
              <p className="text-sm text-foreground/80 font-medium max-w-2xl leading-relaxed">{winner.description}</p>
            </div>

            {winner.scoreBreakdown && (
              <div className="w-full lg:w-[320px] bg-muted/30 border border-border rounded-2xl p-4 shadow-inner shrink-0">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Explainable AI Score</p>
                    <p className="text-4xl font-black text-foreground leading-none">{winner.aiScore}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] w-14 text-foreground/70 uppercase font-bold tracking-wider">Service</span>
                    <div className="flex-1 h-1.5 bg-muted/80 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(winner.scoreBreakdown.serviceLevel))} style={{ width: `${winner.scoreBreakdown.serviceLevel}%` }} />
                    </div>
                    <span className="text-xs font-bold w-6 text-right">{winner.scoreBreakdown.serviceLevel}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] w-14 text-foreground/70 uppercase font-bold tracking-wider">Finance</span>
                    <div className="flex-1 h-1.5 bg-muted/80 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(winner.scoreBreakdown.financial))} style={{ width: `${winner.scoreBreakdown.financial}%` }} />
                    </div>
                    <span className="text-xs font-bold w-6 text-right">{winner.scoreBreakdown.financial}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] w-14 text-foreground/70 uppercase font-bold tracking-wider">Speed</span>
                    <div className="flex-1 h-1.5 bg-muted/80 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-1000", getProgressColor(winner.scoreBreakdown.speed))} style={{ width: `${winner.scoreBreakdown.speed}%` }} />
                    </div>
                    <span className="text-xs font-bold w-6 text-right">{winner.scoreBreakdown.speed}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 grid grid-cols-2 lg:grid-cols-3 gap-3">
              <MetricBox icon={<DollarSign className="w-3.5 h-3.5"/>} label="Rev. at Risk" value={`${winner.revenueAtRisk > 0 ? "-" : ""}$${winner.revenueAtRisk.toLocaleString()}`} valueClass={winner.revenueAtRisk > 0 ? "text-destructive" : "text-emerald-600"} />
              <MetricBox icon={<TrendingDown className="w-3.5 h-3.5"/>} label="Added Cost" value={`${winner.additionalCost > 0 ? "-" : ""}$${winner.additionalCost.toLocaleString()}`} valueClass={winner.additionalCost > 0 ? "text-destructive" : "text-emerald-600"} />
              <MetricBox icon={<TrendingUp className="w-3.5 h-3.5"/>} label="OTIF" value={`${winner.otif.toFixed(1)}%`} valueClass={winner.otif >= 90 ? "text-emerald-600" : winner.otif >= 80 ? "text-amber-600" : "text-destructive"} />
              <MetricBox icon={<Clock className="w-3.5 h-3.5"/>} label="Recovery Time" value={`${winner.recoveryTimeDays} Days`} valueClass="text-foreground" />
              <MetricBox icon={<DollarSign className="w-3.5 h-3.5"/>} label="Working Cap" value={`${winner.workingCapitalImpact < 0 ? "-" : "+"}$${Math.abs(winner.workingCapitalImpact).toLocaleString()}`} valueClass={winner.workingCapitalImpact < 0 ? "text-destructive" : "text-emerald-600"} />
              <div className="bg-card border border-border/60 rounded-xl p-3 flex flex-col justify-center shadow-sm hover:border-border transition-colors gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Op Risk</span>
                  <Badge variant="outline" className={cn("uppercase text-[10px] font-black px-2 py-0", getRiskColor(winner.operationalRisk))}>{winner.operationalRisk}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Customer</span>
                  <span className={cn("text-[10px] font-black uppercase tracking-widest", getCustomerImpactColor(winner.customerImpact))}>{winner.customerImpact}</span>
                </div>
              </div>
            </div>

            <div className="xl:col-span-1 bg-primary/5 rounded-2xl p-5 border border-primary/20">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4" /> Why This Won
              </h3>
              {winner.recommendationReason && (
                <p className="text-xs text-foreground font-bold leading-relaxed mb-4">{winner.recommendationReason}</p>
              )}
              {winner.reasoningChain && (
                <div className="relative pl-5 space-y-4 before:absolute before:inset-y-2 before:left-[9px] before:w-px before:bg-primary/30">
                  {winner.reasoningChain.map((step, stepIdx) => (
                    <div key={stepIdx} className="relative text-xs text-foreground/80 leading-relaxed font-medium">
                      <div className="absolute -left-[23px] top-1 w-2 h-2 rounded-full bg-primary ring-4 ring-primary/10" />
                      {step}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. ALTERNATIVES SECTION */}
      {/* ============================================================== */}
      {alternatives.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-black text-foreground">Alternative Strategies</h3>
            <div className="flex-1 h-px bg-border" />
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {alternatives.map((opt, idx) => (
              <div key={opt.id} className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm hover:border-border transition-all flex flex-col xl:flex-row gap-5">
                <div className="xl:w-1/4 flex flex-col justify-between border-b xl:border-b-0 xl:border-r border-border/60 pb-4 xl:pb-0 xl:pr-5">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-[10px] font-black px-2 py-0.5 uppercase bg-muted/60 text-muted-foreground">
                        Rank {idx + 2}
                      </Badge>
                      <span className="text-sm font-black text-foreground">{opt.aiScore} pts</span>
                    </div>
                    <h4 className="text-base font-black text-foreground leading-tight mb-1">{opt.title}</h4>
                    <p className="text-xs text-foreground/70 font-medium">{opt.description}</p>
                  </div>
                  
                  <div className="mt-4">
                    <button 
                      onClick={() => setExpandedOptionId(opt.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-black text-foreground/70 hover:text-foreground transition-colors uppercase tracking-widest bg-muted/40 hover:bg-muted p-2.5 rounded-lg border border-transparent hover:border-border/60"
                    >
                      <Info className="w-3.5 h-3.5" /> View Logic
                    </button>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 items-center content-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Rev. at Risk</span>
                    <span className={cn("text-base font-black", opt.revenueAtRisk > 0 ? "text-destructive" : "text-emerald-600")}>{opt.revenueAtRisk > 0 ? "-" : ""}${opt.revenueAtRisk.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Cost</span>
                    <span className={cn("text-base font-black", opt.additionalCost > 0 ? "text-destructive" : "text-emerald-600")}>{opt.additionalCost > 0 ? "-" : ""}${opt.additionalCost.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">OTIF</span>
                    <span className={cn("text-base font-black", opt.otif >= 90 ? "text-emerald-600" : opt.otif >= 80 ? "text-amber-600" : "text-destructive")}>{opt.otif.toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Time</span>
                    <span className="text-base font-black text-foreground">{opt.recoveryTimeDays} Days</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Op Risk</span>
                    <span className={cn("text-xs font-black uppercase tracking-widest", getRiskColor(opt.operationalRisk).replace("bg-", "").split(" ")[1])}>{opt.operationalRisk}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Customer</span>
                    <span className={cn("text-xs font-black uppercase tracking-widest", getCustomerImpactColor(opt.customerImpact))}>{opt.customerImpact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. EXPLAINABLE AI MODAL (POP-UP) */}
      {/* ============================================================== */}
      {expandedOpt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
            onClick={() => setExpandedOptionId(null)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-card border border-border shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-full">
                  <BrainCircuit className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground">AI Evaluation Context</h3>
                  <p className="text-xs text-muted-foreground font-medium">{expandedOpt.title}</p>
                </div>
              </div>
              <button 
                onClick={() => setExpandedOptionId(null)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 overflow-y-auto">
              <div className="bg-muted/40 p-5 rounded-2xl border border-border/50 mb-8">
                <span className="block text-[10px] uppercase font-black tracking-widest text-primary mb-2">Primary Conclusion</span>
                <p className="text-sm text-foreground font-bold leading-relaxed">
                  {expandedOpt.recommendationReason}
                </p>
              </div>
              
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-6">Logical Reasoning Chain</h4>
                <div className="relative pl-7 space-y-6 before:absolute before:inset-y-2 before:left-[13px] before:w-0.5 before:bg-border">
                  {expandedOpt.reasoningChain?.map((step, stepIdx) => (
                    <div key={stepIdx} className="relative text-sm text-foreground/80 leading-relaxed font-medium">
                      <div className="absolute -left-[32px] top-1.5 w-3 h-3 rounded-full bg-muted-foreground ring-4 ring-background shadow-sm" />
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-border/60 bg-muted/10 flex justify-end">
              <button 
                onClick={() => setExpandedOptionId(null)}
                className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
              >
                Close Logic
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
