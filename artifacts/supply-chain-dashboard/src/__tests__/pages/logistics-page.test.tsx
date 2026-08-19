import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import LogisticsPage from "../../pages/logistics";

// ── Mock the API client ───────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@workspace/api-client-react", () => ({
  useGetLogisticsKpis: () => ({ data: null, isLoading: false }),
  useListSuppliers:    () => ({ data: [], isLoading: false }),
  useListOrders:       () => ({ data: [], isLoading: false }),
  useCreateOrder:      () => ({ mutate: mockCreate, mutateAsync: vi.fn(), isPending: false }),
  useCreateSupplier:   () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSupplier:   () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSupplier:   () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteOrder:      () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateOrder:      () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  getListOrdersQueryKey: () => ["orders"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function openCreatePODialog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={makeQC()}>
      <LogisticsPage />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole("button", { name: /create po/i }));
  const submitBtn = await screen.findByRole("button", { name: /issue po/i });
  return { user, submitBtn };
}

describe("Logistics page – Create Purchase Order modal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submit button is disabled when the dialog first opens", async () => {
    const { submitBtn } = await openCreatePODialog();
    // supplierId default is 0 which fails min(1), so isValid starts false
    expect(submitBtn).toBeDisabled();
  });

  it("clicking a disabled submit button does not call the create mutation", async () => {
    const { user, submitBtn } = await openCreatePODialog();
    expect(submitBtn).toBeDisabled();
    await user.click(submitBtn);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("submit is disabled when expectedDelivery is before orderDate (cross-field violation)", async () => {
    const { user, submitBtn } = await openCreatePODialog();
    // Set orderDate to a later date than expectedDelivery
    const orderDateInput       = screen.getByLabelText(/order date/i);
    const expectedDeliveryInput = screen.getByLabelText(/expected delivery/i);

    await user.clear(orderDateInput);
    await user.type(orderDateInput, "2026-07-15");
    await user.clear(expectedDeliveryInput);
    await user.type(expectedDeliveryInput, "2026-07-01");

    // Form is still invalid (supplierId=0 AND date cross-field)
    expect(submitBtn).toBeDisabled();
  });
});
