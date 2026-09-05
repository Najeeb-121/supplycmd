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
  {
    id: "SUPPLIER_DELAY",
    category: "Supply Risks",
    label: "Supplier Delay",
  },
  {
    id: "SUPPLIER_QUALITY_FAILURE",
    category: "Supply Risks",
    label: "Supplier Quality Failure",
  },
  {
    id: "SINGLE_SOURCE_FAILURE",
    category: "Supply Risks",
    label: "Single Source Failure",
  },
  {
    id: "DEMAND_SURGE",
    category: "Demand Risks",
    label: "Demand Surge",
  },
];

export default function SimulationsPage() {
  const { toast } = useToast();

  // Builder State
  const [category, setCategory] = useState("Supply Risks");
  const [scenarioType, setScenarioType] = useState("SUPPLIER_DELAY");

  // Params
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
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
      const res = await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: {

            type: scenarioType,


            parameters: {
              productId: parseInt(productId),

              ...(category === "Supply Risks" && {
                supplierId: parseInt(supplierId),
              }),

              ...(scenarioType === "SUPPLIER_DELAY" && {
                delayDays: parseInt(delayDays),
              }),

              ...(scenarioType === "DEMAND_SURGE" && {
                surgePct: parseInt(surgePct),
              }),

              ...(scenarioType === "SUPPLIER_QUALITY_FAILURE" && {
                failurePct: parseInt(failurePct),
              }),
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
            Deterministic scenario modeling over ERP-backed data.
          </p>
        </div>
      </div>

      <Tabs defaultValue="single" className="w-full h-full flex flex-col">
        <TabsList className="mb-4 w-max">
          <TabsTrigger value="single">Single Disruption (SR-4)</TabsTrigger>
          <TabsTrigger value="portfolio">Mitigation Portfolio (SR-6)</TabsTrigger>
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
                    <Select
                      value={category}
                      onValueChange={(value) => {
                        setCategory(value);
                        setSupplierId("");
                        setProductId("");

                        const firstScenario = SCENARIOS.find(
                          (scenario) => scenario.category === value
                        );

                        setScenarioType(firstScenario?.id ?? "");
                      }}
                    >
                      <SelectTrigger aria-label="Risk Category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Supply Risks">Supply Risks</SelectItem>
                        <SelectItem value="Demand Risks">Demand Risks</SelectItem>

                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>2. Scenario Type</Label>
                    <Select value={scenarioType} onValueChange={setScenarioType}>
                      <SelectTrigger aria-label="Scenario Type"><SelectValue /></SelectTrigger>
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
                        <SelectTrigger aria-label="Target Supplier"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
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
                      <SelectTrigger aria-label="Target Product"><SelectValue placeholder="Select product..." /></SelectTrigger>
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
                      <Label htmlFor="delay-days">Delay in Days</Label>
                      <Input
                        id="delay-days"
                        type="number"
                        min="1"
                        value={delayDays}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1) setDelayDays(val.toString());
                          else if (e.target.value === "") setDelayDays("");
                        }}
                      />
                    </div>
                  )}

                  {scenarioType === "DEMAND_SURGE" && (
                    <div className="space-y-2">
                      <Label htmlFor="surge-percent">Surge %</Label>
                      <Input
                        id="surge-percent"
                        type="number"
                        min="1"
                        value={surgePct}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1) setSurgePct(val.toString());
                          else if (e.target.value === "") setSurgePct("");
                        }}
                      />
                    </div>
                  )}

                  {scenarioType === "SUPPLIER_QUALITY_FAILURE" && (
                    <div className="space-y-2">
                      <Label htmlFor="failure-percent">Failure %</Label>
                      <Input
                        id="failure-percent"
                        type="number"
                        min="1"
                        max="100"
                        value={failurePct}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= 100) setFailurePct(val.toString());
                          else if (e.target.value === "") setFailurePct("");
                        }}
                      />
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <Button
                      className="w-full"
                      onClick={() => runSimulation.mutate()}
                      disabled={
                        runSimulation.isPending ||
                        !scenarioType ||
                        !productId ||
                        (category === "Supply Risks" && !supplierId) ||
                        (scenarioType === "SUPPLIER_DELAY" && delayDays === "") ||
                        (scenarioType === "DEMAND_SURGE" && surgePct === "") ||
                        (scenarioType === "SUPPLIER_QUALITY_FAILURE" && failurePct === "")
                      }
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
                  <CardContent className="flex flex-col items-center py-20 text-center">
                    <Factory className="w-12 h-12 mb-4 text-muted-foreground/50" />

                    <h3 className="text-lg font-semibold text-foreground">
                      Test a disruption against the current ERP baseline
                    </h3>

                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                      Select a real ERP-backed scenario, product, and required business relationship.
                      SupplyCMD will compare the baseline with the disrupted outcome and show the
                      operational impact, timing, financial effect, inventory trace, and available mitigations.
                    </p>

                    <p className="mt-4 text-xs text-muted-foreground">
                      Results are calculated from the current SupplyCMD snapshot and scenario inputs.
                    </p>
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
                              <span className="font-semibold">
                                {result.result.metrics.totalUnmetDemand.toLocaleString()} units at risk
                              </span>
                              <span className="text-muted-foreground">
                                {" • "}
                                {result.result.financials.revenueAtRisk.status === "VERIFIED"
                                  ? `Revenue at risk: ${result.result.financials.revenueAtRisk.value?.toLocaleString()}`
                                  : "Revenue at risk: not determinable"}
                              </span>
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

                  {/* SECTION 3: DETERMINISTIC KPI CARDS */}
                  {result.result.simulationStatus !== "NOT_EXECUTED" && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            First Stockout
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {result.result.metrics.firstStockoutDay !== null
                              ? `Day ${result.result.metrics.firstStockoutDay}`
                              : "None"}
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            Units at Risk
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {result.result.metrics.totalUnmetDemand.toLocaleString()}
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            Revenue at Risk
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {result.result.financials.revenueAtRisk.status === "VERIFIED" &&
                              result.result.financials.revenueAtRisk.value != null
                              ? result.result.financials.revenueAtRisk.value.toLocaleString()
                              : "NOT DETERMINABLE"}
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            Days of Supply
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {typeof result.result.metrics.coverageDays === "number"
                              ? `${result.result.metrics.coverageDays.toFixed(1)}d`
                              : result.result.metrics.coverageDays === "NOT_APPLICABLE"
                                ? "NOT APPLICABLE"
                                : result.result.metrics.coverageDays}
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            Recovery Date
                          </p>
                          <p className="text-sm font-bold mt-1">
                            {result.result.metrics.recoveryDate || "None"}
                          </p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            Max Shortage
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {result.result.metrics.maxShortageUnits.toLocaleString()}
                          </p>
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
                        <TabsTrigger value="whatif">
                          What-If Analysis
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="timing">
                        <Card>
                          <CardContent className="p-6">
                            <p className="text-sm text-muted-foreground">
                              Production & BOM timing is unavailable for this result because verified production schedule data is not available.
                            </p>
                          </CardContent>
                        </Card>
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
                                  <th className="px-4 py-3">Quality Loss</th>
                                  <th className="px-4 py-3">Production Output</th>
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
                                    <td className="px-4 py-2">{row.qualityLoss}</td>
                                    <td className="px-4 py-2">{row.moOutput}</td>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
                              <div className="border rounded-lg p-4">
                                <div className="font-semibold">Revenue at Risk</div>
                                <div className="text-lg font-mono mt-1">
                                  {result.result.financials.revenueAtRisk.status === "VERIFIED"
                                    ? result.result.financials.revenueAtRisk.value?.toLocaleString()
                                    : "NOT DETERMINABLE"}
                                </div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {result.result.financials.revenueAtRisk.status} - {result.result.financials.revenueAtRisk.confidence}
                                </div>
                              </div>

                              <div className="border rounded-lg p-4">
                                <div className="font-semibold">Gross Margin at Risk</div>
                                <div className="text-lg font-mono mt-1">
                                  {result.result.financials.grossMarginAtRisk.status === "VERIFIED"
                                    ? result.result.financials.grossMarginAtRisk.value?.toLocaleString()
                                    : "NOT DETERMINABLE"}
                                </div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {result.result.financials.grossMarginAtRisk.status} - {result.result.financials.grossMarginAtRisk.confidence}
                                </div>
                              </div>

                              <div className="border rounded-lg p-4">
                                <div className="font-semibold">Incremental Procurement Cost</div>
                                <div className="text-lg font-mono mt-1">
                                  {result.result.financials.incrementalCost?.value != null
                                    ? result.result.financials.incrementalCost.value.toLocaleString()
                                    : "NOT DETERMINABLE"}
                                </div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {result.result.financials.incrementalCost
                                    ? `${result.result.financials.incrementalCost.status} - ${result.result.financials.incrementalCost.confidence}`
                                    : "NOT AVAILABLE"}
                                </div>
                              </div>

                              <div className="border rounded-lg p-4">
                                <div className="font-semibold">Inventory Carrying Cost</div>
                                <div className="text-lg font-mono mt-1">
                                  {result.result.financials.inventoryCarryingCost?.value != null
                                    ? result.result.financials.inventoryCarryingCost.value.toLocaleString()
                                    : "NOT DETERMINABLE"}
                                </div>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {result.result.financials.inventoryCarryingCost
                                    ? `${result.result.financials.inventoryCarryingCost.status} - ${result.result.financials.inventoryCarryingCost.confidence}`
                                    : "NOT AVAILABLE"}
                                </div>
                              </div>
                            </div>                        </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="mitigations">
                        <Card>
                          <CardContent className="p-6">
                            {result.result.mitigations.length > 0 ? (
                              <div className="grid grid-cols-1 gap-4">
                                {result.result.mitigations.map((opt: any, i: number) => (
                                  <Card key={i}>
                                    <CardHeader className="pb-2">
                                      <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">{opt.title}</CardTitle>
                                        <Badge variant="secondary">
                                          {opt.eligibility ?? "CANDIDATE"}
                                        </Badge>
                                      </div>
                                    </CardHeader>

                                    <CardContent>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm border-b pb-4">
                                        <div>
                                          <p className="text-muted-foreground font-semibold">Recovery Day</p>
                                          <p>{opt.recoveryDay ?? "N/A"}</p>
                                        </div>

                                        <div>
                                          <p className="text-muted-foreground font-semibold">Added Cost</p>
                                          <p>
                                            {opt.addedCost?.value != null
                                              ? `$${opt.addedCost.value.toLocaleString()}`
                                              : "UNKNOWN"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-muted-foreground font-semibold">Units Covered</p>
                                          <p>{opt.unitsCovered?.toLocaleString() ?? "N/A"}</p>
                                        </div>

                                        <div>
                                          <p className="text-muted-foreground font-semibold">Lead Time</p>
                                          <p>{opt.leadTimeDays != null ? `${opt.leadTimeDays}d` : "N/A"}</p>
                                        </div>
                                      </div>

                                      {opt.explanation && (
                                        <div className="space-y-2 text-sm">
                                          <p><strong>Action:</strong> {opt.explanation.action}</p>
                                          <p><strong>Why:</strong> {opt.explanation.reason}</p>
                                          <p><strong>Trade-off:</strong> {opt.explanation.tradeoff}</p>
                                          <p className="text-xs text-muted-foreground mt-2">
                                            Source: {opt.explanation.dataSource}
                                          </p>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No deterministic mitigation candidates were returned for this simulation.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="whatif">
                        <Card>
                          <CardContent className="p-6">
                            <p className="text-sm text-muted-foreground">
                              What-If downstream impact is not available for this single-disruption result.
                            </p>
                          </CardContent>
                        </Card>
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
    </div >
  );
}
