import { RiskExposure, RiskMitigation } from "./supply-risk-contracts";
import { PortfolioCompositionResult } from "./portfolio-contracts";

/**
 * SR-6 AI Input Contract
 * 
 * Defines the strict, deterministic payload passed to AI models
 * prior to prompt generation. Guarantees that Gemini only operates
 * on verified ground-truth values.
 */
export interface DeterministicAIContext {
  baselineRiskDetected: boolean;
  baselineExposures: RiskExposure[];
  contingencyExposures: RiskExposure[];
  candidateMitigations: RiskMitigation[];
  contingencyMitigations: RiskMitigation[];
  portfolioResult: PortfolioCompositionResult | null;
  provenance: {
    mitigationGeneration: "DETERMINISTIC";
    financialSimulation: "DETERMINISTIC";
  };
}
