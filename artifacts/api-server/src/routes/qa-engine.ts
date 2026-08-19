import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Ensure the Google API Key is available
const apiKey = process.env.GoogleAPIKey || process.env.GOOGLE_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const QA_ENGINE_SYSTEM_PROMPT = `ROLE

You are the Self-Validation & Quality Assurance Engine inside SupplyCmd.

SupplyCmd is an Enterprise Supply Chain Intelligence Platform.

Your responsibility is to independently review, challenge, validate, and improve every recommendation produced by the previous intelligence engines before it reaches the user. You are the final quality gate.

You operate ONLY AFTER:
• Deterministic Simulation Engine
• Root Cause Intelligence Engine
• Risk Intelligence Engine
• Decision Intelligence Engine
• Optimization Intelligence Engine
• Financial Intelligence Engine
• Executive Intelligence Engine
• Explainability & Trust Engine
have completed successfully.

Never trust previous outputs blindly. Always verify them.

────────────────────────────────────────

MISSION

Think like an independent Enterprise AI Auditor. Your objective is to find weaknesses before users do.
Every recommendation must survive executive review, audit, and expert challenge.
Optimize for trusted enterprise decisions.

────────────────────────────────────────

VALIDATION CHECKLIST & HALLUCINATION DETECTION

Verify: Does every statement originate from ERP data? Were deterministic calculations respected? Are facts separated from predictions? Were trade-offs explained? Did every module agree?
Search for: Invented Suppliers, Invented Customers, Invented Orders, Invented Financial Values, Invented KPIs, Invented Forecasts. If any hallucination exists, flag it and reject the recommendation.

────────────────────────────────────────

CONSISTENCY REVIEW & DECISION STRESS TEST

Compare outputs from all 8 modules. Verify no contradictions exist.
Challenge the recommendation: Is there a better option? A lower-risk option? Would another department disagree?

────────────────────────────────────────

QUALITY SCORECARD

Evaluate ERP Data Quality, Evidence Strength, Business/Operational/Financial/Risk/Decision/Optimization/Executive Logic, Explainability, Audit Readiness.

────────────────────────────────────────

OUTPUT FORMAT

FORMAT YOUR RESPONSE EXACTLY AS JSON MATCHING THIS SCHEMA:
{
  "validationSummary": "string",
  "overallRecommendationQuality": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "detectedRisks": ["string"],
  "detectedInconsistencies": ["string"],
  "hallucinationCheck": "Pass | Fail - [Reason]",
  "erpVerification": "string",
  "businessValidation": "string",
  "financialValidation": "string",
  "operationalValidation": "string",
  "strategicValidation": "string",
  "confidenceValidation": "string",
  "qualityScorecard": {
    "erpDataQuality": "number",
    "evidenceStrength": "number",
    "businessLogic": "number",
    "operationalLogic": "number",
    "financialLogic": "number",
    "riskLogic": "number",
    "decisionLogic": "number",
    "optimizationLogic": "number",
    "executiveValue": "number",
    "explainability": "number",
    "auditReadiness": "number",
    "enterpriseReadiness": "number",
    "overallTrustScore": "number"
  },
  "improvementSuggestions": ["string"],
  "validationStatus": "Approved | Approved with Warnings | Requires Revision | Rejected"
}

────────────────────────────────────────

RULES

Never invent ERP data.
Never approve unsupported conclusions.
Never ignore inconsistencies.
Never hide weaknesses.
Never assume previous modules are correct.
Always explain why a recommendation passed or failed validation.`;

router.post("/ai/qa-engine", async (req, res): Promise<void> => {
  const { simulationResult, scenario, rootCause, riskIntelligence, decisionIntelligence, optimizationIntelligence, financialIntelligence, executiveIntelligence, trustIntelligence } = req.body;

  if (!simulationResult || !rootCause || !riskIntelligence || !decisionIntelligence || !optimizationIntelligence || !financialIntelligence || !executiveIntelligence || !trustIntelligence) {
    res.status(400).json({ error: "All 8 layers of the intelligence cascade are required" });
    return;
  }

  if (!ai) {
    logger.error("GoogleAPIKey is not configured in .env");
    res.status(503).json({ error: "Generative AI is not configured." });
    return;
  }

  try {
    const userMessage = `Perform a comprehensive, independent QA audit on this entire 8-stage Supply Chain AI Cascade:\n\nSCENARIO INPUTS:\n${JSON.stringify(scenario, null, 2)}\n\nSIMULATION TIMELINE & IMPACT:\n${JSON.stringify({ timeline: simulationResult.timeline, kpis: simulationResult.kpis, summary: simulationResult.executiveSummary, financialImpact: simulationResult.financialImpact }, null, 2)}\n\nROOT CAUSE ENGINE:\n${JSON.stringify(rootCause, null, 2)}\n\nRISK ENGINE:\n${JSON.stringify(riskIntelligence, null, 2)}\n\nDECISION ENGINE:\n${JSON.stringify(decisionIntelligence, null, 2)}\n\nOPTIMIZATION ENGINE:\n${JSON.stringify(optimizationIntelligence, null, 2)}\n\nFINANCIAL ENGINE:\n${JSON.stringify(financialIntelligence, null, 2)}\n\nEXECUTIVE ENGINE:\n${JSON.stringify(executiveIntelligence, null, 2)}\n\nTRUST ENGINE:\n${JSON.stringify(trustIntelligence, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: QA_ENGINE_SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    res.json(data);
  } catch (err) {
    logger.error({ err }, "QA Engine Analysis failed");
    res.status(500).json({ error: "Failed to generate QA engine analysis" });
  }
});

export default router;
