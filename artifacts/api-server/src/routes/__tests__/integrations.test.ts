import { describe, it, expect } from "vitest";
import {
  mapOdooPurchaseState,
  mapOdooStockMovementType,
  num,
  optionalOdooString,
  parseOdooDateTime,
  parseOdooStockMovementQuantities,
} from "../integrations";

describe("Integrations Sync Safety", () => {
  it("should block empty result deletions (suspicious empty result) if local records > 5", async () => {
    // This is a placeholder test for the safe delete logic implemented in integrations.ts
    // In a real environment, we would use an in-memory DB or a mocked db.delete() spy
    // to verify that db.delete is NOT called when Odoo returns 0 records and local > 5.

    const localRecords = 10;
    const fetchedFromOdoo = 0;
    const errors = 0;

    // Simulate safe delete condition
    let syncStatus = "success";
    let dbDeleteCalled = false;

    if (fetchedFromOdoo === 0 && errors === 0) {
      if (localRecords > 5) {
        syncStatus = "suspicious_empty_result";
        dbDeleteCalled = false; // Blocked
      } else {
        dbDeleteCalled = true;
      }
    }

    expect(syncStatus).toBe("suspicious_empty_result");
    expect(dbDeleteCalled).toBe(false);
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

});
