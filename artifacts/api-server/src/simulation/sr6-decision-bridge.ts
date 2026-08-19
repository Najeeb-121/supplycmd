import { SupplyRiskSnapshot, RiskMitigation, RiskExposure } from "./supply-risk-contracts";
import { PortfolioCompositionResult } from "./portfolio-contracts";
import { buildSupplyRiskSnapshot } from "./supply-risk-snapshot";
import { analyzeBufferDepletion } from "./supply-risk-engine";
import { generateMitigations } from "./supply-risk-mitigation";
import { simulatePortfolio } from "./portfolio-engine";

import { DeterministicAIContext } from "./sr6-ai-context";

/**
 * The SR-6 Decision Bridge Orchestrator.
 * Connects deterministic operational risks to the frozen SR-5 mathematical engine.
 */
export async function generateDeterministicDecision(companyId: number): Promise<DeterministicAIContext> {
  // 1. Build the real SupplyRiskSnapshot
  const { snapshot, priceLookup } = await buildSupplyRiskSnapshot(companyId);

  // 2. Consume EXISTING deterministic risk facts via the existing SupplyCMD risk detection architecture.
  let baselineRiskDetected = false;
  const baselineExposures: RiskExposure[] = [];
  const candidateMitigations: RiskMitigation[] = [];

  for (const productIdStr of Object.keys(snapshot.products)) {
    const productId = Number(productIdStr);
    
    // Evaluate the product through the existing risk engine for BUFFER_DEPLETION
    // This allows SR-6 to reuse the exact SR-3/SR-4 detection logic instead of 
    // creating a narrow, isolated detector.
    const exposure = analyzeBufferDepletion(snapshot, productId);
    
    if (exposure.severity === "HIGH" || exposure.severity === "CRITICAL") {
      baselineRiskDetected = true;
      baselineExposures.push(exposure);

      // 3. Generate candidate RiskMitigation[] using the EXISTING mitigation generator
      const mitigationResult = generateMitigations(snapshot, exposure);
      candidateMitigations.push(...mitigationResult.actions);
    }
  }

  // 4. Pass those candidates into the FROZEN simulatePortfolio()
  let portfolioResult: PortfolioCompositionResult | null = null;
  
  if (candidateMitigations.length > 0) {
    // We pass the real priceLookup down to simulatePortfolio so revenue can be calculated.
    portfolioResult = simulatePortfolio(snapshot, candidateMitigations, priceLookup);
  }

  // 5. Return the exact PortfolioCompositionResult and provenance
  return {
    baselineRiskDetected,
    baselineExposures,
    candidateMitigations,
    portfolioResult,
    provenance: {
      mitigationGeneration: "DETERMINISTIC",
      financialSimulation: "DETERMINISTIC"
    }
  };
}
