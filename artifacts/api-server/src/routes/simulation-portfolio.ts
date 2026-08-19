import { Router, Request, Response } from "express";
import { PortfolioSimulationRequest, PortfolioCompositionResult } from "../simulation/portfolio-contracts";
import { buildSupplyRiskSnapshot } from "../simulation/supply-risk-snapshot";
import { simulatePortfolio } from "../simulation/portfolio-engine";

const router = Router();

router.post("/simulation/portfolio", async (req: Request, res: Response) => {
  try {
    // Authenticated company context is provided by requireAuth middleware
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(401).json({ error: "Unauthorized: Missing company context" });
    }

    const { baselineSnapshotId, mitigations } = req.body as PortfolioSimulationRequest;

    // Validate request
    if (!baselineSnapshotId) {
      return res.status(400).json({ error: "Missing baselineSnapshotId" });
    }
    if (!Array.isArray(mitigations)) {
      return res.status(400).json({ error: "mitigations must be an array" });
    }

    // 1. Build real snapshot
    const { snapshot, priceLookup } = await buildSupplyRiskSnapshot(companyId);

    // 2. Invoke engine
    const result: PortfolioCompositionResult = simulatePortfolio(snapshot, mitigations, priceLookup);

    // 3. Return payload
    return res.json(result);

  } catch (error: any) {
    console.error("Simulation API Error:", error);
    
    // Explicit contract adherence for missing timing
    if (error.message === "INSUFFICIENT_PRODUCTION_TIMING_DATA") {
      return res.status(400).json({
        error: "INSUFFICIENT_PRODUCTION_TIMING_DATA",
        message: "One or more required production runs is missing a valid run date."
      });
    }

    return res.status(500).json({
      error: "SIMULATION_EXECUTION_ERROR",
      message: error.message || "Unknown error"
    });
  }
});

export default router;
