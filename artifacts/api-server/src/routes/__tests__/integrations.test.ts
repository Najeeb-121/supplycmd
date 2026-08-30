import { describe, it, expect } from "vitest";
import {
  getOdooCleanupDecision,
  mapOdooPurchaseState,
  mapOdooStockMovementType,
  num,
  optionalOdooString,
  parseNonNegativeOdooNumber,
  parseOdooDateTime,
  parseOdooStockMovementQuantities,
  parseOdooWorkOrderTiming,
  parsePositiveOdooNumber,
  parsePositiveOdooId,
} from "../integrations";

describe("Integrations Sync Safety", () => {
  it("preserves records after any failed Odoo record", () => {
    expect(getOdooCleanupDecision(10, 1, 20)).toBe(
      "preserve_failed",
    );
  });

  it("deletes only missing records after a successful non-empty fetch", () => {
    expect(getOdooCleanupDecision(10, 0, 20)).toBe(
      "delete_missing",
    );
  });

  it("blocks suspicious empty-result deletion when local records exceed five", () => {
    expect(getOdooCleanupDecision(0, 0, 10)).toBe(
      "preserve_suspicious_empty",
    );
  });

  it("allows an authoritative empty result to delete five or fewer records", () => {
    expect(getOdooCleanupDecision(0, 0, 5)).toBe(
      "delete_all",
    );
  });

  it("should calculate lead time correctly based on historical orders", () => {
    // Lead time = deliveryDate - createdAt
    const createdAt = new Date("2024-01-01T00:00:00Z").getTime();
    const deliveredAt = new Date("2024-01-10T00:00:00Z").getTime();

    const leadTimeDays = (deliveredAt - createdAt) / (1000 * 60 * 60 * 24);

    expect(leadTimeDays).toBe(9);
  });
});

