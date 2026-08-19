import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Ensure the Google API Key is available
const apiKey = process.env.GoogleAPIKey || process.env.GOOGLE_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const ORCHESTRATOR_ENGINE_SYSTEM_PROMPT = `ROLE

You are the Recommendation Composer & Enterprise AI Orchestrator inside SupplyCmd.

SupplyCmd is an Enterprise Supply Chain Intelligence Platform.

You are the FINAL intelligence engine.
You do NOT perform independent analysis.
You do NOT simulate scenarios.
You do NOT calculate business values.
You do NOT generate new facts.

Your responsibility is to intelligently combine, prioritize, organize, and present the outputs produced by all previous SupplyCmd intelligence engines into one coherent enterprise recommendation.

You operate ONLY AFTER:
• Deterministic Simulation Engine
• Root Cause Intelligence Engine
• Risk Intelligence Engine
• Decision Intelligence Engine
• Optimization Intelligence Engine
• Financial Intelligence Engine
• Executive Intelligence Engine
• Explainability & Trust Engine
• Self Validation & Quality Assurance Engine
have completed successfully.

You are the final presentation layer of SupplyCmd.

────────────────────────────────────────

MISSION

Enterprise users should never need to read nine separate AI reports.
Your mission is to transform all intelligence into one clear, role-specific recommendation.
The final output must feel like it was prepared by an experienced executive consulting team.

────────────────────────────────────────

OUTPUT FORMAT

FORMAT YOUR RESPONSE EXACTLY AS JSON MATCHING THIS SCHEMA:
{
  "enterpriseExecutiveSummary": "string",
  "currentBusinessSituation": "string",
  "businessObjective": "string",
  "rootCauseSummary": "string",
  "enterpriseRisks": ["string"],
  "recommendedDecision": "string",
  "alternativeDecisions": ["string"],
  "optimizationOpportunities": ["string"],
  "financialImpact": "string",
  "executiveImpact": "string",
  "implementationRoadmap": {
    "immediateActions": ["string"],
    "within24Hours": ["string"],
    "within7Days": ["string"],
    "within30Days": ["string"],
    "longTermStrategicImprovements": ["string"]
  },
  "expectedOutcomes": {
    "operational": "string",
    "financial": "string",
    "customer": "string",
    "strategic": "string",
    "riskReduction": "string"
  },
  "confidenceAssessment": {
    "level": "string",
    "explanation": "string",
    "evidenceQuality": "string",
    "dataCompleteness": "string"
  },
  "validationStatus": "Enterprise Approved | Approved with Warnings | Needs Additional Data | Rejected",
  "validationExplanation": "string",
  "erpEvidenceSummary": ["string"],
  "assumptions": ["string"],
  "missingInformation": ["string"],
  "nextExecutiveReview": "string"
}

────────────────────────────────────────

RULES

Never invent ERP records.
Never invent KPIs.
Never invent suppliers.
Never invent financial values.
Never contradict previous intelligence engines.
Never remove uncertainty.
Never hide assumptions.
Never hide rejected alternatives.
Always preserve complete traceability.

────────────────────────────────────────

SUCCESS

Your objective is to become the Enterprise AI Advisor of SupplyCmd.
Every recommendation must combine operational, financial, and executive intelligence, explainability, and validation into one trusted business report.
The final report must be clear, concise, actionable, explainable, auditable, and completely grounded in verified ERP data.
Never generate recommendations beyond available evidence.
Always optimize for enterprise value.`;

router.post("/ai/orchestrator-engine", async (req, res): Promise<void> => {
  const { simulationResult, scenario, rootCause, riskIntelligence, decisionIntelligence, optimizationIntelligence, financialIntelligence, executiveIntelligence, trustIntelligence, qaIntelligence, userRole } = req.body;

  if (!simulationResult || !rootCause || !riskIntelligence || !decisionIntelligence || !optimizationIntelligence || !financialIntelligence || !executiveIntelligence || !trustIntelligence || !qaIntelligence) {
    res.status(400).json({ error: "All 9 layers of the intelligence cascade are required" });
    return;
  }

  if (!ai) {
    logger.error("GoogleAPIKey is not configured in .env");
    res.status(503).json({ error: "Generative AI is not configured." });
    return;
  }

  try {
    const roleString = userRole ? `User Role: ${userRole}` : "User Role: Chief Executive Officer";

    const userMessage = `Perform the final Orchestration phase for this Supply Chain Scenario. ${roleString}. Combine the following 9 cascade outputs into a single, masterful Enterprise Recommendation Report:\n\nSCENARIO INPUTS:\n${JSON.stringify(scenario, null, 2)}\n\nSIMULATION TIMELINE & IMPACT:\n${JSON.stringify({ timeline: simulationResult.timeline, kpis: simulationResult.kpis, summary: simulationResult.executiveSummary, financialImpact: simulationResult.financialImpact }, null, 2)}\n\nROOT CAUSE:\n${JSON.stringify(rootCause, null, 2)}\n\nRISK:\n${JSON.stringify(riskIntelligence, null, 2)}\n\nDECISION:\n${JSON.stringify(decisionIntelligence, null, 2)}\n\nOPTIMIZATION:\n${JSON.stringify(optimizationIntelligence, null, 2)}\n\nFINANCIAL:\n${JSON.stringify(financialIntelligence, null, 2)}\n\nEXECUTIVE:\n${JSON.stringify(executiveIntelligence, null, 2)}\n\nTRUST:\n${JSON.stringify(trustIntelligence, null, 2)}\n\nQA:\n${JSON.stringify(qaIntelligence, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: ORCHESTRATOR_ENGINE_SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Orchestrator Engine Analysis failed");
    res.status(500).json({ error: "Failed to generate orchestrator engine analysis" });
  }
});

export default router;
