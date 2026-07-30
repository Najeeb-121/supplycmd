import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import DemandPage from "../../pages/demand";

// ── Mock the API client ───────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@workspace/api-client-react", () => ({
  useListDemandRecords:       () => ({ data: [], isLoading: false }),
  useCreateDemandRecord:      () => ({ mutate: mockCreate, mutateAsync: vi.fn(), isPending: false }),
  useGetDemandForecast:       () => ({ data: [], isLoading: false }),
  getListDemandRecordsQueryKey: () => ["demand"],
  getGetDemandForecastQueryKey: () => ["demand-forecast"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function openDemandDialog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={makeQC()}>
      <DemandPage />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole("button", { name: /add demand record/i }));
  const submitBtn = await screen.findByRole("button", { name: /log record/i });
  return { user, submitBtn };
}

describe("Demand page – Log Demand Record modal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submit button is disabled when the dialog first opens", async () => {
    const { submitBtn } = await openDemandDialog();
    // productName default is "" which fails min(2)
    expect(submitBtn).toBeDisabled();
  });

  it("clicking a disabled submit button does not call the create mutation", async () => {
    const { user, submitBtn } = await openDemandDialog();
    expect(submitBtn).toBeDisabled();
    await user.click(submitBtn);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("submit becomes enabled when all fields satisfy constraints", async () => {
    const { user, submitBtn } = await openDemandDialog();
    // productName (min 2), other defaults are valid
    await user.type(screen.getByLabelText(/product name/i), "Steel Bearing 10mm");
    expect(submitBtn).not.toBeDisabled();
  });

  it("submit is disabled when period has invalid format (field constraint)", async () => {
    const { user, submitBtn } = await openDemandDialog();
    await user.type(screen.getByLabelText(/product name/i), "Steel Bearing 10mm");
    // Override the period field with a bad format
    const periodInput = screen.getByLabelText(/period id/i);
    await user.clear(periodInput);
    await user.type(periodInput, "07-2026"); // wrong: should be YYYY-MM
    expect(submitBtn).toBeDisabled();
  });

  it("submit is enabled again after correcting the period format", async () => {
    const { user, submitBtn } = await openDemandDialog();
    await user.type(screen.getByLabelText(/product name/i), "Steel Bearing 10mm");
    const periodInput = screen.getByLabelText(/period id/i);
    await user.clear(periodInput);
    await user.type(periodInput, "07-2026"); // bad format → disabled
    expect(submitBtn).toBeDisabled();

    await user.clear(periodInput);
    await user.type(periodInput, "2026-07"); // correct format → enabled
    expect(submitBtn).not.toBeDisabled();
  });
});