describe("Odoo integration parsing", () => {
  it("preserves real zero and valid numeric values", () => {
    expect(num(0)).toBe(0);
    expect(num("0")).toBe(0);
    expect(num(125.5)).toBe(125.5);
    expect(num("125.5")).toBe(125.5);
  });

  it("rejects missing, false, malformed, and infinite values", () => {
    expect(num(null)).toBeNaN();
    expect(num(undefined)).toBeNaN();
    expect(num(false)).toBeNaN();
    expect(num("")).toBeNaN();
    expect(num("invalid")).toBeNaN();
    expect(num("Infinity")).toBeNaN();
  });

  it("maps supported Odoo purchase states explicitly", () => {
    expect(mapOdooPurchaseState("draft")).toBe("pending");
    expect(mapOdooPurchaseState("sent")).toBe("pending");
    expect(mapOdooPurchaseState("to approve")).toBe("pending");
    expect(mapOdooPurchaseState("purchase")).toBe("confirmed");
    expect(mapOdooPurchaseState("done")).toBe("delivered");
    expect(mapOdooPurchaseState("cancel")).toBe("cancelled");
  });

  it("rejects missing and unsupported Odoo purchase states", () => {
    expect(mapOdooPurchaseState(null)).toBeNull();
    expect(mapOdooPurchaseState("unknown")).toBeNull();
  });

  it("preserves moved quantity without fabricating stock balances", () => {
    expect(parseOdooStockMovementQuantities(0)).toEqual({
      quantityBefore: null,
      quantityChanged: 0,
      quantityAfter: null,
    });

    expect(parseOdooStockMovementQuantities("125.5")).toEqual({
      quantityBefore: null,
      quantityChanged: 125.5,
      quantityAfter: null,
    });
  });

  it("rejects missing and invalid stock movement quantities", () => {
    expect(parseOdooStockMovementQuantities(null)).toBeNull();
    expect(parseOdooStockMovementQuantities(false)).toBeNull();
    expect(parseOdooStockMovementQuantities("")).toBeNull();
    expect(parseOdooStockMovementQuantities("invalid")).toBeNull();
    expect(parseOdooStockMovementQuantities("Infinity")).toBeNull();
  });

  it("parses valid Odoo movement datetimes as UTC", () => {
    expect(
      parseOdooDateTime("2026-08-12 11:52:59")?.toISOString(),
    ).toBe("2026-08-12T11:52:59.000Z");

    expect(
      parseOdooDateTime("2024-02-29 00:00:00")?.toISOString(),
    ).toBe("2024-02-29T00:00:00.000Z");
  });

  it("rejects missing, malformed, and impossible Odoo datetimes", () => {
    expect(parseOdooDateTime(null)).toBeNull();
    expect(parseOdooDateTime(false)).toBeNull();
    expect(parseOdooDateTime("")).toBeNull();
    expect(parseOdooDateTime("2026-02-29 00:00:00")).toBeNull();
    expect(parseOdooDateTime("2026-13-01 00:00:00")).toBeNull();
    expect(parseOdooDateTime("not-a-date")).toBeNull();
  });

  it("maps verified Odoo picking codes to movement types", () => {
    expect(mapOdooStockMovementType("incoming", false)).toBe(
      "goods_receipt",
    );
    expect(mapOdooStockMovementType("outgoing", false)).toBe(
      "goods_issue",
    );
    expect(mapOdooStockMovementType("internal", false)).toBe(
      "transfer",
    );
  });

  it("classifies returned moves before their picking direction", () => {
    expect(
      mapOdooStockMovementType(
        "incoming",
        [42, "Original Delivery"],
      ),
    ).toBe("return");
  });

  it("does not guess unsupported or missing movement types", () => {
    expect(mapOdooStockMovementType("mrp_operation", false)).toBeNull();
    expect(mapOdooStockMovementType("repair_operation", false)).toBeNull();
    expect(mapOdooStockMovementType(null, false)).toBeNull();
    expect(mapOdooStockMovementType("incoming", false)).not.toBe(
      "transfer",
    );
  });

  it("normalizes optional Odoo reference strings", () => {
    expect(optionalOdooString("  PO-123  ")).toBe("PO-123");
    expect(optionalOdooString("Product Quantity Updated")).toBe(
      "Product Quantity Updated",
    );
  });

  it("rejects missing and non-string Odoo references", () => {
    expect(optionalOdooString(null)).toBeNull();
    expect(optionalOdooString(false)).toBeNull();
    expect(optionalOdooString("")).toBeNull();
    expect(optionalOdooString("   ")).toBeNull();
    expect(optionalOdooString(123)).toBeNull();
  });

  it("preserves valid non-negative Odoo quantities", () => {
    expect(parseNonNegativeOdooNumber(0)).toBe(0);
    expect(parseNonNegativeOdooNumber(12.75)).toBe(12.75);
    expect(parseNonNegativeOdooNumber("12.75")).toBe(12.75);
  });

  it("rejects invalid or negative Odoo quantities", () => {
    expect(parseNonNegativeOdooNumber(null)).toBeNull();
    expect(parseNonNegativeOdooNumber(false)).toBeNull();
    expect(parseNonNegativeOdooNumber("")).toBeNull();
    expect(parseNonNegativeOdooNumber(-1)).toBeNull();
    expect(parseNonNegativeOdooNumber("invalid")).toBeNull();
    expect(parseNonNegativeOdooNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("preserves valid positive Odoo quantities", () => {
    expect(parsePositiveOdooNumber(1)).toBe(1);
    expect(parsePositiveOdooNumber(0.01)).toBe(0.01);
    expect(parsePositiveOdooNumber("12.75")).toBe(12.75);
  });

  it("rejects zero, negative, or invalid positive quantities", () => {
    expect(parsePositiveOdooNumber(null)).toBeNull();
    expect(parsePositiveOdooNumber(false)).toBeNull();
    expect(parsePositiveOdooNumber(0)).toBeNull();
    expect(parsePositiveOdooNumber(-1)).toBeNull();
    expect(parsePositiveOdooNumber("invalid")).toBeNull();
    expect(parsePositiveOdooNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("aggregates verified completed Odoo work-order timing", () => {
    expect(
      parseOdooWorkOrderTiming([
        {
          duration_expected: 30,
          duration: 25,
          state: "done",
        },
        {
          duration_expected: 45,
          duration: 40,
          state: "done",
        },
      ]),
    ).toEqual({
      plannedTimeMin: 75,
      actualTimeMin: 65,
    });
  });

  it("preserves planned timing but withholds incomplete actual timing", () => {
    expect(
      parseOdooWorkOrderTiming([
        {
          duration_expected: 30,
          duration: 10,
          state: "progress",
        },
        {
          duration_expected: 45,
          duration: false,
          state: "pending",
        },
      ]),
    ).toEqual({
      plannedTimeMin: 75,
      actualTimeMin: null,
    });
  });

  it("rejects missing or non-positive expected work-order timing", () => {
    expect(parseOdooWorkOrderTiming([])).toBeNull();
    expect(
      parseOdooWorkOrderTiming([
        {
          duration_expected: 0,
          duration: 0,
          state: "done",
        },
      ]),
    ).toBeNull();
    expect(
      parseOdooWorkOrderTiming([
        {
          duration_expected: false,
          duration: 10,
          state: "done",
        },
      ]),
    ).toBeNull();

  });

  it("accepts positive integer Odoo IDs", () => {
    expect(parsePositiveOdooId(1)).toBe(1);
    expect(parsePositiveOdooId(380)).toBe(380);
  });

  it("rejects invalid Odoo IDs", () => {
    expect(parsePositiveOdooId(null)).toBeNull();
    expect(parsePositiveOdooId(false)).toBeNull();
    expect(parsePositiveOdooId("380")).toBeNull();
    expect(parsePositiveOdooId(0)).toBeNull();
    expect(parsePositiveOdooId(-1)).toBeNull();
    expect(parsePositiveOdooId(1.5)).toBeNull();
    expect(parsePositiveOdooId(Number.NaN)).toBeNull();

  });

});
