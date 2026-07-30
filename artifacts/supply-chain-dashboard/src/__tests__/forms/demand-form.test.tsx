import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { demandSchema, type DemandFormValues } from "../../schemas/demand";

// ── Minimal test form ─────────────────────────────────────────────────────────
function DemandTestForm() {
  const form = useForm<DemandFormValues>({
    resolver: zodResolver(demandSchema),
    mode: "onChange",
  });

  return (
    <form>
      <input data-testid="productName" {...form.register("productName")} />
      <input data-testid="period" {...form.register("period")} />
      <input data-testid="actualDemand" type="number" {...form.register("actualDemand")} />
      <input data-testid="forecastedDemand" type="number" {...form.register("forecastedDemand")} />
      <button type="submit" disabled={!form.formState.isValid}>
        Log Record
      </button>
    </form>
  );
}

async function fillAllFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("productName"), "Steel Bearing 10mm");
  await user.type(screen.getByTestId("period"), "2026-07");
  await user.type(screen.getByTestId("actualDemand"), "1200");
  await user.type(screen.getByTestId("forecastedDemand"), "1100");
}

describe("Demand form – submit button disabled state", () => {
  it("submit is disabled on an empty form", () => {
    render(<DemandTestForm />);
    expect(screen.getByRole("button", { name: /log record/i })).toBeDisabled();
  });

  it("submit is enabled once all fields are valid", async () => {
    const user = userEvent.setup();
    render(<DemandTestForm />);
    await fillAllFields(user);
    expect(screen.getByRole("button", { name: /log record/i })).not.toBeDisabled();
  });

  it("submit is disabled when period has wrong format", async () => {
    const user = userEvent.setup();
    render(<DemandTestForm />);

    await user.type(screen.getByTestId("productName"), "Steel Bearing 10mm");
    await user.type(screen.getByTestId("period"), "07-2026"); // wrong format
    await user.type(screen.getByTestId("actualDemand"), "1200");
    await user.type(screen.getByTestId("forecastedDemand"), "1100");

    expect(screen.getByRole("button", { name: /log record/i })).toBeDisabled();
  });

  it("submit is disabled when productName is too short", async () => {
    const user = userEvent.setup();
    render(<DemandTestForm />);

    await user.type(screen.getByTestId("productName"), "X");
    await user.type(screen.getByTestId("period"), "2026-07");
    await user.type(screen.getByTestId("actualDemand"), "100");
    await user.type(screen.getByTestId("forecastedDemand"), "90");

    expect(screen.getByRole("button", { name: /log record/i })).toBeDisabled();
  });
});

// ── Schema unit tests ─────────────────────────────────────────────────────────
describe("demandSchema – Zod validation", () => {
  const base = {
    productName: "Steel Bearing 10mm",
    period: "2026-07",
    actualDemand: 1200,
    forecastedDemand: 1100,
  };

  it("accepts a valid payload", () => {
    expect(demandSchema.safeParse(base).success).toBe(true);
  });

  it("rejects when productName is too short", () => {
    const r = demandSchema.safeParse({ ...base, productName: "X" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toContain("productName");
  });

  it("rejects when period is invalid format (MM-YYYY)", () => {
    const r = demandSchema.safeParse({ ...base, period: "07-2026" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/YYYY-MM/);
    }
  });

  it("rejects when period has single-digit month (YYYY-M)", () => {
    const r = demandSchema.safeParse({ ...base, period: "2026-7" });
    expect(r.success).toBe(false);
  });

  it("rejects when actualDemand is negative", () => {
    const r = demandSchema.safeParse({ ...base, actualDemand: -1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toContain("actualDemand");
  });

  it("rejects when forecastedDemand is negative", () => {
    const r = demandSchema.safeParse({ ...base, forecastedDemand: -5 });
    expect(r.success).toBe(false);
  });

  it("accepts when both demand values are zero", () => {
    expect(
      demandSchema.safeParse({ ...base, actualDemand: 0, forecastedDemand: 0 }).success,
    ).toBe(true);
  });
});
