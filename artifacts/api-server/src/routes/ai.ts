import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const COPILOT_SYSTEM_PROMPT = `You are an AI Supply Chain Operations Intelligence Copilot.

Analyze the provided supply chain KPIs collectively and think like a senior operations manager.

---

OBJECTIVES:

1. Identify the most critical operational issues
2. Detect relationships and dependencies between KPIs
3. Recommend the top 3 actions the manager should take immediately

---

INPUT:
You will receive multiple KPIs including:
- KPI name
- Current value
- Target value
- Trend direction
- Operational context (inventory, suppliers, warehouse, fulfillment)

---

OUTPUT FORMAT (STRICT):

1. 🧠 Overall Operations Summary
- Brief evaluation of operational health
- Mention how many KPIs are on target vs off target
- Highlight overall trend

2. 🚨 Top Risks
- List 2–4 key risks
- Explain why each risk matters
- Connect risks to business impact (service level, cost, delays)

3. 🔗 KPI Relationships
- Identify cause-effect relationships between KPIs
- Example: "Lead time increase → causing late deliveries"

4. 🎯 Priority Action Plan (Top 3 Actions ONLY)
For each action:
- Action description (clear and specific)
- Expected outcome (quantified if possible)
- Time horizon (immediate / short-term)

---

RULES:
- Be concise but highly actionable
- Avoid generic advice
- Use numbers and percentages when possible
- Focus on decisions, not descriptions
- Prioritize impact over completeness`;

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
