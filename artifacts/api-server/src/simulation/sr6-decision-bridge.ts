import { SupplyRiskSnapshot, RiskMitigation, RiskExposure } from "./supply-risk-contracts";
import { PortfolioCompositionResult } from "./portfolio-contracts";
import { buildSupplyRiskSnapshot } from "./supply-risk-snapshot";
import { analyzeBufferDepletion, analyzeSupplierFailure } from "./supply-risk-engine";
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
  const contingencyExposures: RiskExposure[] = [];
  const contingencyMitigations: RiskMitigation[] = [];
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
    const product = snapshot.products[productId];

    const inboundSupplierIds = Array.from(
      new Set(
        product.inboundPOs
          .filter((po) => po.currentlyInbound)
          .map((po) => po.supplierId)
      )
    );

    for (const supplierId of inboundSupplierIds) {
      const contingencyExposure = analyzeSupplierFailure(
        snapshot,
        supplierId,
        productId
      );

      if (
        contingencyExposure.affectedQuantity > 0 &&
        (contingencyExposure.severity === "HIGH" ||
          contingencyExposure.severity === "CRITICAL")
      ) {
        contingencyExposures.push(contingencyExposure);

        const contingencyResult = generateMitigations(
          snapshot,
          contingencyExposure
        );

        contingencyMitigations.push(...contingencyResult.actions);
      }
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
    contingencyExposures,
    contingencyMitigations,
    candidateMitigations,
    portfolioResult,
    provenance: {
      mitigationGeneration: "DETERMINISTIC",
      financialSimulation: "DETERMINISTIC"
    }
  };
}
