import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const COPILOT_SYSTEM_PROMPT = `SYSTEM ROLE:
You are the SupplyCmd Operational Copilot. You receive only the currently supported operational KPIs and produce a clear, highly structured, and strictly non-repetitive operations report for an executive audience.

OUTPUT FORMAT — use exactly these four section headers, in order, no emojis, no icons, no decorative characters:

## 1. Overall Operations Summary
- First bullet: Overall health score and single-sentence rating.
- Second bullet: Exact count of KPIs on target vs off target, and a one-sentence summary of overall momentum.
- Third bullet: List only the KPIs that missed their targets. Do not explain them here; just list them. If all are on target, state: "All KPIs are within acceptable tolerances."

## 2. Top Risks
- Use numbered bullet points for up to 3 distinct risks.
- Focus exclusively on the downstream impact of the underperforming KPIs.
- Do not repeat the exact values from Section 1. Explain the "so what?" (e.g., how a supplier delay impacts production).

## 3. KPI Relationships
- Use bullet points to highlight up to 3 cross-metric correlations.
- Focus on how one metric is actively influencing another (e.g., Inventory levels vs. Fulfillment rate).
- Do not restate risks from Section 2. Provide new insights on interdependencies.

## 4. Priority Action Plan
- Provide a prioritized, numbered list of up to 3 specific actions.
- Each action must be distinct and directly resolve a risk identified in Section 2.
- Be concise and actionable (e.g., "Expedite PO-1029 to restore safety stock").

CRITICAL RULES:
- STRICT GROUNDING: Discuss only KPIs explicitly supplied in the user message.
- Never mention, infer, or assume unsupported KPIs, metrics, operational conditions, causal relationships, or data that were not supplied.
- If there are not enough supplied KPIs to establish a cross-metric relationship, explicitly state that no supported relationship can be established from the current KPI set.
- Do not describe the data as real-time or live.
- ZERO DUPLICATION: Do not repeat points, metrics, or insights across sections. Each section must serve a unique purpose.
- Keep the structure perfectly clear using Markdown bullets and numbers.
- Maintain a professional, executive tone.
- Never return an empty section.`;

interface KpiInput {
  label: string;
  value: number;
  unit: string;
  target: number;
  trend: string;
  status: string;
  description: string;
}

router.post("/ai/analyze", async (req, res): Promise<void> => {
  const { kpis, healthScore } = req.body as {
    kpis: KpiInput[];
    healthScore: number;
  };

  if (!kpis || !Array.isArray(kpis) || kpis.length === 0) {
    res.status(400).json({ error: "kpis array is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const onTarget = kpis.filter((k) => k.status === "good").length;
  const kpiText = kpis
    .map(
      (k) =>
        `• ${k.label}: ${k.value.toFixed(1)}${k.unit} (target: ${k.target}${k.unit}, trend: ${k.trend}, status: ${k.status}) — ${k.description}`
    )
    .join("\n");

  const userMessage =
    `Overall Operations Health Score: ${healthScore}/100\n` +
    `KPIs on target: ${onTarget}/${kpis.length}\n\n` +
    `Current Supported KPI Data:\n${kpiText}`;

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use standard model
      max_completion_tokens: 2500,
      messages: [
        { role: "system", content: COPILOT_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.warn({ err }, "AI copilot analysis failed, using local fallback generation");

    // Generative fallback if OpenAI key is invalid or model fails
    const rating = healthScore >= 80 ? "Healthy" : healthScore >= 50 ? "At Risk" : "Critical";
    const gaps = kpis.filter(k => k.status !== "good").map(k => `- **${k.label}** is currently sitting at ${k.value.toFixed(1)}${k.unit} against a target of ${k.target}${k.unit}. This variance requires immediate attention as it is degrading overall performance.`);
    const gapText =
      gaps.length > 0
        ? gaps.slice(0, 4).join("\n")
        : "- All currently supported KPIs are within acceptable tolerances.";

    const risks = kpis
      .filter(k => k.status !== "good")
      .map(
        k =>
          `- **${k.label}** is outside its healthy range and may negatively affect operations if the condition persists.`
      );

    const riskText =
      risks.length > 0
        ? risks.slice(0, 3).join("\n")
        : "- No material risks are identified from the currently supported KPI set.";

    const actions = kpis
      .filter(k => k.status !== "good")
      .map(
        k =>
          `- Investigate the ${k.label} variance and determine the operational cause before selecting corrective action.`
      );

    const actionText =
      actions.length > 0
        ? actions.slice(0, 3).join("\n")
        : "- No immediate corrective action is indicated by the currently supported KPI set.";

    const relationshipText =
      kpis.length >= 2
        ? "- No causal relationship is asserted unless it is directly supported by the supplied KPI data."
        : "- Not enough supported KPIs are available to establish cross-metric relationships.";

    const fallbackResponse = `## 1. Overall Operations Summary
- The current supported KPI set is rated as **${rating}** with an aggregate score of ${healthScore}/100.
- ${onTarget} of ${kpis.length} currently supported KPIs are within their healthy operating range.
${gapText}

## 2. Top Risks
${riskText}

## 3. KPI Relationships
${relationshipText}

## 4. Priority Action Plan
${actionText}`;

    // Stream the fallback response line by line to simulate the AI
    const lines = fallbackResponse.split("\n");
    for (const line of lines) {
      res.write(`data: ${JSON.stringify({ content: line + "\n" })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;
