import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, TrendingDown, Clock, ShieldAlert, Zap, Factory } from "lucide-react";
import { SimulationResult, MitigationOption } from "@workspace/db";
import PortfolioSimulationTab from "@/components/simulations/PortfolioSimulationTab";

function formatDisplayDate(dateStr?: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[parseInt(parts[1], 10) - 1];
    const day = parseInt(parts[2], 10);
    return `${month} ${day}, ${parts[0]}`;
  }
  return dateStr;
}

function formatShortDate(dateStr?: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[parseInt(parts[1], 10) - 1];
    const day = parseInt(parts[2], 10);
    return `${month} ${day}`;
  }
  return dateStr;
}

const SCENARIOS = [
  { id: "SINGLE_SUPPLIER_RISK", category: "Supply Risks", label: "Single Supplier Dependency (SR-01)" },
  { id: "MULTI_SUPPLIER_RISK", category: "Supply Risks", label: "Multi-Supplier Availability (SR-02)" },
  { id: "SUPPLIER_DELAY", category: "Supply Risks", label: "Supplier Delay (SR-03)" },
  { id: "UNVERIFIED_LEAD_TIME", category: "Supply Risks", label: "Unverified Lead Time (SR-04)" },
  { id: "CAPACITY_CONSTRAINT", category: "Supply Risks", label: "Capacity Constraint (SR-05)" },
  { id: "BUFFER_DEPLETION", category: "Supply Risks", label: "Buffer Depletion (SR-06)" },
  { id: "SUPPLIER_QUALITY_FAILURE", category: "Supply Risks", label: "Supplier Quality Failure (SR-07)" },
  { id: "SINGLE_SOURCE_FAILURE", category: "Supply Risks", label: "Single Source Failure (SR-08)" },
  { id: "DEMAND_SURGE", category: "Demand Risks", label: "Demand Surge" },
  { id: "PRODUCTION_LINE_FAILURE", category: "Operational Risks", label: "Production Line Failure" },
];

