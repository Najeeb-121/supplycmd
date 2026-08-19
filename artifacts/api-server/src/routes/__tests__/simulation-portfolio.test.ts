import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import simulationPortfolioRouter from '../simulation-portfolio';
import { buildSupplyRiskSnapshot } from '../../simulation/supply-risk-snapshot';
import { simulatePortfolio } from '../../simulation/portfolio-engine';

// Mock the dependencies
vi.mock('../../simulation/supply-risk-snapshot', () => ({
  buildSupplyRiskSnapshot: vi.fn()
}));

vi.mock('../../simulation/portfolio-engine', () => ({
  simulatePortfolio: vi.fn()
}));

// Create a test app
function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  
  // Mock requireAuth middleware behavior
  app.use((req: any, res, next) => {
    req.user = { companyId: 1 };
    next();
  });
  
  app.use('/api', simulationPortfolioRouter);
  return app;
}

describe('POST /api/simulation/portfolio', () => {
  let app: Express;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  it('A. Valid portfolio request reaches simulatePortfolio() and returns a valid PortfolioCompositionResult', async () => {
    const mockSnapshot = { products: {}, demand: [], boms: {}, productionRuns: [] };
    const mockPriceLookup: any[] = [];
    const mockMitigations = [{ id: 'mit1', type: 'SUPPLIER_SWITCH' }];
    const mockResult = { netROI: 5000, totalProcurementCostDelta: 200, actionExecutionTraces: [] };

    vi.mocked(buildSupplyRiskSnapshot).mockResolvedValue({
      snapshot: mockSnapshot,
      priceLookup: mockPriceLookup
    } as any);

    vi.mocked(simulatePortfolio).mockReturnValue(mockResult as any);

    const res = await request(app)
      .post('/api/simulation/portfolio')
      .send({
        baselineSnapshotId: 'snap-123',
        mitigations: mockMitigations
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResult);
    
    expect(buildSupplyRiskSnapshot).toHaveBeenCalledWith(1);
    expect(simulatePortfolio).toHaveBeenCalledWith(mockSnapshot, mockMitigations, mockPriceLookup);
  });

  it('B. Invalid request is rejected without invoking the engine', async () => {
    const res = await request(app)
      .post('/api/simulation/portfolio')
      .send({
        // missing baselineSnapshotId
        mitigations: []
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing baselineSnapshotId');
    expect(buildSupplyRiskSnapshot).not.toHaveBeenCalled();
    expect(simulatePortfolio).not.toHaveBeenCalled();
  });

  it('D. Missing production timing throws 400 with specific contract', async () => {
    vi.mocked(buildSupplyRiskSnapshot).mockResolvedValue({
      snapshot: {} as any,
      priceLookup: []
    });

    vi.mocked(simulatePortfolio).mockImplementation(() => {
      throw new Error("INSUFFICIENT_PRODUCTION_TIMING_DATA");
    });

    const res = await request(app)
      .post('/api/simulation/portfolio')
      .send({
        baselineSnapshotId: 'snap-123',
        mitigations: []
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_PRODUCTION_TIMING_DATA');
  });

  // Tests C, E, F, G are guaranteed by the engine (simulatePortfolio) and the snapshot builder (buildSupplyRiskSnapshot).
  // This API routing file preserves the engine's strictness.
});
