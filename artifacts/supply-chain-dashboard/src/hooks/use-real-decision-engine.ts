import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  DecisionEngineState,
  Recommendation,
  RecommendationStatus,
  RecommendationPriority,
  DeterministicAIContext
} from "@/services/ai-decision-engine";

export function useRealDecisionEngine() {
  const [statusOverrides, setStatusOverrides] = useState<Record<string, RecommendationStatus>>({});

  const setStatus = (id: string, status: RecommendationStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: status }));
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["decision-engine"],
    queryFn: async () => {
      const res = await fetch("/api/ai/decision-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulationResult: {},
          scenario: {},
          rootCause: {},
          riskIntelligence: {}
        })
      });
      if (!res.ok) throw new Error("Failed to fetch decision engine data");
      return res.json() as Promise<{ aiExplanation: any; deterministicContext: DeterministicAIContext }>;
    },
    refetchInterval: 30_000
  });

  const engine: DecisionEngineState = (() => {
    if (!data || !data.deterministicContext) {
      return {
        recommendations: [],
        lastAnalysedAt: new Date(),
        totalEstimatedSavings: "UNKNOWN",
        modelVersion: "SR-6 Deterministic Bridge",
        analysisStatus: isFetching ? "analysing" : "idle",
        deterministicContext: null
      };
    }

    const recs: Recommendation[] = data.deterministicContext.candidateMitigations.map((mit) => {
      const exposure = data.deterministicContext.baselineExposures.find(
        (exp) => exp.targetProductId === mit.targetProductId
      );

      const priority: RecommendationPriority =
        exposure?.severity === "CRITICAL"
          ? "critical"
          : exposure?.severity === "HIGH"
            ? "high"
            : exposure?.severity === "MEDIUM"
              ? "medium"
              : "high";

      return {
        id: mit.id,
        type: mit.type,
        priority,
        title: mit.title,
        recommendation: mit.reason,
        businessImpact:
          mit.targetProductId !== undefined
            ? `Mitigates supply risk for product ${mit.targetProductId}.`
            : "Mitigates a deterministic supply-chain risk.",
        estimatedSavings:
          data.deterministicContext.portfolioResult?.deduplicatedRevenueDelta ?? "UNKNOWN",
        confidenceScore: "UNKNOWN",
        reasoning: mit.reason,
        affectedDepartment: "Supply Chain",
        status: statusOverrides[mit.id] ?? "new",
        generatedAt: new Date(),
        sourceEntity: "SR-6 Bridge",
        dataPoints: [
          {
            label: "Target Product",
            value:
              mit.targetProductId !== undefined
                ? String(mit.targetProductId)
                : "UNKNOWN"
          },
          {
            label: "Target Supplier",
            value:
              mit.targetSupplierName ||
              (mit.targetSupplierId !== undefined
                ? String(mit.targetSupplierId)
                : "UNKNOWN")
          },
          {
            label: "Mitigation Cost",
            value:
              mit.mitigationCostProvenance === "CALCULATED" &&
                mit.mitigationCost !== undefined
                ? String(mit.mitigationCost)
                : "UNKNOWN"
          },
          {
            label: "Mitigation Date",
            value: mit.mitigationDate ?? "UNKNOWN"
          }
        ]
      };
    });

    const totalEstimatedSavings = data.deterministicContext.portfolioResult?.deduplicatedRevenueDelta ?? "UNKNOWN";

    return {
      recommendations: recs,
      lastAnalysedAt: new Date(),
      totalEstimatedSavings,
      modelVersion: "SR-6 Deterministic Bridge",
      analysisStatus: isFetching ? "analysing" : "complete",
      deterministicContext: data.deterministicContext
    };
  })();

  const refetchAll = () => {
    refetch();
  };

  return { engine, isFetching, refetchAll, setStatus };
}