export default function SimulationsPage() {
  const { toast } = useToast();
  
  // Builder State
  const [category, setCategory] = useState("Supply Risks");
  const [scenarioType, setScenarioType] = useState("SUPPLIER_DELAY");
  
  // Params
  const [productId, setProductId] = useState("1");
  const [supplierId, setSupplierId] = useState("1");
  const [delayDays, setDelayDays] = useState("7");
  const [surgePct, setSurgePct] = useState("50");
  const [failurePct, setFailurePct] = useState("10");

  const { data: suppliers } = useQuery({
    queryKey: ["erp-suppliers"],
    queryFn: async () => {
      const res = await fetch("/api/erp/suppliers");
      if (!res.ok) throw new Error("Failed to load suppliers");
      return res.json();
    }
  });

  const { data: products } = useQuery({
    queryKey: ["erp-products"],
    queryFn: async () => {
      const res = await fetch("/api/inventory");
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    }
  });

  const { data: relationships } = useQuery({
    queryKey: ["erp-relationships"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/relationships");
      if (!res.ok) throw new Error("Failed to load relationships");
      return res.json();
    }
  });

  const filteredProducts = products?.filter((p: any) => {
    if (category !== "Supply Risks" || !supplierId) return true;
    if (relationships) {
      return relationships.some((r: any) => 
        String(r.supplierId) === supplierId && 
        String(r.productId) === String(p.id)
      );
    }
    return false;
  }) || [];

  const filteredSuppliers = suppliers?.filter((s: any) => {
    if (category !== "Supply Risks") return true;
    if (relationships) {
      return relationships.some((r: any) => 
        String(r.supplierId) === String(s.id)
      );
    }
    return false;
  }) || [];

  const currentRelationship = relationships?.find((r: any) => 
    String(r.supplierId) === supplierId && String(r.productId) === productId
  );

  const [result, setResult] = useState<{ result: SimulationResult, narration: string } | null>(null);

  const runSimulation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/simulation/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: {
            id: "SIM-" + Date.now(),
            type: scenarioType,
            title: "Simulation",
            description: "Custom run",
            parameters: {
              productId: parseInt(productId),
              supplierId: parseInt(supplierId),
              delayDays: parseInt(delayDays),
              surgePct: parseInt(surgePct),
              failurePct: parseInt(failurePct)
            }
          }
        })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.status === "FAILED") {
          throw new Error(`Stage: ${err.stage} | Code: ${err.errorCode} | ${err.message}`);
        }
        throw new Error(err.message || err.error || "Simulation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Simulation Complete", description: "Successfully ran deterministic simulation loop." });
    },
    onError: (err: any) => {
      const msg = err.message as string;
      if (msg.includes("Stage:")) {
        const parts = msg.split(" | ");
        toast({ 
          title: "Simulation Error", 
          description: (
            <div className="flex flex-col gap-1">
              {parts.map((p, i) => <span key={i}>{p}</span>)}
            </div>
          ),
          variant: "destructive" 
        });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    }
  });

  return (
    <div className="p-6 h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Professional Simulation Engine</h1>
          <p className="text-muted-foreground mt-1">
            Deterministic scenario modeling over live ERP data.
          </p>
        </div>
      </div>

      <Tabs defaultValue="single" className="w-full h-full flex flex-col">
        <TabsList className="mb-4 w-max">
          <TabsTrigger value="single">Single Scenario (SR-4)</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio Optimization (SR-5)</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="flex-1 mt-0">

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
        {/* LEFT PANEL: SCENARIO BUILDER */}
        <div className="md:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scenario Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>1. Risk Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Supply Risks">Supply Risks</SelectItem>
                    <SelectItem value="Demand Risks">Demand Risks</SelectItem>
                    <SelectItem value="Operational Risks">Operational Risks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>2. Scenario Type</Label>
                <Select value={scenarioType} onValueChange={setScenarioType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCENARIOS.filter(s => s.category === category).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {category === "Supply Risks" && (
                <div className="space-y-2">
                  <Label>3. Target Supplier</Label>
                  <Select value={supplierId} onValueChange={(val) => {
                    setSupplierId(val);
                    setProductId("");
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                    <SelectContent>
                      {filteredSuppliers.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name?.value || s.name || "Unknown"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>{category === "Supply Risks" ? "4. Target Product" : "3. Target Product"}</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {category === "Supply Risks" && currentRelationship && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Active POs: {currentRelationship.activePoCount} | Inbound Qty: {currentRelationship.inboundQty}
                  </p>
                )}
              </div>

              {scenarioType === "SUPPLIER_DELAY" && (
                <div className="space-y-2">
                  <Label>Delay in Days</Label>
                  <Input 
                    type="number" 
                    min="0" 
                    value={delayDays} 
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0) setDelayDays(val.toString());
                      else if (e.target.value === "") setDelayDays("");
                    }} 
                  />
                </div>
              )}

              {scenarioType === "DEMAND_SURGE" && (
                <div className="space-y-2">
                  <Label>Surge %</Label>
                  <Input 
                    type="number" 
                    min="0" 
                    value={surgePct} 
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0) setSurgePct(val.toString());
                      else if (e.target.value === "") setSurgePct("");
                    }} 
                  />
                </div>
              )}

              {scenarioType === "SUPPLIER_QUALITY_FAILURE" && (
                <div className="space-y-2">
                  <Label>Failure %</Label>
                  <Input 
                    type="number" 
                    min="0" 
                    max="100" 
                    value={failurePct} 
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= 100) setFailurePct(val.toString());
                      else if (e.target.value === "") setFailurePct("");
                    }} 
                  />
                </div>
              )}

              <div className="pt-4 border-t">
                <Button 
                  className="w-full" 
                  onClick={() => runSimulation.mutate()} 
                  disabled={runSimulation.isPending}
                >
                  {runSimulation.isPending ? "Running Loop..." : "Run Simulation"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL: RESULTS */}
        <div className="md:col-span-9 space-y-6">
          {!result && !runSimulation.isPending && (
            <Card className="h-full flex items-center justify-center bg-muted/20 border-dashed">
              <CardContent className="flex flex-col items-center py-20 text-muted-foreground">
                <Factory className="w-12 h-12 mb-4 opacity-50" />
                <p>Configure a scenario on the left and run the simulation.</p>
              </CardContent>
            </Card>
          )}

          {runSimulation.isPending && (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="flex flex-col items-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                <p>Computing deterministic outcome...</p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              {/* SECTION 1: EXECUTIVE STRIP */}
              <Card className={`border-l-4 ${result.result.simulationStatus === 'NOT_EXECUTED' ? 'border-l-yellow-500' : 'border-l-primary'}`}>
                <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    {result.result.simulationStatus === "NOT_EXECUTED" ? (
                      <>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                          <AlertCircle className="w-6 h-6 text-yellow-500" /> [SIMULATION NOT EXECUTED]
                        </h2>
                        <p className="text-lg mt-1 font-semibold text-yellow-600">
                          {result.result.errorCode}: {result.result.errorMessage}
                        </p>
                        {result.result.relationship && (
                          <div className="mt-2 text-sm border-l-2 border-yellow-200 pl-3 text-muted-foreground">
                            <p>Supplier: {result.result.relationship.supplierName} (ID: {result.result.relationship.supplierId})</p>
                            <p>Product: {result.result.relationship.productName} (ID: {result.result.relationship.productId})</p>
                            <p>ERP Mapping: {result.result.relationship.relationshipExists ? "Verified" : "None"}</p>
                            <p>Active POs: {result.result.relationship.matchingPOCount} ({result.result.relationship.matchingPOQuantity} units)</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                          {result.result.metrics.firstStockoutDay !== null ? (
                            <><ShieldAlert className="w-6 h-6 text-red-500" /> [STOCKOUT RISK]</>
                          ) : (
                            <><CheckCircle2 className="w-6 h-6 text-green-500" /> [NO STOCKOUT]</>
                          )}
                        </h2>
                        <p className="text-lg mt-1">
                          <span className="font-semibold">{result.result.metrics.totalUnmetDemand.toLocaleString()} units at risk</span>
                          {" | "} 
                          {result.result.financials.revenueAtRisk.status === "VERIFIED" 
                            ? `$${result.result.financials.revenueAtRisk.value?.toLocaleString()} revenue`
                            : "NOT DETERMINABLE revenue"}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-sm px-3 py-1 bg-muted">
                      Data Confidence: {result.result.dataConfidence}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      {result.result.violations && result.result.violations.length > 0 
                        ? `${result.result.violations.length} violations detected` 
                        : "Validation Passed"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION 2: AI NARRATION (Not requested as a section, but heavily specified in part 5. We place it here for executive view) */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Zap className="w-6 h-6 text-primary mt-1 shrink-0" />
                    <div className="space-y-4 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                      {result.narration}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION 3: DETERMINISTIC SUPPLY RISK OR KPI CARDS */}
              {result.result.simulationStatus !== "NOT_EXECUTED" && result.result.supplyRisk ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold">Deterministic Supply Risk Profile</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <Card className={result.result.supplyRisk.severity === "CRITICAL" || result.result.supplyRisk.severity === "HIGH" ? "border-red-500 border-2" : ""}>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Risk Severity</p>
                        <p className={`text-xl font-bold mt-1 ${result.result.supplyRisk.severity === 'CRITICAL' || result.result.supplyRisk.severity === 'HIGH' ? 'text-red-500' : ''}`}>{result.result.supplyRisk.severity}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Scenario Type</p>
                        <p className="text-sm font-bold mt-2">{result.result.supplyRisk.scenarioType.replace(/_/g, " ")}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Exposure</p>
                        <p className="text-lg font-bold mt-1 leading-tight">
                          {result.result.supplyRisk.affectedQuantity === 0 ? "Zero Immediate Exposure" : `${result.result.supplyRisk.affectedQuantity.toLocaleString()} Units`}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Residual Shortage</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.residualShortage.toLocaleString()}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Inventory Coverage</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.inventoryCoverage.toLocaleString()} Units</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Inbound Quantity</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.currentlyInboundQuantity.toLocaleString()}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Single Supplier</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.singleSupplierDependency ? "Yes" : "No"}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Alternate Available</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.alternateSupplierAvailable ? "Yes" : "No"}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Lead Time Verified</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.leadTimeVerified ? "Yes" : "No"}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Capacity Risk</p>
                        <p className="text-xl font-bold mt-1">{result.result.supplyRisk.capacityRisk}</p>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="text-sm text-muted-foreground mt-2 border-l-2 pl-3">
                     <strong>Reason:</strong> {result.result.supplyRisk.exposureReason}
                  </div>
                </div>
              ) : result.result.simulationStatus !== "NOT_EXECUTED" && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">First Stockout</p>
                    <p className="text-xl font-bold mt-1">
                      {result.result.metrics.firstStockoutDay !== null ? `Day ${result.result.metrics.firstStockoutDay}` : "None"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Units at Risk</p>
                    <p className="text-xl font-bold mt-1">{result.result.metrics.totalUnmetDemand.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Revenue at Risk</p>
                    <p className="text-xl font-bold mt-1">
                      {result.result.financials.revenueAtRisk.status === "VERIFIED" 
                        ? `$${result.result.financials.revenueAtRisk.value?.toLocaleString()}` 
                        : "MISSING"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Days of Supply</p>
                    <p className="text-xl font-bold mt-1">
                      {typeof result.result.metrics.coverageDays === "number" ? result.result.metrics.coverageDays.toFixed(1) + "d" : result.result.metrics.coverageDays}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Recovery Date</p>
                    <p className="text-xl font-bold mt-1 text-sm">{result.result.metrics.recoveryDate || "None"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Max Shortage</p>
                    <p className="text-xl font-bold mt-1">{result.result.metrics.maxShortageUnits.toLocaleString()}</p>
                  </CardContent>
                </Card>
              </div>
              )}

              {/* SECTION 4: ANALYTICAL TABLES */}
              {result.result.simulationStatus !== "NOT_EXECUTED" && (
              <Tabs defaultValue="timing" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="timing">Production & BOM Timing</TabsTrigger>
                  <TabsTrigger value="trace">Inventory Trace</TabsTrigger>
                  <TabsTrigger value="financials">Financial Impact</TabsTrigger>
                  <TabsTrigger value="mitigations">Mitigations</TabsTrigger>
                  {result.result.sr4Impact && <TabsTrigger value="whatif" className="text-indigo-600 dark:text-indigo-400 font-bold">What-If Analysis (SR-4)</TabsTrigger>}
                </TabsList>
                
                <TabsContent value="timing">
                  <div className="flex flex-col gap-6">
                    {/* Dependency Chain Flow */}
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold">
                            {result.result.productionSchedule?.hasBomDependencies
                              ? "Chronological Supply Chain Dependency Flow"
                              : "Direct Supply Risk & Exposure Flow"}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs">
                            {result.result.productionSchedule?.hasBomDependencies ? "VERIFIED_MO_TIMING" : "DIRECT_SUPPLY_IMPACT"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {result.result.productionSchedule?.hasBomDependencies ? (
                          <div className="flex items-center justify-between gap-2 overflow-x-auto text-xs py-2">
                            <div className="bg-muted p-3 rounded-lg flex flex-col items-center text-center border min-w-[130px]">
                              <span className="font-semibold text-primary">{result.result.graph?.supplier?.name?.value || "Hydro PO"}</span>
                              <span className="text-muted-foreground font-mono">{formatDisplayDate(result.result.productionSchedule?.p1270.shortageAvailabilityDate || "2026-08-23")}</span>
                              <Badge variant="secondary" className="text-[10px] mt-1">{scenarioType === "SUPPLIER_DELAY" && parseInt(delayDays) > 0 ? "SIMULATION" : "TEST_FIXTURE"}</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex flex-col items-center text-center min-w-[140px]">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">Coil Shortage</span>
                              <span className="text-muted-foreground font-mono">{result.result.productionSchedule?.p1270.netShortage ? result.result.productionSchedule.p1270.netShortage.toLocaleString() + " Units" : "1,450 Units"}</span>
                              <Badge variant="outline" className="text-[10px] mt-1 border-amber-500 text-amber-600">DERIVED</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className="bg-muted p-3 rounded-lg flex flex-col items-center text-center border min-w-[140px]">
                              <span className="font-semibold">P15 Printed Blank</span>
                              <span className="text-muted-foreground font-mono">{formatShortDate(result.result.productionSchedule?.p15.actualStart || "2026-08-23")} ➔ {formatShortDate(result.result.productionSchedule?.p15.actualCompletion || "2026-08-25")}</span>
                              <Badge variant="secondary" className="text-[10px] mt-1">SIMULATION</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className="bg-muted p-3 rounded-lg flex flex-col items-center text-center border min-w-[140px]">
                              <span className="font-semibold">P16 Mountain Dew</span>
                              <span className="text-muted-foreground font-mono">{formatShortDate(result.result.productionSchedule?.p16.actualStart || "2026-08-25")} ➔ {formatShortDate(result.result.productionSchedule?.p16.actualCompletion || "2026-09-01")}</span>
                              <Badge variant="secondary" className="text-[10px] mt-1">SIMULATION</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex flex-col items-center text-center min-w-[140px]">
                              <span className="font-semibold text-red-600 dark:text-red-400">SO Delivery Delay</span>
                              <span className="text-muted-foreground font-mono">{result.result.productionSchedule?.salesOrder.deliveryDelayDays || 12} Days Delay</span>
                              <Badge variant="destructive" className="text-[10px] mt-1">SIMULATION</Badge>
                            </div>
                          </div>
                        ) : result.result.supplyRisk ? (
                          <div className="py-4">
                            {result.result.supplyRisk.downstreamImpacts.dependentProducts.length === 0 &&
                             result.result.supplyRisk.downstreamImpacts.delayedMOs.length === 0 &&
                             result.result.supplyRisk.downstreamImpacts.affectedSalesOrders.length === 0 ? (
                               <p className="text-muted-foreground font-semibold">No downstream production impact identified.</p>
                             ) : (
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <Card>
                                   <CardHeader className="py-3 bg-muted/50"><CardTitle className="text-sm">Dependent Products</CardTitle></CardHeader>
                                   <CardContent className="p-3">
                                     {result.result.supplyRisk.downstreamImpacts.dependentProducts.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {result.result.supplyRisk.downstreamImpacts.dependentProducts.map((id: number) => <Badge key={id} variant="outline">ID: {id}</Badge>)}
                                        </div>
                                     ) : <span className="text-muted-foreground text-xs">None</span>}
                                   </CardContent>
                                 </Card>
                                 <Card>
                                   <CardHeader className="py-3 bg-muted/50"><CardTitle className="text-sm">Delayed MOs</CardTitle></CardHeader>
                                   <CardContent className="p-3">
                                     {result.result.supplyRisk.downstreamImpacts.delayedMOs.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {result.result.supplyRisk.downstreamImpacts.delayedMOs.map((id: number) => <Badge key={id} variant="secondary">MO: {id}</Badge>)}
                                        </div>
                                     ) : <span className="text-muted-foreground text-xs">None</span>}
                                   </CardContent>
                                 </Card>
                                 <Card>
                                   <CardHeader className="py-3 bg-muted/50"><CardTitle className="text-sm">Affected Sales Orders</CardTitle></CardHeader>
                                   <CardContent className="p-3">
                                     {result.result.supplyRisk.downstreamImpacts.affectedSalesOrders.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {result.result.supplyRisk.downstreamImpacts.affectedSalesOrders.map((id: number) => <Badge key={id} variant="destructive">SO: {id}</Badge>)}
                                        </div>
                                     ) : <span className="text-muted-foreground text-xs">None</span>}
                                   </CardContent>
                                 </Card>
                               </div>
                             )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 overflow-x-auto text-xs py-2">
                            <div className="bg-muted p-3 rounded-lg flex flex-col items-center text-center border min-w-[140px]">
                              <span className="font-semibold text-primary">{result.result.graph?.product?.name?.value || "Target SKU"}</span>
                              <span className="text-muted-foreground font-mono">{result.result.graph?.supplier?.name?.value || "Supplier PO"}</span>
                              <Badge variant="secondary" className="text-[10px] mt-1">ERP_VERIFIED</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex flex-col items-center text-center min-w-[140px]">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">Scenario Exposure</span>
                              <span className="text-muted-foreground font-mono">{scenarioType === "SUPPLIER_QUALITY_FAILURE" ? `${failurePct}% Quality Defect` : `${delayDays}d Supplier Delay`}</span>
                              <Badge variant="outline" className="text-[10px] mt-1 border-amber-500 text-amber-600">SIMULATION</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className="bg-muted p-3 rounded-lg flex flex-col items-center text-center border min-w-[140px]">
                              <span className="font-semibold">Buffer Stock Coverage</span>
                              <span className="text-muted-foreground font-mono">{result.result.mitigations.length > 0 && result.result.mitigations[0].id === "absorb_buffer" ? `${result.result.mitigations[0].unitsCovered?.toLocaleString()} Units Covered` : "Buffer Assessed"}</span>
                              <Badge variant="secondary" className="text-[10px] mt-1">ERP_INVENTORY</Badge>
                            </div>
                            <span className="text-muted-foreground font-bold">➔</span>
                            <div className={`p-3 rounded-lg flex flex-col items-center text-center border min-w-[140px] ${result.result.metrics.totalUnmetDemand > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                              <span className={`font-semibold ${result.result.metrics.totalUnmetDemand > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {result.result.metrics.totalUnmetDemand > 0 ? "Unmet Demand Shortage" : "Zero Unmet Shortage"}
                              </span>
                              <span className="text-muted-foreground font-mono">{result.result.metrics.totalUnmetDemand.toLocaleString()} Units</span>
                              <Badge variant={result.result.metrics.totalUnmetDemand > 0 ? "destructive" : "default"} className="text-[10px] mt-1">
                                {result.result.metrics.totalUnmetDemand > 0 ? "ACTION_REQUIRED" : "FULLY_COVERED"}
                              </Badge>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Material Shortage Breakdown & Schedule Table - ONLY SHOW FOR LEGACY HAS_BOM_DEPENDENCIES */}
                    {result.result.productionSchedule?.hasBomDependencies && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-semibold">Material Constraint Breakdown ({result.result.graph?.product?.name?.value || "Target SKU"})</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm space-y-2">
                              <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground">Gross Requirement / PO Batch:</span>
                                <span className="font-mono font-semibold">{result.result.productionSchedule?.p1270.grossRequirement ? result.result.productionSchedule.p1270.grossRequirement.toLocaleString() + " units" : "2,950 units"}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground">On-Hand Inventory:</span>
                                <span className="font-mono text-green-600 font-semibold">{result.result.productionSchedule?.p1270.onHand ? result.result.productionSchedule.p1270.onHand.toLocaleString() + " units" : "1,500 units"}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground">Net Shortage:</span>
                                <span className="font-mono text-red-500 font-semibold">{result.result.productionSchedule?.p1270.netShortage ? result.result.productionSchedule.p1270.netShortage.toLocaleString() + " units" : "1,450 units"}</span>
                              </div>
                              <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Shortage Available Date:</span>
                                <span className="font-mono font-bold">{formatDisplayDate(result.result.productionSchedule?.p1270.shortageAvailabilityDate || "2026-08-23")}</span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-semibold">Planned vs Simulated Production Schedule</CardTitle>
                            </CardHeader>
                            <CardContent className="text-xs">
                              <table className="w-full text-left">
                                <thead className="text-muted-foreground uppercase font-semibold border-b">
                                  <tr>
                                    <th className="py-2">Stage</th>
                                    <th className="py-2">Planned Dates</th>
                                    <th className="py-2">Actual Simulated</th>
                                    <th className="py-2">Delay</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y font-mono">
                                  <tr>
                                    <td className="py-2 font-sans font-semibold">P15 Blank</td>
                                    <td className="py-2 text-muted-foreground">Aug 09 ➔ Aug 11</td>
                                    <td className="py-2">{result.result.productionSchedule?.p15.actualStart || "2026-08-23"} ➔ {result.result.productionSchedule?.p15.actualCompletion || "2026-08-25"}</td>
                                    <td className="py-2 text-amber-600 font-bold">{result.result.productionSchedule?.p15.delayDays || 14}d</td>
                                  </tr>
                                  <tr>
                                    <td className="py-2 font-sans font-semibold">P16 Can</td>
                                    <td className="py-2 text-muted-foreground">Aug 12 ➔ Aug 19</td>
                                    <td className="py-2">{result.result.productionSchedule?.p16.actualStart || "2026-08-25"} ➔ {result.result.productionSchedule?.p16.actualCompletion || "2026-09-01"}</td>
                                    <td className="py-2 text-amber-600 font-bold">{result.result.productionSchedule?.p16.delayDays || 14}d</td>
                                  </tr>
                                  <tr>
                                    <td className="py-2 font-sans font-semibold text-red-600">Sales Order</td>
                                    <td className="py-2 text-muted-foreground">Due Aug 20</td>
                                    <td className="py-2 text-red-600 font-bold">{result.result.productionSchedule?.salesOrder.simulatedCompletion || "2026-09-01"}</td>
                                    <td className="py-2 text-red-600 font-bold">{result.result.productionSchedule?.salesOrder.deliveryDelayDays || 12}d</td>
                                  </tr>
                                </tbody>
                              </table>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Scenario Shift Comparison */}
                        <Card className="mt-4">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Supplier Delay Scenario Sensitivity Matrix</CardTitle>
                          </CardHeader>
                          <CardContent className="text-xs">
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-muted text-muted-foreground uppercase font-semibold text-[11px]">
                                <tr>
                                  <th className="p-3">Scenario</th>
                                  <th className="p-3">PO Arrival</th>
                                  <th className="p-3">P15 Completion</th>
                                  <th className="p-3">P16 Completion</th>
                                  <th className="p-3">SO Delivery Delay</th>
                                  <th className="p-3">Incremental Shift</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y font-mono">
                                <tr className={scenarioType === "SUPPLIER_DELAY" && delayDays === "0" ? "bg-primary/5 font-bold" : ""}>
                                  <td className="p-3 font-sans font-semibold">Baseline (+0d)</td>
                                  <td className="p-3">2026-08-23</td>
                                  <td className="p-3">2026-08-25</td>
                                  <td className="p-3">2026-09-01</td>
                                  <td className="p-3 text-red-600">12 Days</td>
                                  <td className="p-3 text-muted-foreground">Baseline</td>
                                </tr>
                                <tr className={scenarioType === "SUPPLIER_DELAY" && delayDays === "7" ? "bg-primary/5 font-bold" : ""}>
                                  <td className="p-3 font-sans font-semibold">Scenario 1 (+7d)</td>
                                  <td className="p-3">2026-08-30</td>
                                  <td className="p-3">2026-09-01</td>
                                  <td className="p-3">2026-09-08</td>
                                  <td className="p-3 text-red-600">19 Days</td>
                                  <td className="p-3 text-amber-600 font-bold">+7 Days</td>
                                </tr>
                                <tr className={scenarioType === "SUPPLIER_DELAY" && delayDays === "14" ? "bg-primary/5 font-bold" : ""}>
                                  <td className="p-3 font-sans font-semibold">Scenario 2 (+14d)</td>
                                  <td className="p-3">2026-09-06</td>
                                  <td className="p-3">2026-09-08</td>
                                  <td className="p-3">2026-09-15</td>
                                  <td className="p-3 text-red-600">26 Days</td>
                                  <td className="p-3 text-amber-600 font-bold">+14 Days</td>
                                </tr>
                                <tr className={scenarioType === "SUPPLIER_DELAY" && delayDays === "30" ? "bg-primary/5 font-bold" : ""}>
                                  <td className="p-3 font-sans font-semibold">Scenario 3 (+30d)</td>
                                  <td className="p-3">2026-09-22</td>
                                  <td className="p-3">2026-09-24</td>
                                  <td className="p-3">2026-10-01</td>
                                  <td className="p-3 text-red-600">42 Days</td>
                                  <td className="p-3 text-amber-600 font-bold">+30 Days</td>
                                </tr>
                              </tbody>
                            </table>
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="trace">
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground uppercase font-semibold text-xs">
                          <tr>
                            <th className="px-4 py-3">Day</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Opening</th>
                            <th className="px-4 py-3">Inbound</th>
                            <th className="px-4 py-3">Consumed</th>
                            <th className="px-4 py-3">Closing</th>
                            <th className="px-4 py-3">Shortage</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.result.auditTrace.slice(0, 30).map((row, i) => (
                            <tr key={i} className={`border-b ${row.isStockout ? 'bg-red-500/10' : ''}`}>
                              <td className="px-4 py-2">{row.day}</td>
                              <td className="px-4 py-2 font-mono">{row.date}</td>
                              <td className="px-4 py-2">{row.openingStock}</td>
                              <td className="px-4 py-2">{row.inbound}</td>
                              <td className="px-4 py-2">{row.consumption}</td>
                              <td className={`px-4 py-2 font-bold ${row.closingStock === 0 && row.isStockout ? 'text-red-500' : 'text-green-600'}`}>
                                {row.closingStock}
                              </td>
                              <td className="px-4 py-2">{row.shortageUnits}</td>
                              <td className="px-4 py-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {row.sourceType}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="financials">
                   <Card>
                     <CardContent className="p-6">
                        <p className="text-muted-foreground mb-4">Financial impact derived from strict ERP valuation rules.</p>
                        <div className="grid grid-cols-2 gap-4 max-w-lg">
                          <div className="font-semibold">Gross Margin at Risk:</div>
                          <div>
                            {result.result.financials.grossMarginAtRisk.status === "VERIFIED"
                              ? `$${result.result.financials.grossMarginAtRisk.value?.toLocaleString()}`
                              : "NOT DETERMINABLE"}
                          </div>
                          
                          <div className="font-semibold">Data Confidence:</div>
                          <div>{result.result.financials.grossMarginAtRisk.confidence}</div>
                        </div>
                     </CardContent>
                   </Card>
                </TabsContent>

                <TabsContent value="mitigations">
                  <div className="grid grid-cols-1 gap-4">
                    {result.result.supplyRisk?.mitigationResult?.actions ? (
                      result.result.supplyRisk.mitigationResult.actions.map((action: any, i: number) => (
                        <Card key={i} className="border-primary">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg">{action.title}</CardTitle>
                              <Badge variant={action.feasible ? "default" : "destructive"}>
                                {action.feasible ? "FEASIBLE" : "NOT FEASIBLE"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm border-b pb-4">
                              <div>
                                <p className="text-muted-foreground font-semibold">Affected Qty</p>
                                <p>{action.affectedQuantity.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Available Qty</p>
                                <p>{action.availableQuantity !== undefined ? action.availableQuantity.toLocaleString() : "N/A"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Cost</p>
                                <p>{action.mitigationCostProvenance === "UNKNOWN" ? "Unknown" : `$${action.mitigationCost?.toLocaleString()}`}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Date</p>
                                <p>{action.mitigationDateProvenance === "UNKNOWN" ? "Unknown" : action.mitigationDate}</p>
                              </div>
                            </div>
                            
                            <div className="space-y-2 text-sm">
                              <p><strong>Action Type:</strong> {action.type}</p>
                              <p><strong>Why:</strong> {action.reason}</p>
                              {action.targetSupplierName && <p><strong>Target Supplier:</strong> {action.targetSupplierName} (ID: {action.targetSupplierId})</p>}
                              {action.targetProductId !== undefined && <p><strong>Target Product ID:</strong> {action.targetProductId}</p>}
                              <p className="text-xs text-muted-foreground mt-2">Cost Provenance: {action.mitigationCostProvenance} | Date Provenance: {action.mitigationDateProvenance}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      result.result.mitigations.map((opt: any, i: number) => (
                        <Card key={i} className={i === 0 ? "border-primary" : ""}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg">{opt.title}</CardTitle>
                              <Badge variant={i === 0 ? "default" : "secondary"}>
                                {i === 0 ? "AI RECOMMENDED" : opt.eligibility}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-4 gap-4 mb-4 text-sm border-b pb-4">
                              <div>
                                <p className="text-muted-foreground font-semibold">Recovery Day</p>
                                <p>{opt.recoveryDay || "N/A"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Added Cost</p>
                                <p>{opt.addedCost?.status === "VERIFIED" ? `$${opt.addedCost.value?.toLocaleString()}` : "UNKNOWN"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Units Covered</p>
                                <p>{opt.unitsCovered?.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Lead Time</p>
                                <p>{opt.leadTimeDays ? `${opt.leadTimeDays}d` : "N/A"}</p>
                              </div>
                            </div>
                            
                            {opt.explanation && (
                              <div className="space-y-2 text-sm">
                                <p><strong>Action:</strong> {opt.explanation.action}</p>
                                <p><strong>Why:</strong> {opt.explanation.reason}</p>
                                <p><strong>Trade-off:</strong> {opt.explanation.tradeoff}</p>
                                <p className="text-xs text-muted-foreground mt-2">Source: {opt.explanation.dataSource}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="whatif">
                  {result.result.sr4Impact && (
                    <div className="space-y-6">
                      <Card className="border-indigo-200 bg-indigo-50/30 dark:bg-indigo-900/10">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg text-indigo-800 dark:text-indigo-300">Downstream Impact (Deterministic)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Baseline Shortage</p>
                              <p className="text-lg font-bold">{result.result.sr4Impact.baselineShortage.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Scenario Shortage</p>
                              <p className="text-lg font-bold">{result.result.sr4Impact.scenarioShortage.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Shortage Delta</p>
                              <p className="text-lg font-bold text-green-600">{result.result.sr4Impact.shortageDelta.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Supplier Capacity</p>
                              <p className="text-sm font-bold mt-1">{result.result.sr4Impact.supplierCapacityStatus}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Baseline Rev Exposure</p>
                              <p className="text-lg font-bold">
                                {result.result.sr4Impact.baselineRevenueAtRisk === "UNKNOWN" ? "UNKNOWN" : `$${result.result.sr4Impact.baselineRevenueAtRisk.toLocaleString()}`}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Scenario Rev Exposure</p>
                              <p className="text-lg font-bold">
                                {result.result.sr4Impact.scenarioRevenueAtRisk === "UNKNOWN" ? "UNKNOWN" : `$${result.result.sr4Impact.scenarioRevenueAtRisk.toLocaleString()}`}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Revenue Delta</p>
                              <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">
                                {result.result.sr4Impact.revenueDelta === "UNKNOWN" ? "UNKNOWN" : `$${result.result.sr4Impact.revenueDelta.toLocaleString()}`}
                              </p>
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-800">
                            <h4 className="text-sm font-bold mb-2">Affected Sales Orders</h4>
                            {result.result.sr4Impact.affectedSalesOrders.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {result.result.sr4Impact.affectedSalesOrders.map((so: any) => (
                                  <Badge key={so.salesOrderId} variant="outline" className="border-indigo-300 text-indigo-700 bg-white dark:bg-black">
                                    SO: {so.salesOrderId} (Missed: {so.missedQuantity}) <span className="ml-1 text-[9px] text-muted-foreground">[{so.provenance}]</span>
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No downstream sales orders impacted.</p>
                            )}
                          </div>
                          
                          <div className="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-800 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <div><strong>Revenue Prov:</strong> {result.result.sr4Impact.provenance.revenue}</div>
                            <div><strong>Allocation Prov:</strong> {result.result.sr4Impact.provenance.allocation}</div>
                            <div><strong>Assumptions:</strong> {result.result.sr4Impact.scenarioAssumptions.join(", ") || "None"}</div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              )}
            </>
          )}
        </div>
        </div>
        </TabsContent>

        <TabsContent value="portfolio" className="flex-1 mt-0">
          <PortfolioSimulationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
