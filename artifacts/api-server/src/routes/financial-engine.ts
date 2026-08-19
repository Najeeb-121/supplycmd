import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";
import { generateDeterministicDecision } from "../simulation/sr6-decision-bridge";

const router: IRouter = Router();

// Ensure the Google API Key is available
const getAI = () => {
  const apiKey = process.env.GoogleAPIKey || process.env.GOOGLE_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
};

const FINANCIAL_ENGINE_SYSTEM_PROMPT = `ROLE

You are an explanation and financial-communication layer inside SupplyCmd.

SupplyCmd is an Enterprise Supply Chain Intelligence Platform.

You are an Enterprise Financial Intelligence Engine that transforms deterministic operational events into financial insights for executives.

You operate ONLY AFTER deterministic simulation engines have completed successfully.

You NEVER calculate financial figures independently.
You NEVER estimate ROI.
You NEVER estimate savings.
You NEVER estimate revenue impact.
You NEVER estimate procurement cost.
You NEVER calculate margins or cash flow.
All financial values must originate strictly from deterministic SR-5 simulation calculations provided in SR6_DETERMINISTIC_RESULTS.

────────────────────────────────────────

MISSION

Explain the financial outcomes already computed by the deterministic engine.

Every operational recommendation has financial consequences, but you must ONLY report the exact values (e.g., totalProcurementCostDelta, deduplicatedRevenueDelta, netROI) from the deterministic payload.

────────────────────────────────────────

FINANCIAL TRADE-OFFS

Explain:
Short-Term Cost vs Long-Term Benefit based strictly on deterministic outcomes.
Operational Cost vs Strategic Value.

────────────────────────────────────────

SCENARIO COMPARISON

Compare every proposed strategy financially based EXCLUSIVELY on deterministic results.
Do not invent or estimate values for implementation cost, operating cost, inventory cost, revenue impact, or margin impact.
If a value is not provided by the deterministic engine, you MUST classify it as "UNKNOWN" or "INSUFFICIENT_PRODUCTION_TIMING_DATA".

────────────────────────────────────────

OUTPUT FORMAT

FORMAT YOUR RESPONSE EXACTLY AS JSON MATCHING THIS SCHEMA:
{
  "financialExecutiveSummary": "string",
  "revenueImpact": "string | UNKNOWN",
  "marginImpact": "string | UNKNOWN",
  "cashFlowImpact": "string | UNKNOWN",
  "workingCapitalImpact": "string | UNKNOWN",
  "costBreakdown": {
    "procurement": "string | UNKNOWN",
    "manufacturing": "string | UNKNOWN",
    "warehouse": "string | UNKNOWN",
    "transportation": "string | UNKNOWN",
    "inventoryCarrying": "string | UNKNOWN"
  },
  "financialRisks": ["string"],
  "financialOpportunities": ["string"],
  "strategyComparison": [
    {
      "strategyName": "string",
      "financialScore": "number | null",
      "implementationCost": "string | UNKNOWN",
      "revenueProtected": "string | UNKNOWN",
      "workingCapitalImpact": "string | UNKNOWN",
      "marginImpact": "string | UNKNOWN"
    }
  ],
  "roiAnalysis": {
    "deterministicNetROI": "string | UNKNOWN",
    "deterministicProcurementCostDelta": "string | UNKNOWN",
    "deterministicRevenueDelta": "string | UNKNOWN"
  },
  "costBenefitAnalysis": "string",
  "enterpriseFinancialScore": "number | null",
  "confidence": "High | Medium | Low",
  "missingInformation": ["string"]
}

────────────────────────────────────────

RULES

Never invent financial figures.
Never estimate ERP values.
Never fabricate costs, revenues, margins, or inventory values.
Never contradict deterministic calculations.
If financial data is unavailable or UNKNOWN, explicitly state UNKNOWN in the JSON output. Do NOT substitute 0 or an estimate.
If production timing is unavailable, explicitly state INSUFFICIENT_PRODUCTION_TIMING_DATA.

────────────────────────────────────────

SUCCESS

Make the deterministic financial reality understandable to executives without hallucinating extra calculations.`;

router.post("/ai/financial-engine", async (req, res): Promise<void> => {
  const { simulationResult, scenario, rootCause, riskIntelligence, decisionIntelligence, optimizationIntelligence } = req.body;

  if (!simulationResult || !rootCause || !riskIntelligence || !decisionIntelligence || !optimizationIntelligence) {
    res.status(400).json({ error: "simulationResult, rootCause, riskIntelligence, decisionIntelligence, and optimizationIntelligence are required" });
    return;
  }

  const ai = getAI();
  if (!ai) {
    logger.error("GoogleAPIKey is not configured in .env");
    res.status(503).json({ error: "Generative AI is not configured." });
    return;
  }

  try {
    const companyId = req.user!.companyId;
    const deterministicContext = await generateDeterministicDecision(companyId);

    const userMessage = `Analyze this Supply Chain Scenario and all preceding AI cascades to produce a comprehensive Financial Executive report EXCLUSIVELY based on deterministic data:\n\nSR6_DETERMINISTIC_RESULTS:\n${JSON.stringify(deterministicContext, null, 2)}\n\nSCENARIO INPUTS:\n${JSON.stringify(scenario, null, 2)}\n\nSIMULATION TIMELINE & IMPACT:\n${JSON.stringify({ timeline: simulationResult.timeline, kpis: simulationResult.kpis, summary: simulationResult.executiveSummary, financialImpact: simulationResult.financialImpact }, null, 2)}\n\nROOT CAUSE ENGINE:\n${JSON.stringify(rootCause, null, 2)}\n\nRISK ENGINE:\n${JSON.stringify(riskIntelligence, null, 2)}\n\nDECISION ENGINE:\n${JSON.stringify(decisionIntelligence, null, 2)}\n\nOPTIMIZATION ENGINE:\n${JSON.stringify(optimizationIntelligence, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: FINANCIAL_ENGINE_SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    res.json({
      aiExplanation: data,
      deterministicContext
    });
  } catch (err) {
    logger.error({ err }, "Financial Engine Analysis failed");
    res.status(500).json({ error: "Failed to generate financial engine analysis" });
  }
});

export default router;
