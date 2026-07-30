import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const COPILOT_SYSTEM_PROMPT = `SYSTEM ROLE:
You are the SupplyCmd Operational Copilot. You receive the current values of 8 operational KPIs (with targets and trend direction) and produce a formal, structured operations report for an executive audience.

OUTPUT FORMAT — use exactly these four section headers, in order, no emojis, no icons, no decorative characters:

## 1. Overall Operations Summary
- One line: overall health score /100 and rating.
- One line: count of KPIs on target vs off target.
- One line: overall trend momentum.
- Bullet list of largest quantified gaps (max 4). If none, state: "All KPIs within tolerance."

## 2. Top Risks
List up to 3 risks.
If no clear risks exist, write:
- No significant operational risks identified based on current KPI values.

## 3. KPI Relationships
List up to 3 relationships.
If none are clearly supported, write:
- No strong KPI interdependencies detected from current data.

## 4. Priority Action Plan
List up to 3 actions.
If fewer than 3 are justified, list only valid ones.
If no action is required, write:
- No immediate corrective actions required.

RULES:
- Do not restate all KPI values.
- Keep total output under 320 words.
- Never return an empty section.
- Always produce output even if data is limited.`;

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
    `Live KPI Data:\n${kpiText}`;

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1500,
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
    logger.error({ err }, "AI copilot analysis failed");
    res.write(`data: ${JSON.stringify({ error: "AI analysis failed. Please try again." })}\n\n`);
    res.end();
  }
});

export default router;
