import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// We must set the env var BEFORE importing the routers so the module scope evaluation sees it.
process.env.GOOGLE_API_KEY = "test_mock_key";

import decisionEngineRouter from "../decision-engine";
import financialEngineRouter from "../financial-engine";
import { generateDeterministicDecision } from "../../simulation/sr6-decision-bridge";

// 1. Mock the bridge to verify it gets called
vi.mock("../../simulation/sr6-decision-bridge", () => ({
  generateDeterministicDecision: vi.fn()
}));

const { mockGenerateContent } = vi.hoisted(() => {
  return { mockGenerateContent: vi.fn() };
});

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent
      };
    }
  };
});

describe("SR-6 Phase 2 AI Orchestration", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up a mock Express app that injects req.user like requireAuth would
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      (req as any).user = { companyId: 1 };
      next();
    });

    // Mount the routes being tested
    app.use(decisionEngineRouter);
    app.use(financialEngineRouter);

    // Setup default mock bridge response
    (generateDeterministicDecision as any).mockResolvedValue({
      baselineRiskDetected: true,
      baselineExposures: [],
      candidateMitigations: [],
      contingencyExposures: [],
      contingencyMitigations: [],
      portfolioResult: {
        totalProcurementCostDelta: 4000,
        deduplicatedRevenueDelta: "UNKNOWN",
        netROI: "UNKNOWN",
        actionExecutionTraces: [],
        skippedActions: [],
        affectedSalesOrders: [
          { orderId: 999, affectedQuantity: 40 }
        ]
      },
      provenance: {
        mitigationGeneration: "DETERMINISTIC",
        financialSimulation: "DETERMINISTIC"
      }
    });

    // Setup default mock AI response
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ dummyResponse: true })
    });
  });

  it("decision-engine executes the deterministic bridge and injects specific ground-truth fields", async () => {
    const res = await request(app)
      .post("/ai/decision-engine")
      .send({
        simulationResult: { timeline: [], kpis: {}, executiveSummary: "" },
        scenario: {},
        rootCause: {},
        riskIntelligence: {}
      });

    expect(res.status).toBe(200);

    // A. generateDeterministicDecision() executes before Gemini
    expect(generateDeterministicDecision).toHaveBeenCalledWith(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const userPrompt = callArgs.contents[0].parts[0].text;

    // B/C/D/E. Exact SR-5 fields reach the AI context
    expect(userPrompt).toContain("SR6_DETERMINISTIC_RESULTS");
    expect(userPrompt).toContain('"totalProcurementCostDelta": 4000');

    // F. UNKNOWN remains UNKNOWN
    expect(userPrompt).toContain('"deduplicatedRevenueDelta": "UNKNOWN"');
    expect(userPrompt).toContain('"netROI": "UNKNOWN"');

    // Exact affectedSalesOrders reach the context
    expect(userPrompt).toContain('"affectedSalesOrders": [');
    expect(userPrompt).toContain('"orderId": 999');

    // H/I. No financial calculation occurs (prompt rule check)
    const systemInstruction = callArgs.config.systemInstruction;
    expect(systemInstruction).toContain("You MUST NOT invent financial values");
    expect(systemInstruction).toContain("You MUST NOT generate strategies that were not provided by the deterministic mitigation engine");

    // Phase 3 Check: Response must bundle AI explanation and deterministic context
    expect(res.body).toHaveProperty("aiExplanation");
    expect(res.body).toHaveProperty("deterministicContext");
    expect(res.body.deterministicContext.baselineRiskDetected).toBe(true);
  });

  it("financial-engine executes the deterministic bridge and injects specific ground-truth fields", async () => {
    const res = await request(app)
      .post("/ai/financial-engine")
      .send({
        simulationResult: { timeline: [], kpis: {}, executiveSummary: "", financialImpact: {} },
        scenario: {},
        rootCause: {},
        riskIntelligence: {},
        decisionIntelligence: {},
        optimizationIntelligence: {}
      });

    expect(res.status).toBe(200);

    // A. generateDeterministicDecision() executes before Gemini
    expect(generateDeterministicDecision).toHaveBeenCalledWith(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const userPrompt = callArgs.contents[0].parts[0].text;

    // B/C/D/E. Exact SR-5 fields reach the AI context
    expect(userPrompt).toContain("SR6_DETERMINISTIC_RESULTS");
    expect(userPrompt).toContain('"totalProcurementCostDelta": 4000');

    // F. UNKNOWN remains UNKNOWN
    expect(userPrompt).toContain('"deduplicatedRevenueDelta": "UNKNOWN"');
    expect(userPrompt).toContain('"netROI": "UNKNOWN"');

    // G. INSUFFICIENT_PRODUCTION_TIMING_DATA remains explicit (from prior testing knowledge, but we check UNKNOWN rule)
    const systemInstruction = callArgs.config.systemInstruction;
    expect(systemInstruction).toContain("You NEVER calculate financial figures independently");
    expect(systemInstruction).toContain("You NEVER estimate ROI");
    expect(systemInstruction).toContain("If financial data is unavailable or UNKNOWN, explicitly state UNKNOWN");
    expect(systemInstruction).toContain("INSUFFICIENT_PRODUCTION_TIMING_DATA");

    // Phase 3 Check: Response must bundle AI explanation and deterministic context
    expect(res.body).toHaveProperty("aiExplanation");
    expect(res.body).toHaveProperty("deterministicContext");
  });

  it("identical deterministic input produces identical AI context string", async () => {
    await request(app).post("/ai/decision-engine").send({ simulationResult: {}, scenario: {}, rootCause: {}, riskIntelligence: {} });
    const callArgs1 = mockGenerateContent.mock.calls[0][0];
    const userPrompt1 = callArgs1.contents[0].parts[0].text;

    vi.clearAllMocks();
    await request(app).post("/ai/decision-engine").send({ simulationResult: {}, scenario: {}, rootCause: {}, riskIntelligence: {} });
    const callArgs2 = mockGenerateContent.mock.calls[0][0];
    const userPrompt2 = callArgs2.contents[0].parts[0].text;

    // J. Identical deterministic input produces identical AI context
    expect(userPrompt1).toEqual(userPrompt2);
  });
});
