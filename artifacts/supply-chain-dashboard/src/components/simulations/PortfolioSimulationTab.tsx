import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, TrendingUp, TrendingDown, DollarSign, ListTodo, FileWarning } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function PortfolioSimulationTab() {
  const { toast } = useToast();
  const [mitigations, setMitigations] = useState<any[]>([]);
  
  // Dummy data for mitigation options since UI was just basic
  const addMitigation = () => {
    setMitigations([...mitigations, { id: `m-${Date.now()}`, type: "SUPPLIER_SWITCH", quantity: 100 }]);
  };
  const removeMitigation = (id: string) => {
    setMitigations(mitigations.filter(m => m.id !== id));
  };

  const { data: result, isPending, mutate: runSimulation, error } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/simulation/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineSnapshotId: "CURRENT", // SR-5 uses 'CURRENT' for realtime extraction
          mitigations
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to run portfolio simulation");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portfolio Simulation Complete", description: "Successfully ran deterministic simulation loop." });
    },
    onError: (err: any) => {
      toast({ title: "Simulation Error", description: err.message, variant: "destructive" });
    }
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
      {/* LEFT PANEL: SCENARIO BUILDER */}
      <div className="md:col-span-3 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Baseline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                SR-5 evaluates the entire portfolio across all active relationships, BOMs, and demand streams.
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Mitigations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mitigations.map((m, i) => (
              <div key={m.id} className="flex justify-between items-center p-2 bg-muted rounded-md text-sm">
                <span>Switch +{m.quantity}</span>
                <Button variant="ghost" size="sm" onClick={() => removeMitigation(m.id)}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={addMitigation}>+ Add Mitigation</Button>
            
            <div className="pt-4 border-t">
              <Button 
                className="w-full" 
                onClick={() => runSimulation()} 
                disabled={isPending}
              >
                {isPending ? "Running..." : "Run Portfolio Simulation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT PANEL: RESULTS */}
      <div className="md:col-span-9 space-y-6">
        {!result && !isPending && !error && (
          <Card className="h-full flex items-center justify-center bg-muted/20 border-dashed">
            <CardContent className="flex flex-col items-center py-20 text-muted-foreground">
              <ListTodo className="w-12 h-12 mb-4 opacity-50" />
              <p>Configure mitigations and run the portfolio simulation.</p>
            </CardContent>
          </Card>
        )}

        {isPending && (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="flex flex-col items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p>Computing deterministic portfolio outcome...</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-red-500 border-2">
            <CardContent className="p-6">
               <h2 className="text-xl font-bold flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-6 h-6" /> Simulation Failed
               </h2>
               <p className="mt-2 text-muted-foreground">{error.message}</p>
            </CardContent>
          </Card>
        )}

        {result && !isPending && (
          <>
            <Card className="border-l-4 border-l-primary">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-green-500" /> Portfolio Optimization Results
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  {/* Revenue */}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Revenue Delta</p>
                    <p className="text-3xl font-bold">
                      {result.deduplicatedRevenueDelta === "UNKNOWN" 
                        ? <span className="text-yellow-500 flex items-center gap-2"><FileWarning className="w-5 h-5"/> UNKNOWN</span>
                        : `$${result.deduplicatedRevenueDelta.toLocaleString()}`}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Provenance: {result.provenance?.revenue || "CALCULATED"}
                    </Badge>
                  </div>
                  
                  {/* Cost */}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Procurement Cost Delta</p>
                    <p className="text-3xl font-bold">
                      {result.totalProcurementCostDelta === "UNKNOWN"
                         ? <span className="text-yellow-500 flex items-center gap-2"><FileWarning className="w-5 h-5"/> UNKNOWN</span>
                         : `$${result.totalProcurementCostDelta.toLocaleString()}`}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Provenance: {result.provenance?.cost || "CALCULATED"}
                    </Badge>
                  </div>
                  
                  {/* ROI */}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Net ROI</p>
                    <p className={`text-3xl font-bold ${result.netROI !== 'UNKNOWN' && result.netROI > 0 ? 'text-green-500' : ''}`}>
                      {result.netROI === "UNKNOWN"
                         ? <span className="text-yellow-500 flex items-center gap-2"><FileWarning className="w-5 h-5"/> UNKNOWN</span>
                         : `$${result.netROI.toLocaleString()}`}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Provenance: {result.provenance?.roi || "CALCULATED"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Action Execution Traces */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Action Execution Traces</CardTitle>
                </CardHeader>
                <CardContent>
                  {result.actionExecutionTraces?.length > 0 ? (
                    <div className="space-y-4">
                      {result.actionExecutionTraces.map((trace: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-muted rounded-md border">
                           <div>
                             <p className="font-semibold">{trace.type}</p>
                             <p className="text-sm text-muted-foreground text-xs uppercase mt-1">
                               {trace.wasSkipped ? <span className="text-yellow-500">SKIPPED</span> : <span className="text-green-500">EXECUTED</span>}
                             </p>
                           </div>
                           <div className="text-right text-sm space-y-1">
                             <p>Qty: {trace.executedQuantity}</p>
                             <p>Cost: {trace.executedCost === "UNKNOWN" ? <span className="text-yellow-500 font-bold">UNKNOWN</span> : `$${trace.executedCost}`}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No mitigation actions evaluated.</p>
                  )}
                </CardContent>
              </Card>

              {/* Affected Sales Orders */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Affected Sales Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  {result.affectedSalesOrders?.length > 0 ? (
                    <div className="space-y-3">
                      {result.affectedSalesOrders.map((so: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 border-b last:border-0">
                           <span className="font-medium">SO-{so.salesOrderId}</span>
                           <div className="flex gap-4">
                             <span className="text-muted-foreground text-sm">Missed: {so.missedQuantity}</span>
                             <Badge variant="secondary" className="text-xs">{so.provenance}</Badge>
                           </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No sales orders affected.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
