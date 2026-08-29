import { describe, expect, it } from "vitest";
import {
    ImportOrderStatus,
    optionalNum,
    parseDate,
    requiredNum,
} from "../import";

describe("import parsing", () => {
    describe("requiredNum", () => {
        it("preserves valid zero and decimal values", () => {
            expect(requiredNum("0")).toBe(0);
            expect(requiredNum("12.5")).toBe(12.5);
        });

        it("rejects missing and invalid numeric values", () => {
            expect(requiredNum("")).toBeNaN();
            expect(requiredNum("not-a-number")).toBeNaN();
            expect(requiredNum("Infinity")).toBeNaN();
        });
    });

    describe("optionalNum", () => {
        it("distinguishes missing data from zero", () => {
            expect(optionalNum("")).toBeUndefined();
            expect(optionalNum("0")).toBe(0);
        });

        it("rejects malformed supplied values", () => {
            expect(optionalNum("invalid")).toBeNaN();
            expect(optionalNum("Infinity")).toBeNaN();
        });
    });

    describe("parseDate", () => {
        it("accepts supported valid date formats", () => {
            expect(parseDate("2026-08-29")).toBe("2026-08-29");
            expect(parseDate("08/29/2026")).toBe("2026-08-29");
            expect(parseDate("29-08-2026")).toBe("2026-08-29");
        });

        it("accepts valid leap days", () => {
            expect(parseDate("2028-02-29")).toBe("2028-02-29");
        });

        it("rejects impossible and unsupported dates", () => {
            expect(parseDate("2026-02-29")).toBeNull();
            expect(parseDate("02/30/2026")).toBeNull();
            expect(parseDate("29/08/2026")).toBeNull();
            expect(parseDate("August 29, 2026")).toBeNull();
            expect(parseDate("")).toBeNull();
        });

        it("converts Excel serial dates deterministically", () => {
            expect(parseDate("25569")).toBe("1970-01-01");
        });
    });

    describe("ImportOrderStatus", () => {
        it("accepts supported statuses and rejects missing or unknown values", () => {
            expect(ImportOrderStatus.safeParse("pending").success).toBe(true);
            expect(ImportOrderStatus.safeParse("delivered").success).toBe(true);
            expect(ImportOrderStatus.safeParse("").success).toBe(false);
            expect(ImportOrderStatus.safeParse("unknown").success).toBe(false);
        });
    });
});