import { describe, expect, it } from "vitest";
import { inspectionResultMessage } from "../src/lib/returns-inspection-message";

// After inspecting a returned piece, staff are told what the database did with it.

describe("the message after inspecting a returned piece", () => {
  it("says it went back into stock, with the quantity", () => {
    expect(inspectionResultMessage({ restocked: true }, 2, false)).toBe(
      "Item inspected and restocked (+2) successfully",
    );
    expect(inspectionResultMessage({ restocked: true }, 2, true)).toContain("(+2)");
  });

  it("says a made-to-order piece was not added to ready stock", () => {
    expect(inspectionResultMessage({ restocked: false, madeToOrder: true }, 1, false)).toMatch(
      /made to order, so it is not added to ready stock/,
    );
    expect(inspectionResultMessage({ restocked: false, madeToOrder: true }, 1, true)).toMatch(
      /حسب الطلب/,
    );
  });

  it("just records the inspection otherwise (a damaged piece)", () => {
    expect(inspectionResultMessage({ restocked: false }, 1, false)).toBe(
      "Item inspection recorded successfully",
    );
  });
});
