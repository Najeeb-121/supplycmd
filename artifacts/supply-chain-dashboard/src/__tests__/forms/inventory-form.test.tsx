import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { itemSchema, type ItemForm } from "../../schemas/inventory";

// ── Minimal test form that mirrors the production modal's submit-button logic ─
function InventoryTestForm({
  defaultValues = {},
}: {
  defaultValues?: Partial<ItemForm>;
}) {
  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    mode: "onChange",
    defaultValues: {
      unitOfMeasure: "units",
      reservedQuantity: 0,
      minStock: 0,
      ...defaultValues,
    },
  });

  return (
    <form>
      <input data-testid="name" {...form.register("name")} />
      <input data-testid="sku" {...form.register("sku")} />
      <input data-testid="category" {...form.register("category")} />
      <input data-testid="unitCost" type="number" {...form.register("unitCost")} />
      <input data-testid="currentStock" type="number" {...form.register("currentStock")} />
      <input data-testid="annualDemand" type="number" {...form.register("annualDemand")} />
      <input data-testid="leadTimeDays" type="number" {...form.register("leadTimeDays")} />
      <input data-testid="orderingCost" type="number" {...form.register("orderingCost")} />
      <input data-testid="holdingCostRate" type="number" {...form.register("holdingCostRate")} />
      <input data-testid="minStock" type="number" {...form.register("minStock")} />
      <input data-testid="maxStock" type="number" {...form.register("maxStock")} />
      <button type="submit" disabled={!form.formState.isValid}>
        Save Item
      </button>
    </form>
  );
}

// Helper: fill all required fields to make the form valid
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByTestId("name"));
  await user.type(screen.getByTestId("name"), "Steel Bearing");
  await user.clear(screen.getByTestId("sku"));
  await user.type(screen.getByTestId("sku"), "SKU-001");
  await user.clear(screen.getByTestId("category"));
  await user.type(screen.getByTestId("category"), "Bearings");
  await user.clear(screen.getByTestId("unitCost"));
  await user.type(screen.getByTestId("unitCost"), "2.5");
  await user.clear(screen.getByTestId("currentStock"));
  await user.type(screen.getByTestId("currentStock"), "100");
  await user.clear(screen.getByTestId("annualDemand"));
  await user.type(screen.getByTestId("annualDemand"), "1200");
  await user.clear(screen.getByTestId("leadTimeDays"));
  await user.type(screen.getByTestId("leadTimeDays"), "7");
  await user.clear(screen.getByTestId("orderingCost"));
  await user.type(screen.getByTestId("orderingCost"), "50");
  await user.clear(screen.getByTestId("holdingCostRate"));
  await user.type(screen.getByTestId("holdingCostRate"), "0.2");
}

describe("Inventory item form – submit button disabled state", () => {
  it("submit is disabled on an empty form", () => {
    render(<InventoryTestForm />);
    expect(screen.getByRole("button", { name: /save item/i })).toBeDisabled();
  });

  it("submit is enabled once all required fields are filled", async () => {
    const user = userEvent.setup();
    render(<InventoryTestForm />);

    await fillRequiredFields(user);

    expect(screen.getByRole("button", { name: /save item/i })).not.toBeDisabled();
  });

  it("submit is disabled when name is cleared after being valid", async () => {
    const user = userEvent.setup();
    render(<InventoryTestForm />);

    await fillRequiredFields(user);
    await user.clear(screen.getByTestId("name"));

    expect(screen.getByRole("button", { name: /save item/i })).toBeDisabled();
  });

  // ── Cross-field: maxStock < minStock disables the button ──────────────────
  it("submit is disabled when maxStock < minStock (cross-field violation)", async () => {
    const user = userEvent.setup();
    render(<InventoryTestForm />);

    await fillRequiredFields(user);

    // Set minStock = 100, maxStock = 50 → violates constraint
    await user.clear(screen.getByTestId("minStock"));
    await user.type(screen.getByTestId("minStock"), "100");
    await user.clear(screen.getByTestId("maxStock"));
    await user.type(screen.getByTestId("maxStock"), "50");

    expect(screen.getByRole("button", { name: /save item/i })).toBeDisabled();
  });

  it("submit is enabled when maxStock equals minStock (boundary OK)", async () => {
    const user = userEvent.setup();
    render(<InventoryTestForm />);

    await fillRequiredFields(user);

    await user.clear(screen.getByTestId("minStock"));
    await user.type(screen.getByTestId("minStock"), "50");
    await user.clear(screen.getByTestId("maxStock"));
    await user.type(screen.getByTestId("maxStock"), "50");

    expect(screen.getByRole("button", { name: /save item/i })).not.toBeDisabled();
  });
});

// ── Schema unit tests (direct safeParse) ─────────────────────────────────────
describe("itemSchema – Zod validation", () => {
  const base = {
    name: "Steel Bearing",
    sku: "SKU-001",
    category: "Bearings",
    unitOfMeasure: "units",
    unitCost: 2.5,
    currentStock: 100,
    reservedQuantity: 0,
    minStock: 10,
    annualDemand: 1200,
    leadTimeDays: 7,
    orderingCost: 50,
    holdingCostRate: 0.2,
  };

  it("accepts a fully valid payload", () => {
    expect(itemSchema.safeParse(base).success).toBe(true);
  });

  it("rejects when name is too short", () => {
    const r = itemSchema.safeParse({ ...base, name: "X" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toContain("name");
  });

  it("rejects when holdingCostRate > 1", () => {
    const r = itemSchema.safeParse({ ...base, holdingCostRate: 1.5 });
    expect(r.success).toBe(false);
  });

  it("rejects when maxStock < minStock", () => {
    const r = itemSchema.safeParse({ ...base, minStock: 100, maxStock: 50 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("maxStock");
    }
  });

  it("accepts when maxStock is omitted", () => {
    const { minStock: _ms, ...rest } = base;
    expect(itemSchema.safeParse({ ...rest, minStock: 0 }).success).toBe(true);
  });
});
