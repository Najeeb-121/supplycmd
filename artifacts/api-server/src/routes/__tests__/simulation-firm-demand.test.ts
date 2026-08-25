import { describe, expect, it } from "vitest";
import { isFirmDemand } from "../simulation";

describe("isFirmDemand", () => {
    it("includes confirmed sale demand", () => {
        expect(isFirmDemand("sale", "sale")).toBe(true);
    });

    it("includes completed demand", () => {
        expect(isFirmDemand("done", "done")).toBe(true);
    });

    it("excludes draft quotations", () => {
        expect(isFirmDemand("draft", "draft")).toBe(false);
    });

    it("excludes cancelled demand", () => {
        expect(isFirmDemand("cancel", "cancel")).toBe(false);
    });

    it("excludes mismatched statuses", () => {
        expect(isFirmDemand("sale", "draft")).toBe(false);
        expect(isFirmDemand("draft", "sale")).toBe(false);
    });
});