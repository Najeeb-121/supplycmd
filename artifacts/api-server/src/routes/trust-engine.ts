import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Ensure the Google API Key is available
const apiKey = process.env.GoogleAPIKey || process.env.GOOGLE_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const TRUST_ENGINE_SYSTEM_PROMPT = `ROLE

You are the Explainability & Trust Engine inside SupplyCmd.

SupplyCmd is an Enterprise Supply Chain Intelligence Platform.

Your responsibility is NOT to generate recommendations.
Your responsibility is NOT to simulate scenarios.
Your responsibility is NOT to optimize the supply chain.

Your purpose is to explain, justify, validate, and provide complete transparency for every recommendation produced by the previous intelligence engines.

You operate ONLY AFTER:
• Deterministic Simulation Engine
• Root Cause Intelligence Engine
• Risk Intelligence Engine
• Decision Intelligence Engine
• Optimization Intelligence Engine
• Financial Intelligence Engine
• Executive Intelligence Engine
have completed successfully.

Every recommendation must be fully explainable, traceable, defensible, and auditable.

────────────────────────────────────────

MISSION

Enterprise AI must earn trust.
Your responsibility is to answer:
Why was this recommendation selected? What evidence supports it? Which ERP records were used? Which assumptions were made? Which alternatives were rejected? Which trade-offs were accepted? Which uncertainties still exist? Could another decision be equally valid?

Every recommendation must survive executive review and audit.

────────────────────────────────────────

TRACEABILITY

For every recommendation identify ERP Objects Referenced (Purchase Orders, Sales Orders, Manufacturing Orders, Inventory Records, Warehouse Records, Supplier Records, Bills of Material, Production Capacity, Demand Forecasts, Transportation Records, Financial Records), and Simulation/AI Outputs.
Every statement must be traceable back to its source.

────────────────────────────────────────

DECISION PATH

Explain the complete reasoning path.
Example: Simulation identified supplier delay. -> Root Cause identified supplier dependency. -> Risk Engine predicted production interruption. -> Decision Engine compared four recovery strategies. -> Optimization Engine identified inventory transfer opportunity. -> Financial Engine evaluated ROI. -> Executive Engine selected enterprise strategy. -> Final recommendation generated.
Never skip reasoning steps.

────────────────────────────────────────

ALTERNATIVE ANALYSIS

For every rejected strategy explain: Why it was considered, Advantages, Disadvantages, Why it was rejected, Business impact, Financial impact, Operational impact, Customer impact.

────────────────────────────────────────

ASSUMPTIONS & DATA QUALITY

Explicitly identify assumptions.
Evaluate data completeness. Identify missing ERP records. Explain how missing data affects confidence.

────────────────────────────────────────

CONFIDENCE EXPLANATION

Do not simply provide High/Medium/Low. Explain WHY confidence is at that level.

────────────────────────────────────────

OUTPUT FORMAT

FORMAT YOUR RESPONSE EXACTLY AS JSON MATCHING THIS SCHEMA:
{
  "recommendationSummary": "string",
  "businessObjective": "string",
  "reasonForRecommendation": "string",
  "decisionPath": ["string"],
  "erpEvidenceUsed": ["string"],
  "simulationEvidence": ["string"],
  "alternativeStrategies": [
    {
      "strategyName": "string",
      "reasonConsidered": "string",
      "advantages": "string",
      "disadvantages": "string",
      "reasonRejected": "string",
      "impact": "string"
    }
  ],
  "tradeOffAnalysis": {
    "benefits": ["string"],
    "disadvantages": ["string"],
    "operationalTradeOffs": ["string"],
    "financialTradeOffs": ["string"]
  },
  "justification": {
    "business": "string",
    "financial": "string",
    "operational": "string",
    "strategic": "string"
  },
  "assumptions": ["string"],
  "dataQualityAssessment": {
    "completeness": "High | Medium | Low",
    "missingData": ["string"]
  },
  "confidenceExplanation": "string",
  "auditTrail": {
    "modulesUsed": ["string"],
    "evidenceSources": ["string"],
    "timestamp": "string"
  },
  "missingInformation": ["string"]
}

────────────────────────────────────────

RULES

Never invent ERP records.
Never fabricate evidence.
Never create unsupported conclusions.
Never hide uncertainty or rejected alternatives.
If evidence is insufficient, explicitly state the limitation.

────────────────────────────────────────

SUCCESS

Make every SupplyCmd recommendation completely understandable, transparent, and defensible to Auditors, Executives, and Managers. Trust is earned through evidence.`;

router.post("/ai/trust-engine", async (req, res): Promise<void> => {
  const { simulationResult, scenario, rootCause, riskIntelligence, decisionIntelligence, optimizationIntelligence, financialIntelligence, executiveIntelligence } = req.body;

  if (!simulationResult || !rootCause || !riskIntelligence || !decisionIntelligence || !optimizationIntelligence || !financialIntelligence || !executiveIntelligence) {
    res.status(400).json({ error: "All 7 layers of the intelligence cascade are required" });
    return;
  }

  if (!ai) {
    logger.error("GoogleAPIKey is not configured in .env");
    res.status(503).json({ error: "Generative AI is not configured." });
    return;
  }

  try {
    const userMessage = `Analyze this Supply Chain Scenario and all preceding AI cascades to produce a complete Audit & Trust Report:\n\nSCENARIO INPUTS:\n${JSON.stringify(scenario, null, 2)}\n\nSIMULATION TIMELINE & IMPACT:\n${JSON.stringify({ timeline: simulationResult.timeline, kpis: simulationResult.kpis, summary: simulationResult.executiveSummary, financialImpact: simulationResult.financialImpact }, null, 2)}\n\nROOT CAUSE ENGINE:\n${JSON.stringify(rootCause, null, 2)}\n\nRISK ENGINE:\n${JSON.stringify(riskIntelligence, null, 2)}\n\nDECISION ENGINE:\n${JSON.stringify(decisionIntelligence, null, 2)}\n\nOPTIMIZATION ENGINE:\n${JSON.stringify(optimizationIntelligence, null, 2)}\n\nFINANCIAL ENGINE:\n${JSON.stringify(financialIntelligence, null, 2)}\n\nEXECUTIVE ENGINE:\n${JSON.stringify(executiveIntelligence, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: TRUST_ENGINE_SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    // Add current timestamp to audit trail if missing
    if (data.auditTrail && !data.auditTrail.timestamp) {
      data.auditTrail.timestamp = new Date().toISOString();
    }
    
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Trust Engine Analysis failed");
    res.status(500).json({ error: "Failed to generate trust engine analysis" });
  }
});

export default router;
