import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productionSchema, type ProductionFormValues } from "../../schemas/production";

// ── Minimal test form ─────────────────────────────────────────────────────────
function ProductionTestForm() {
  const form = useForm<ProductionFormValues>({
    resolver: zodResolver(productionSchema),
    mode: "onChange",
  });

  return (
    <form>
      <input data-testid="productName" {...form.register("productName")} />
      <input data-testid="runDate" type="date" {...form.register("runDate")} />
      <input data-testid="plannedUnits" type="number" {...form.register("plannedUnits")} />
      <input data-testid="actualUnits" type="number" {...form.register("actualUnits")} />
      <input data-testid="plannedTimeMin" type="number" {...form.register("plannedTimeMin")} />
      <input data-testid="actualTimeMin" type="number" {...form.register("actualTimeMin")} />
      <input data-testid="defects" type="number" {...form.register("defects")} />
      <input data-testid="downtimeMin" type="number" {...form.register("downtimeMin")} />
      <button type="submit" disabled={!form.formState.isValid}>
        Log Run Metrics
      </button>
    </form>
  );
}

async function fillAllFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("productName"), "Widget Alpha");
  await user.type(screen.getByTestId("runDate"), "2026-07-01");
  await user.type(screen.getByTestId("plannedUnits"), "500");
  await user.type(screen.getByTestId("actualUnits"), "480");
  await user.type(screen.getByTestId("plannedTimeMin"), "240");
  await user.type(screen.getByTestId("actualTimeMin"), "250");
  await user.type(screen.getByTestId("defects"), "5");
  await user.type(screen.getByTestId("downtimeMin"), "10");
}

describe("Production form – submit button disabled state", () => {
  it("submit is disabled on an empty form", () => {
    render(<ProductionTestForm />);
    expect(screen.getByRole("button", { name: /log run metrics/i })).toBeDisabled();
  });

  it("submit is enabled once all required fields are filled", async () => {
    const user = userEvent.setup();
    render(<ProductionTestForm />);
    await fillAllFields(user);
    expect(screen.getByRole("button", { name: /log run metrics/i })).not.toBeDisabled();
  });

  it("submit is disabled when productName is too short", async () => {
    const user = userEvent.setup();
    render(<ProductionTestForm />);

    await user.type(screen.getByTestId("productName"), "W"); // too short
    await user.type(screen.getByTestId("runDate"), "2026-07-01");
    await user.type(screen.getByTestId("plannedUnits"), "500");
    await user.type(screen.getByTestId("actualUnits"), "480");
    await user.type(screen.getByTestId("plannedTimeMin"), "240");
    await user.type(screen.getByTestId("actualTimeMin"), "250");
    await user.type(screen.getByTestId("defects"), "5");
    await user.type(screen.getByTestId("downtimeMin"), "10");

    expect(screen.getByRole("button", { name: /log run metrics/i })).toBeDisabled();
  });

  // ── Cross-field: defects > actualUnits disables the button ────────────────
  it("submit is disabled when defects exceed actualUnits", async () => {
    const user = userEvent.setup();
    render(<ProductionTestForm />);

    await user.type(screen.getByTestId("productName"), "Widget Alpha");
    await user.type(screen.getByTestId("runDate"), "2026-07-01");
    await user.type(screen.getByTestId("plannedUnits"), "500");
    await user.type(screen.getByTestId("actualUnits"), "10");
    await user.type(screen.getByTestId("plannedTimeMin"), "240");
    await user.type(screen.getByTestId("actualTimeMin"), "250");
    await user.type(screen.getByTestId("defects"), "11"); // exceeds actualUnits=10
    await user.type(screen.getByTestId("downtimeMin"), "10");

    expect(screen.getByRole("button", { name: /log run metrics/i })).toBeDisabled();
  });

  it("submit is enabled when defects equal actualUnits (boundary)", async () => {
    const user = userEvent.setup();
    render(<ProductionTestForm />);

    await user.type(screen.getByTestId("productName"), "Widget Alpha");
    await user.type(screen.getByTestId("runDate"), "2026-07-01");
    await user.type(screen.getByTestId("plannedUnits"), "500");
    await user.type(screen.getByTestId("actualUnits"), "10");
    await user.type(screen.getByTestId("plannedTimeMin"), "240");
    await user.type(screen.getByTestId("actualTimeMin"), "250");
    await user.type(screen.getByTestId("defects"), "10"); // equals actualUnits → valid
    await user.type(screen.getByTestId("downtimeMin"), "0");

    expect(screen.getByRole("button", { name: /log run metrics/i })).not.toBeDisabled();
  });

  it("submit is enabled when defects are zero", async () => {
    const user = userEvent.setup();
    render(<ProductionTestForm />);
    await fillAllFields(user);
    // Override defects to 0 - clear and re-type
    await user.clear(screen.getByTestId("defects"));
    await user.type(screen.getByTestId("defects"), "0");

    expect(screen.getByRole("button", { name: /log run metrics/i })).not.toBeDisabled();
  });
});

// ── Schema unit tests ─────────────────────────────────────────────────────────
describe("productionSchema – Zod validation", () => {
  const base = {
    productName: "Widget Alpha",
    runDate: "2026-07-01",
    plannedUnits: 500,
    actualUnits: 480,
    plannedTimeMin: 240,
    actualTimeMin: 250,
    defects: 5,
    downtimeMin: 10,
  };

  it("accepts a valid payload", () => {
    expect(productionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects when productName is too short", () => {
    const r = productionSchema.safeParse({ ...base, productName: "W" });
    expect(r.success).toBe(false);
  });

  it("rejects when plannedTimeMin is 0 (must be ≥ 1)", () => {
    const r = productionSchema.safeParse({ ...base, plannedTimeMin: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toContain("plannedTimeMin");
  });

  it("rejects when actualUnits is negative", () => {
    const r = productionSchema.safeParse({ ...base, actualUnits: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects when defects exceed actualUnits", () => {
    const r = productionSchema.safeParse({ ...base, actualUnits: 10, defects: 11 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("defects");
      expect(r.error.issues[0].message).toMatch(
        /Defects cannot exceed Actual Units Produced/,
      );
    }
  });

  it("accepts when defects equal actualUnits (boundary)", () => {
    expect(
      productionSchema.safeParse({ ...base, actualUnits: 10, defects: 10 }).success,
    ).toBe(true);
  });

  it("accepts when defects are zero", () => {
    expect(productionSchema.safeParse({ ...base, defects: 0 }).success).toBe(true);
  });
});
