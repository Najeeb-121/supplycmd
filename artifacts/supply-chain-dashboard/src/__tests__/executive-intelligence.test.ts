import { describe, it, expect } from "vitest";
import { computeExecState } from "../services/executive-intelligence";
import type { DecisionEngineState } from "../services/ai-decision-engine";

describe("executive-intelligence Phase 3", () => {
  it("maps deterministic values directly without fabricating", () => {
    const mockOps: any = { kpis: [], healthScore: 90 };
    const mockEngine: DecisionEngineState = {
      recommendations: [
        {
          id: "1",
          type: "mock",
          priority: "high",
          title: "Mock",
          recommendation: "Mock",
          businessImpact: "Mock",
          estimatedSavings: 1500, // Explicitly defined, not fabricated by UI
          confidenceScore: 100,
          reasoning: "Mock",
          affectedDepartment: "Supply Chain",
          status: "new",
          generatedAt: new Date(),
          sourceEntity: "Mock",
          dataPoints: []
        }
      ],
      deterministicContext: {
        baselineExposures: [
          {
            exposureType: "SUPPLIER_RISK",
            description: "Mock exposure",
            affectedSalesOrders: ["SO1"],
            financialImpact: 50000
          }
        ]
      },
      lastAnalysedAt: new Date(),
      cycleCount: 1,
      totalEstimatedSavings: 1500,
      modelVersion: "test",
      analysisStatus: "complete"
    };

    const state = computeExecState({} as any, mockOps, mockEngine, 1);

    expect(state.todaysRisks[0].financialExposure).toBe(50000); // Mapped exactly
    expect(state.opportunityValue).toBe(1500); // Passed from engine
    expect(state.riskScore).toBe("UNKNOWN"); // Not fabricated
    expect(state.financialSummary.budgetTarget).toBe("UNKNOWN");
    expect(state.financialSummary.achievementPct).toBe("UNKNOWN");
  });

  it("preserves UNKNOWN gracefully", () => {
    const mockOps: any = { kpis: [], healthScore: 90 };
    const mockEngine: DecisionEngineState = {
      recommendations: [],
      deterministicContext: {
        baselineExposures: [
          {
            exposureType: "SUPPLIER_RISK",
            description: "Mock exposure",
            affectedSalesOrders: ["SO1"],
            financialImpact: "UNKNOWN"
          }
        ]
      },
      lastAnalysedAt: new Date(),
      cycleCount: 1,
      totalEstimatedSavings: "UNKNOWN",
      modelVersion: "test",
      analysisStatus: "complete"
    };

    const state = computeExecState({} as any, mockOps, mockEngine, 1);

    expect(state.todaysRisks[0].financialExposure).toBe("UNKNOWN");
    expect(state.opportunityValue).toBe("UNKNOWN");
  });
});
