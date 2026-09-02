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
        baselineRiskDetected: true,
        baselineExposures: [
          {
            scenarioType: "BUFFER_DEPLETION",
            targetProductId: 100,
            affectedQuantity: 50,
            inventoryCoverage: 0,
            residualShortage: 50,
            canAbsorbWithBuffer: false,
            alternateSupplierAvailable: true,
            downstreamImpacts: {
              dependentProducts: [],
              delayedMOs: [],
              affectedSalesOrders: []
            },
            exposureReason: "Mock deterministic buffer exposure",
            inventoryCoveragePercent: 0,
            singleSupplierDependency: false,
            leadTimeVerified: true,
            capacityRisk: "UNKNOWN",
            currentlyInboundQuantity: 0,
            totalSupplierCount: 2,
            severity: "HIGH"
          }
        ],
        contingencyExposures: [],
        contingencyMitigations: [],
        candidateMitigations: [],
        portfolioResult: {
          totalProcurementCostDelta: 0,
          deduplicatedRevenueDelta: 1500,
          netROI: "UNKNOWN"
        },
        provenance: {
          mitigationGeneration: "DETERMINISTIC",
          financialSimulation: "DETERMINISTIC"
        }
      },
      lastAnalysedAt: new Date(),
      totalEstimatedSavings: 1500,
      modelVersion: "test",
      analysisStatus: "complete"
    };

    const state = computeExecState({} as any, mockOps, mockEngine);

    expect(state.todaysRisks[0].financialExposure).toBe("UNKNOWN"); // No financial exposure exists in the deterministic risk contract
    expect(state.todaysRisks[0].detail).toBe("Mock deterministic buffer exposure");
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
        baselineRiskDetected: true,
        baselineExposures: [
          {
            scenarioType: "BUFFER_DEPLETION",
            targetProductId: 100,
            affectedQuantity: 50,
            inventoryCoverage: 0,
            residualShortage: 50,
            canAbsorbWithBuffer: false,
            alternateSupplierAvailable: false,
            downstreamImpacts: {
              dependentProducts: [],
              delayedMOs: [],
              affectedSalesOrders: []
            },
            exposureReason: "Mock deterministic exposure with unknown financial impact",
            inventoryCoveragePercent: 0,
            singleSupplierDependency: true,
            leadTimeVerified: false,
            capacityRisk: "UNKNOWN",
            currentlyInboundQuantity: 0,
            totalSupplierCount: 1,
            severity: "HIGH"
          }
        ],
        contingencyExposures: [],
        contingencyMitigations: [],
        candidateMitigations: [],
        portfolioResult: null,
        provenance: {
          mitigationGeneration: "DETERMINISTIC",
          financialSimulation: "DETERMINISTIC"
        }
      },
      lastAnalysedAt: new Date(),
      totalEstimatedSavings: "UNKNOWN",
      modelVersion: "test",
      analysisStatus: "complete"
    };

    const state = computeExecState({} as any, mockOps, mockEngine);

    expect(state.todaysRisks[0].financialExposure).toBe("UNKNOWN");
    expect(state.opportunityValue).toBe("UNKNOWN");
  });
});
