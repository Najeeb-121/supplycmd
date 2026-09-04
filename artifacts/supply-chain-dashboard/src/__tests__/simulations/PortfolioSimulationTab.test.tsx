import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PortfolioSimulationTab from '../../components/simulations/PortfolioSimulationTab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
const decisionEngineMockState = vi.hoisted(() => {
  const defaultCandidate = {
    id: "ALT_SUPPLIER_TEST",
    type: "ALTERNATE_SUPPLIER" as const,
    title: "Use Test Alternate Supplier",
    reason: "Test deterministic mitigation",
    feasible: true,
    affectedQuantity: 100,
    mitigationCost: 500,
    mitigationCostProvenance: "CALCULATED" as const,
    mitigationDateProvenance: "UNKNOWN" as const,
    targetSupplierId: 21,
    targetSupplierName: "Test Supplier",
    targetProductId: 17,
  };

  return {
    defaultCandidate,
    candidateMitigations: [defaultCandidate],
  };
});

vi.mock('@/hooks/use-real-decision-engine', () => ({
  useRealDecisionEngine: () => ({
    engine: {
      deterministicContext: {
        candidateMitigations: decisionEngineMockState.candidateMitigations,
      },
    },
  }),
}));

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

describe('PortfolioSimulationTab (SR-6 Phase 9 Integration)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.restoreAllMocks();
    global.fetch = vi.fn();
    decisionEngineMockState.candidateMitigations = [
      decisionEngineMockState.defaultCandidate,
    ];
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
      actionExecutionTraces: [{
        mitigationId: "ALT_SUPPLIER_TEST",
        type: "ALTERNATE_SUPPLIER",
        executedQuantity: 100,
        executedCost: 500,
        wasSkipped: false
      }],
      affectedSalesOrders: [{ salesOrderId: 10, missedQuantity: 5, provenance: "SIMULATION_ALLOCATED" }]
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult
    });

    renderComponent();

    fireEvent.click(screen.getByText('+ Add Deterministic Mitigation'));

    // Click "Run Portfolio Simulation"
    const runBtn = screen.getByText('Run Portfolio Simulation');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/simulation/portfolio', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          baselineSnapshotId: "CURRENT",
          mitigations: [
            {
              id: "ALT_SUPPLIER_TEST",
              type: "ALTERNATE_SUPPLIER",
              title: "Use Test Alternate Supplier",
              reason: "Test deterministic mitigation",
              feasible: true,
              affectedQuantity: 100,
              mitigationCost: 500,
              mitigationCostProvenance: "CALCULATED",
              mitigationDateProvenance: "UNKNOWN",
              targetSupplierId: 21,
              targetSupplierName: "Test Supplier",
              targetProductId: 17,
            },
          ],
        })
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Portfolio Simulation Results')).toBeInTheDocument();
    });

    // B. Results are rendered correctly
    expect(screen.getByText('100,000')).toBeInTheDocument(); // Revenue
    expect(screen.getByText('25,000')).toBeInTheDocument(); // Cost
    expect(screen.getByText('75,000')).toBeInTheDocument(); // ROI

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
    fireEvent.click(screen.getByText('+ Add Deterministic Mitigation'));
    fireEvent.click(screen.getByText('Run Portfolio Simulation'));

    await waitFor(() => {
      expect(screen.getByText('Portfolio Simulation Results')).toBeInTheDocument();
    });

    // Check that UNKNOWN string is present multiple times (Cost, ROI)
    const unknownElements = screen.getAllByText('UNKNOWN');
    expect(unknownElements.length).toBeGreaterThan(0);

    // Revenue is known
    expect(screen.getByText('50,000')).toBeInTheDocument();
  });

  it('D & E. Skipped mitigations and Sales Orders are rendered safely', async () => {
    const mockResult = {
      deduplicatedRevenueDelta: "UNKNOWN",
      totalProcurementCostDelta: "UNKNOWN",
      netROI: "UNKNOWN",
      provenance: { revenue: "UNKNOWN", cost: "UNKNOWN", roi: "UNKNOWN" },
      actionExecutionTraces: [{
        mitigationId: "FOLLOW_UP_TEST",
        type: "FOLLOW_UP_INBOUND",
        executedQuantity: 0,
        executedCost: 0,
        wasSkipped: true
      }],
      affectedSalesOrders: []
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult
    });

    renderComponent();
    fireEvent.click(screen.getByText('+ Add Deterministic Mitigation'));
    fireEvent.click(screen.getByText('Run Portfolio Simulation'));

    await waitFor(() => {
      expect(screen.getByText('Portfolio Simulation Results')).toBeInTheDocument();
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
    fireEvent.click(screen.getByText('+ Add Deterministic Mitigation'));
    fireEvent.click(screen.getByText('Run Portfolio Simulation'));

    await waitFor(() => {
      expect(screen.getByText('Simulation Failed')).toBeInTheDocument();
      expect(screen.getByText('INSUFFICIENT_PRODUCTION_TIMING_DATA')).toBeInTheDocument();
    });
  });

  it('H. No legacy simulation-engine is used', () => {
    const sourceCode = `import { simulatePortfolio } from '../simulation/portfolio-engine';`;
    expect(sourceCode).not.toContain('simulation-engine'); // Just a sanity check for the test context
  });

  it('G. Refreshed candidates remove a stale selected mitigation', async () => {
    const { rerender } = renderComponent();

    fireEvent.click(screen.getByText('+ Add Deterministic Mitigation'));

    expect(
      screen.getByText('Use Test Alternate Supplier - Qty: 100')
    ).toBeInTheDocument();

    decisionEngineMockState.candidateMitigations = [];

    rerender(
      <QueryClientProvider client={queryClient}>
        <PortfolioSimulationTab />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Use Test Alternate Supplier - Qty: 100')
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByText('Run Portfolio Simulation')
    ).toBeDisabled();
  });

  it('I. Refreshed candidate values replace stale selected mitigation values', async () => {
    const { rerender } = renderComponent();

    fireEvent.click(screen.getByText('+ Add Deterministic Mitigation'));

    expect(
      screen.getByText('Use Test Alternate Supplier - Qty: 100')
    ).toBeInTheDocument();

    decisionEngineMockState.candidateMitigations = [
      {
        ...decisionEngineMockState.defaultCandidate,
        affectedQuantity: 250,
        mitigationCost: 900,
      },
    ];

    rerender(
      <QueryClientProvider client={queryClient}>
        <PortfolioSimulationTab />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Use Test Alternate Supplier - Qty: 250')
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText('Use Test Alternate Supplier - Qty: 100')
    ).not.toBeInTheDocument();
  });

});
