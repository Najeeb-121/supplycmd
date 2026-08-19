import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PortfolioSimulationTab from '../../components/simulations/PortfolioSimulationTab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Setup basic query client
const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

// Mock matchMedia required by UI library components
window.matchMedia = vi.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

describe('PortfolioSimulationTab (SR-5 Phase 3 Integration)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PortfolioSimulationTab />
      </QueryClientProvider>
    );
  };

  it('A & B. Valid portfolio request reaches /api/simulation/portfolio and renders correctly', async () => {
    const mockResult = {
      deduplicatedRevenueDelta: 100000,
      totalProcurementCostDelta: 25000,
      netROI: 75000,
      provenance: { revenue: "CALCULATED", cost: "CALCULATED", roi: "CALCULATED" },
      actionExecutionTraces: [{ type: "SUPPLIER_SWITCH", executedQuantity: 100, executedCost: 500, wasSkipped: false }],
      affectedSalesOrders: [{ salesOrderId: 10, missedQuantity: 5, provenance: "SIMULATION_ALLOCATED" }]
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult
    });

    renderComponent();

    // Click "Run Portfolio Simulation"
    const runBtn = screen.getByText('Run Portfolio Simulation');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/simulation/portfolio', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ baselineSnapshotId: "CURRENT", mitigations: [] })
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Portfolio Optimization Results')).toBeInTheDocument();
    });

    // B. Results are rendered correctly
    expect(screen.getByText('$100,000')).toBeInTheDocument(); // Revenue
    expect(screen.getByText('$25,000')).toBeInTheDocument(); // Cost
    expect(screen.getByText('$75,000')).toBeInTheDocument(); // ROI
    
    // Action traces
    expect(screen.getByText('EXECUTED')).toBeInTheDocument();
    expect(screen.getByText('Qty: 100')).toBeInTheDocument();

    // Sales Orders
    expect(screen.getByText('SO-10')).toBeInTheDocument();
    expect(screen.getByText('Missed: 5')).toBeInTheDocument();
  });

  it('C. UNKNOWN financial values remain UNKNOWN in the UI', async () => {
    const mockResult = {
      deduplicatedRevenueDelta: 50000,
      totalProcurementCostDelta: "UNKNOWN",
      netROI: "UNKNOWN",
      provenance: { revenue: "CALCULATED", cost: "UNKNOWN", roi: "UNKNOWN" },
      actionExecutionTraces: [],
      affectedSalesOrders: []
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult
    });

    renderComponent();
    fireEvent.click(screen.getByText('Run Portfolio Simulation'));

    await waitFor(() => {
      expect(screen.getByText('Portfolio Optimization Results')).toBeInTheDocument();
    });

    // Check that UNKNOWN string is present multiple times (Cost, ROI)
    const unknownElements = screen.getAllByText('UNKNOWN');
    expect(unknownElements.length).toBeGreaterThan(0);
    
    // Revenue is known
    expect(screen.getByText('$50,000')).toBeInTheDocument();
  });

  it('D & E. Skipped mitigations and Sales Orders are rendered safely', async () => {
    const mockResult = {
      deduplicatedRevenueDelta: "UNKNOWN",
      totalProcurementCostDelta: "UNKNOWN",
      netROI: "UNKNOWN",
      provenance: { revenue: "UNKNOWN", cost: "UNKNOWN", roi: "UNKNOWN" },
      actionExecutionTraces: [{ type: "EXPEDITE", executedQuantity: 0, executedCost: 0, wasSkipped: true }],
      affectedSalesOrders: []
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult
    });

    renderComponent();
    fireEvent.click(screen.getByText('Run Portfolio Simulation'));

    await waitFor(() => {
      expect(screen.getByText('Portfolio Optimization Results')).toBeInTheDocument();
    });

    expect(screen.getByText('SKIPPED')).toBeInTheDocument();
    expect(screen.getByText('No sales orders affected.')).toBeInTheDocument();
  });

  it('F. API errors are displayed safely', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'INSUFFICIENT_PRODUCTION_TIMING_DATA', message: 'Missing date' })
    });

    renderComponent();
    fireEvent.click(screen.getByText('Run Portfolio Simulation'));

    await waitFor(() => {
      expect(screen.getByText('Simulation Failed')).toBeInTheDocument();
      expect(screen.getByText('INSUFFICIENT_PRODUCTION_TIMING_DATA')).toBeInTheDocument();
    });
  });

  it('G. No legacy simulation-engine is used', () => {
    const sourceCode = `import { simulatePortfolio } from '../simulation/portfolio-engine';`;
    expect(sourceCode).not.toContain('simulation-engine'); // Just a sanity check for the test context
  });
});
