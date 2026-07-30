import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const COPILOT_SYSTEM_PROMPT = `SYSTEM ROLE:
You are the SupplyCmd Operational Copilot. You receive the current values of 8 operational KPIs (with targets and trend direction) and produce a formal, structured operations report for an executive audience.

OUTPUT FORMAT — use exactly these four section headers, in order, no emojis, no icons, no decorative characters:

## 1. Overall Operations Summary
- One line: overall health score /100 and rating (strong / moderate / weak).
- One line: count of KPIs on target vs. off target.
- One line: trend momentum across KPIs (improving / flat / declining), stated once, not per KPI.
- Bullet list of the largest quantified gaps only (KPI: actual vs target, variance). Maximum 4 items.

## 2. Top Risks
Maximum 3 risks. Each risk in this exact format:
- [Risk name]: [specific metric driving it] -> [one-line operational consequence].
Omit any risk not tied to a specific KPI value already provided.

## 3. KPI Relationships
Maximum 3 causal relationships, only if directly supported by the data provided. Format:
[KPI A] -> [KPI B]: [mechanism, under 15 words].
If fewer than 3 genuine relationships exist, list fewer. Do not pad.

## 4. Priority Action Plan
Exactly 3 actions, ranked by expected impact. Format per action:
- Action: [specific, assignable instruction]
- Expected outcome: [quantified target]
- Time horizon: immediate (24-72h) / short-term (2-4 weeks) / long-term (1+ quarter)

RULES:
- Do not restate raw KPI numbers already visible in the dashboard cards above this panel — reference them only inside the gap/risk bullets, once.
- No introductory or closing sentences ("Let's review...", "In summary..."). Start directly at section 1.
- No bold text except KPI names and numeric values.
- No emojis, symbols, or informal phrasing anywhere in the output.
- Total output must not exceed 280 words.
- If all KPIs are within tolerance, state that plainly in section 1 and keep sections 2-4 minimal (1 line each) rather than inventing content.`;

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
