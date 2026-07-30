import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { orderSchema, type OrderFormValues } from "../../schemas/orders";

// ── Minimal test form ─────────────────────────────────────────────────────────
function OrderTestForm() {
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    mode: "onChange",
  });

  return (
    <form>
      <input data-testid="supplierId" type="number" {...form.register("supplierId")} />
      <input data-testid="orderDate" type="date" {...form.register("orderDate")} />
      <input data-testid="expectedDelivery" type="date" {...form.register("expectedDelivery")} />
      <input data-testid="itemCount" type="number" {...form.register("itemCount")} />
      <input data-testid="totalValue" type="number" {...form.register("totalValue")} />
      <button type="submit" disabled={!form.formState.isValid}>
        Issue PO
      </button>
    </form>
  );
}

async function fillAllFields(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByTestId("supplierId"));
  await user.type(screen.getByTestId("supplierId"), "1");
  await user.clear(screen.getByTestId("orderDate"));
  await user.type(screen.getByTestId("orderDate"), "2026-07-01");
  await user.clear(screen.getByTestId("expectedDelivery"));
  await user.type(screen.getByTestId("expectedDelivery"), "2026-07-15");
  await user.clear(screen.getByTestId("itemCount"));
  await user.type(screen.getByTestId("itemCount"), "5");
  await user.clear(screen.getByTestId("totalValue"));
  await user.type(screen.getByTestId("totalValue"), "1500");
}

describe("Orders form – submit button disabled state", () => {
  it("submit is disabled on an empty form", () => {
    render(<OrderTestForm />);
    expect(screen.getByRole("button", { name: /issue po/i })).toBeDisabled();
  });

  it("submit is enabled once all required fields are filled with valid dates", async () => {
    const user = userEvent.setup();
    render(<OrderTestForm />);
    await fillAllFields(user);
    expect(screen.getByRole("button", { name: /issue po/i })).not.toBeDisabled();
  });

  // ── Cross-field: delivery before order date ───────────────────────────────
  it("submit is disabled when expectedDelivery is before orderDate", async () => {
    const user = userEvent.setup();
    render(<OrderTestForm />);

    await user.type(screen.getByTestId("supplierId"), "1");
    await user.type(screen.getByTestId("orderDate"), "2026-07-15");
    await user.type(screen.getByTestId("expectedDelivery"), "2026-07-01"); // before order date
    await user.type(screen.getByTestId("itemCount"), "5");
    await user.type(screen.getByTestId("totalValue"), "1500");

    expect(screen.getByRole("button", { name: /issue po/i })).toBeDisabled();
  });

  it("submit is enabled when expectedDelivery equals orderDate", async () => {
    const user = userEvent.setup();
    render(<OrderTestForm />);

    await user.type(screen.getByTestId("supplierId"), "1");
    await user.type(screen.getByTestId("orderDate"), "2026-07-01");
    await user.type(screen.getByTestId("expectedDelivery"), "2026-07-01");
    await user.type(screen.getByTestId("itemCount"), "5");
    await user.type(screen.getByTestId("totalValue"), "0");

    expect(screen.getByRole("button", { name: /issue po/i })).not.toBeDisabled();
  });
});

// ── Schema unit tests ─────────────────────────────────────────────────────────
describe("orderSchema – Zod validation", () => {
  const base = {
    supplierId: 1,
    totalValue: 1500,
    orderDate: "2026-07-01",
    expectedDelivery: "2026-07-15",
    itemCount: 5,
  };

  it("accepts a valid payload", () => {
    expect(orderSchema.safeParse(base).success).toBe(true);
  });

  it("rejects when supplierId is 0", () => {
    const r = orderSchema.safeParse({ ...base, supplierId: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects when itemCount is 0", () => {
    const r = orderSchema.safeParse({ ...base, itemCount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toContain("itemCount");
  });

  it("rejects when totalValue is negative", () => {
    const r = orderSchema.safeParse({ ...base, totalValue: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects when expectedDelivery is before orderDate", () => {
    const r = orderSchema.safeParse({
      ...base,
      orderDate: "2026-07-15",
      expectedDelivery: "2026-07-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("expectedDelivery");
    }
  });

  it("accepts when expectedDelivery equals orderDate", () => {
    expect(
      orderSchema.safeParse({ ...base, orderDate: "2026-07-01", expectedDelivery: "2026-07-01" })
        .success,
    ).toBe(true);
  });
});
