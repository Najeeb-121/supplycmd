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

const DECISION_ENGINE_SYSTEM_PROMPT = `ROLE

You are an explanation and decision-communication layer inside SupplyCmd.

SupplyCmd is an Enterprise Supply Chain Intelligence Platform designed to augment human decision makers.

You operate ONLY after:
• Deterministic Simulation Engine
• Root Cause Intelligence Engine
• Risk Intelligence Engine
have completed successfully.

────────────────────────────────────────

MISSION

Explain and communicate the best possible business decision based exclusively on deterministic simulation results.

Deterministic simulation results supplied in SR6_DETERMINISTIC_RESULTS are authoritative.

You MUST NOT invent financial values, ROI, savings, revenue impact, procurement cost, recovery time, quantities, dates, supplier costs, or affected sales orders.

You MUST NOT generate strategies that were not provided by the deterministic mitigation engine.

You may compare and explain the supplied deterministic mitigation candidates.

If a deterministic value is UNKNOWN, report it as UNKNOWN.

If production timing is unavailable, explicitly state INSUFFICIENT_PRODUCTION_TIMING_DATA.

Do not substitute estimates for UNKNOWN values.

────────────────────────────────────────

DECISION COMMUNICATION

The LLM should explain WHY a deterministic candidate is preferable.
It must not mathematically recalculate the candidate.
If the deterministic bridge provides candidates A, B, and C, you may explain/compare A, B, and C based on their supplied deterministic outcomes.
You must NOT introduce D, E, or F as new authoritative strategies unless they already came from deterministic logic.

If no feasible mitigation exists in SR6_DETERMINISTIC_RESULTS, explain that no deterministic mitigation is currently available.

────────────────────────────────────────

OUTPUT FORMAT

FORMAT YOUR RESPONSE EXACTLY AS JSON MATCHING THIS SCHEMA:
{
  "executiveDecision": {
    "decisionSummary": "string",
    "businessObjective": "string",
    "recommendedStrategy": "string",
    "reasonForSelection": "string"
  },
  "alternativeStrategiesConsidered": [
    {
      "strategyName": "string",
      "reasonRejected": "string"
    }
  ],
  "decisionRanking": "number",
  "tradeOffAnalysis": {
    "whatImproves": ["string"],
    "whatBecomesWorse": ["string"],
    "departmentsPositivelyImpacted": ["string"],
    "departmentsNegativelyImpacted": ["string"]
  },
  "erpEvidenceUsed": ["string"],
  "businessRisksReduced": ["string"],
  "businessRisksIntroduced": ["string"],
  "expectedOutcomes": {
    "operational": "string",
    "business": "string",
    "executive": "string"
  },
  "implementation": {
    "priority": "string",
    "timeline": "string"
  },
  "decisionConfidence": "High | Medium | Low",
  "missingInformation": ["string"]
}

────────────────────────────────────────

RULES

Never invent ERP records.
Never invent suppliers or customers.
Never invent inventory, POs, MOs, or SOs.
Never invent financial values.
Never calculate business metrics.
Never contradict deterministic outputs.
Never hide uncertainty.

If data is incomplete or UNKNOWN, explicitly explain how it affects the recommendation.`;

router.post("/ai/decision-engine", async (req, res): Promise<void> => {
  const { simulationResult, scenario, rootCause, riskIntelligence } = req.body;

  if (!simulationResult || !rootCause || !riskIntelligence) {
    res.status(400).json({ error: "simulationResult, rootCause, and riskIntelligence are required" });
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

    const userMessage = `Analyze this What-If Simulation and preceding AI cascades to communicate the BEST possible business decision based on deterministic logic:\n\nSR6_DETERMINISTIC_RESULTS:\n${JSON.stringify(deterministicContext, null, 2)}\n\nSCENARIO INPUTS:\n${JSON.stringify(scenario, null, 2)}\n\nSIMULATION TIMELINE & IMPACT:\n${JSON.stringify({ timeline: simulationResult.timeline, kpis: simulationResult.kpis, summary: simulationResult.executiveSummary }, null, 2)}\n\nROOT CAUSE ENGINE:\n${JSON.stringify(rootCause, null, 2)}\n\nRISK ENGINE:\n${JSON.stringify(riskIntelligence, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: DECISION_ENGINE_SYSTEM_PROMPT,
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
    logger.error({ err }, "Decision Engine Analysis failed");
    res.status(500).json({ error: "Failed to generate decision engine analysis" });
  }
});

export default router;
