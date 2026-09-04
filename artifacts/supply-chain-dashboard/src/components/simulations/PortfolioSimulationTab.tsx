import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, ListTodo, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRealDecisionEngine } from "@/hooks/use-real-decision-engine";
import type { DeterministicAIContext } from "@/services/ai-decision-engine";

type CandidateMitigation =
  DeterministicAIContext["candidateMitigations"][number];

const EXECUTABLE_MITIGATION_TYPES = new Set<CandidateMitigation["type"]>([
  "COVER_FROM_AVAILABLE_STOCK",
  "FOLLOW_UP_INBOUND",
  "ALTERNATE_SUPPLIER",
]);
type PortfolioSimulationResult = {
  totalProcurementCostDelta: number | "UNKNOWN";
  deduplicatedRevenueDelta: number | "UNKNOWN";
  netROI: number | "UNKNOWN";
  actionExecutionTraces: Array<{
    mitigationId: string;
    type: string;
    executedQuantity: number;
    executedCost: number | "UNKNOWN";
    wasSkipped: boolean;
  }>;
  affectedSalesOrders: Array<{
    salesOrderId: number;
    missedQuantity: number;
    provenance: "SIMULATION_ALLOCATED";
  }>;
  provenance: {
    revenue: "CALCULATED" | "UNKNOWN";
    cost: "CALCULATED" | "UNKNOWN";
    roi: "CALCULATED" | "UNKNOWN";
  };
};
export default function PortfolioSimulationTab() {
  const { toast } = useToast();
  const { engine, isFetching: isDecisionFetching, isError: isDecisionError } =
    useRealDecisionEngine();

  const [mitigations, setMitigations] = useState<CandidateMitigation[]>([]);

  const executableCandidates = useMemo(
    () =>
      engine.deterministicContext?.candidateMitigations.filter(
        (mitigation) =>
          mitigation.feasible &&
          mitigation.targetProductId !== undefined &&
          EXECUTABLE_MITIGATION_TYPES.has(mitigation.type)
      ) ?? [],
    [engine.deterministicContext?.candidateMitigations]
  );

  useEffect(() => {
    setMitigations((current) =>
      current.flatMap((selected) => {
        const refreshed = executableCandidates.find(
          (candidate) => candidate.id === selected.id
        );

        return refreshed ? [refreshed] : [];
      })
    );
  }, [executableCandidates]);

  const availableCandidates = executableCandidates.filter(
    (candidate) =>
      !mitigations.some((selected) => selected.id === candidate.id)
  );

  const addMitigation = () => {
    const nextCandidate = availableCandidates[0];
    if (!nextCandidate) return;

    setMitigations((current) => [...current, nextCandidate]);
  };

  const removeMitigation = (id: string) => {
    setMitigations((current) =>
      current.filter((mitigation) => mitigation.id !== id)
    );
  };

  const {
    data: result,
    isPending,
    mutate: runSimulation,
    error,
    reset: resetSimulation,
  } =
    useMutation<PortfolioSimulationResult, Error>({
      mutationFn: async () => {
        const res = await fetch("/api/simulation/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baselineSnapshotId: "CURRENT", // Use the current ERP-backed baseline snapshot
            mitigations
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || "Failed to run portfolio simulation");
        }

        return res.json() as Promise<PortfolioSimulationResult>;
      },
      onSuccess: () => {
        toast({ title: "Portfolio Simulation Complete", description: "Successfully ran deterministic simulation loop." });
      },
      onError: (err: any) => {
        toast({ title: "Simulation Error", description: err.message, variant: "destructive" });
      }
    });

  useEffect(() => {
    resetSimulation();
  }, [mitigations, resetSimulation]);

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
                SR-6 evaluates the current portfolio across active supply relationships, BOMs, and demand streams.
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
                <span>
                  {m.title} - Qty: {m.affectedQuantity}
                </span>
                <Button variant="ghost" size="sm" onClick={() => removeMitigation(m.id)}>Remove</Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={addMitigation}
              disabled={
                isDecisionFetching ||
                isDecisionError ||
                availableCandidates.length === 0
              }
            >
              {isDecisionFetching
                ? "Loading Deterministic Mitigations..."
                : isDecisionError
                  ? "Deterministic Mitigations Unavailable"
                  : availableCandidates.length > 0
                    ? "+ Add Deterministic Mitigation"
                    : "No More Executable Mitigations"}
            </Button>

            <div className="pt-4 border-t">
              <Button
                className="w-full"
                onClick={() => runSimulation()}
                disabled={isPending || mitigations.length === 0}
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
                  <CheckCircle2 className="w-6 h-6 text-green-500" /> Portfolio Simulation Results
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  {/* Revenue */}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Revenue Delta</p>
                    <p className="text-3xl font-bold">
                      {result.deduplicatedRevenueDelta === "UNKNOWN"
                        ? <span className="text-yellow-500 flex items-center gap-2"><FileWarning className="w-5 h-5" /> UNKNOWN</span>
                        : result.deduplicatedRevenueDelta.toLocaleString()}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Provenance: {result.provenance.revenue}
                    </Badge>
                  </div>

                  {/* Cost */}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Procurement Cost Delta</p>
                    <p className="text-3xl font-bold">
                      {result.totalProcurementCostDelta === "UNKNOWN"
                        ? <span className="text-yellow-500 flex items-center gap-2"><FileWarning className="w-5 h-5" /> UNKNOWN</span>
                        : result.totalProcurementCostDelta.toLocaleString()}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Provenance: {result.provenance.cost}
                    </Badge>
                  </div>

                  {/* ROI */}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Net Portfolio Impact</p>
                    <p className={`text-3xl font-bold ${result.netROI !== 'UNKNOWN' && result.netROI > 0 ? 'text-green-500' : ''}`}>
                      {result.netROI === "UNKNOWN"
                        ? <span className="text-yellow-500 flex items-center gap-2"><FileWarning className="w-5 h-5" /> UNKNOWN</span>
                        : result.netROI.toLocaleString()}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      Provenance: {result.provenance.roi}
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
                      {result.actionExecutionTraces.map((trace, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-muted rounded-md border">
                          <div>
                            <p className="font-semibold">{trace.type}</p>
                            <p className="text-sm text-muted-foreground text-xs uppercase mt-1">
                              {trace.wasSkipped ? <span className="text-yellow-500">SKIPPED</span> : <span className="text-green-500">EXECUTED</span>}
                            </p>
                          </div>
                          <div className="text-right text-sm space-y-1">
                            <p>Qty: {trace.executedQuantity}</p>
                            <p>
                              Cost:{" "}
                              {trace.executedCost === "UNKNOWN"
                                ? <span className="text-yellow-500 font-bold">UNKNOWN</span>
                                : trace.executedCost.toLocaleString()}
                            </p>
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
                      {result.affectedSalesOrders.map((so, idx) => (
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
