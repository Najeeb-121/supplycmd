import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ProductionPage from "../../pages/production";

// ── Mock the API client ───────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@workspace/api-client-react", () => ({
  useListProductionRuns:      () => ({ data: [], isLoading: false }),
  useCreateProductionRun:     () => ({ mutate: mockCreate, mutateAsync: vi.fn(), isPending: false }),
  useGetOeeMetrics:           () => ({ data: null, isLoading: false }),
  getListProductionRunsQueryKey: () => ["production"],
  getGetOeeMetricsQueryKey:      () => ["oee"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function openProductionDialog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={makeQC()}>
      <ProductionPage />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole("button", { name: /log production run/i }));
  const submitBtn = await screen.findByRole("button", { name: /log run metrics/i });
  return { user, submitBtn };
}

describe("Production page – Log Production Run modal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submit button is disabled when the dialog first opens", async () => {
    const { submitBtn } = await openProductionDialog();
    // productName default is "" which fails min(2)
    expect(submitBtn).toBeDisabled();
  });

  it("clicking a disabled submit button does not call the create mutation", async () => {
    const { user, submitBtn } = await openProductionDialog();
    expect(submitBtn).toBeDisabled();
    await user.click(submitBtn);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("submit becomes enabled when productName satisfies its constraint", async () => {
    const { user, submitBtn } = await openProductionDialog();
    // All other defaults are valid; only productName: "" fails
    await user.type(screen.getByLabelText(/product name/i), "Widget Alpha");
    expect(submitBtn).not.toBeDisabled();
  });

  it("submit is disabled when defects exceed actualUnits (cross-field violation)", async () => {
    const { user, submitBtn } = await openProductionDialog();
    await user.type(screen.getByLabelText(/product name/i), "Widget Alpha");
    expect(submitBtn).not.toBeDisabled();

    // Set actualUnits to 10, then defects to 11 → violates constraint
    const actualUnitsInput = screen.getByLabelText(/^actual units produced/i);
    await user.clear(actualUnitsInput);
    await user.type(actualUnitsInput, "10");

    const defectsInput = screen.getByLabelText(/^defects found/i);
    await user.clear(defectsInput);
    await user.type(defectsInput, "11");

    expect(submitBtn).toBeDisabled();
  });

  it("submit is enabled when defects equal actualUnits (boundary OK)", async () => {
    const { user, submitBtn } = await openProductionDialog();
    await user.type(screen.getByLabelText(/product name/i), "Widget Alpha");

    const actualUnitsInput = screen.getByLabelText(/^actual units produced/i);
    await user.clear(actualUnitsInput);
    await user.type(actualUnitsInput, "10");

    const defectsInput = screen.getByLabelText(/^defects found/i);
    await user.clear(defectsInput);
    await user.type(defectsInput, "10"); // exactly equal → valid

    expect(submitBtn).not.toBeDisabled();
  });
});
