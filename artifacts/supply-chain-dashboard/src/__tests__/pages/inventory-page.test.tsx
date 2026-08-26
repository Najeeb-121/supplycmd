import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import InventoryPage from "../../pages/inventory";

// ── Mock the API client ───────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@workspace/api-client-react", () => ({
  useListInventory: () => ({ data: [], isLoading: false }),
  useGetInventoryRelationships: () => ({ data: [], isLoading: false }),
  useGetInventoryKpis: () => ({ data: null, isLoading: false }),
  useGetReorderSuggestions: () => ({ data: [], isLoading: false }),
  useListStockMovements: () => ({ data: [], isLoading: false }),
  useCreateInventoryItem: () => ({ mutate: mockCreate, mutateAsync: vi.fn(), isPending: false }),
  useUpdateInventoryItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteInventoryItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateStockMovement: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  getListInventoryQueryKey: () => ["inventory"],
  getGetInventoryKpisQueryKey: () => ["inventory-kpis"],
  getGetReorderSuggestionsQueryKey: () => ["reorder-suggestions"],
  getListStockMovementsQueryKey: () => ["stock-movements"],
  getGetDashboardSummaryQueryKey: () => ["dashboard-summary"],
  getGetInventoryHealthQueryKey: () => ["inventory-health"],
  getGetReorderAlertsQueryKey: () => ["reorder-alerts"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function openAddItemDialog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={makeQC()}>
      <InventoryPage />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole("button", { name: /add item/i }));
  // Wait for the dialog to appear
  const submitBtn = await screen.findByRole("button", { name: /create item/i });
  return { user, submitBtn };
}

describe("Inventory page – Add Item modal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submit button is disabled when the dialog first opens", async () => {
    const { submitBtn } = await openAddItemDialog();
    expect(submitBtn).toBeDisabled();
  });

  it("clicking a disabled submit button does not call the create mutation", async () => {
    const { user, submitBtn } = await openAddItemDialog();
    expect(submitBtn).toBeDisabled();
    await user.click(submitBtn);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("submit becomes enabled after all required fields are filled correctly", async () => {
    const { user, submitBtn } = await openAddItemDialog();
    // Fill the three required text fields (numbers have valid defaults)
    await user.type(screen.getByLabelText(/product name/i), "Steel Bearing");
    await user.type(screen.getByLabelText(/^sku/i), "SKU-001");
    await user.type(screen.getByLabelText(/category \*/i), "Bearings");
    expect(submitBtn).not.toBeDisabled();
  });

  it("submit is disabled when maxStock < minStock (cross-field violation)", async () => {
    const { user, submitBtn } = await openAddItemDialog();
    // Make the base form valid first
    await user.type(screen.getByLabelText(/product name/i), "Steel Bearing");
    await user.type(screen.getByLabelText(/^sku/i), "SKU-001");
    await user.type(screen.getByLabelText(/category \*/i), "Bearings");
    expect(submitBtn).not.toBeDisabled();

    // Now violate the cross-field constraint: maxStock < minStock
    const minStockInput = screen.getByLabelText(/minimum stock/i);
    const maxStockInput = screen.getByLabelText(/maximum stock/i);
    await user.clear(minStockInput);
    await user.type(minStockInput, "100");
    await user.clear(maxStockInput);
    await user.type(maxStockInput, "50");

    expect(submitBtn).toBeDisabled();
  });
});
