import { describe, expect, it } from "vitest";
import {
  fitFieldRange,
  fitRangeMessage,
  fitRangeProblems,
} from "../src/addons/fit-passport/lib/fit-passport";

// A slip of the finger in a measurement (a bust of 655, a length of 12) is caught before a piece
// is cut to it. The numbers below are the ones a shopper really sent on a ZH order.

const labels: Record<string, [string, string]> = {
  length: ["الطول", "Length"],
  bust: ["الصدر", "Bust"],
  sleeve: ["طول الكم", "Sleeve length"],
  shoulder: ["عرض الكتف", "Shoulder"],
};
const labelOf = (isAr: boolean) => (key: string) => labels[key]?.[isAr ? 0 : 1] ?? key;

describe("what a measurement can be", () => {
  it("has its own bounds for each known field, in inches", () => {
    expect(fitFieldRange("length", "in")).toEqual({ min: 20, max: 75 });
    expect(fitFieldRange("shoulder", "in")).toEqual({ min: 8, max: 30 });
  });

  it("gives the same bounds in centimetres", () => {
    expect(fitFieldRange("length", "cm")).toEqual({ min: 51, max: 191 });
  });

  it("gives a field it does not know the general bounds", () => {
    expect(fitFieldRange("ankle", "in")).toEqual({ min: 1, max: 120 });
  });
});

describe("measurements that cannot be right", () => {
  it("catches every one of the order's four", () => {
    const problems = fitRangeProblems({ length: 12, bust: 655, sleeve: 65, shoulder: 1 }, "in");
    expect(problems.map((p) => p.key)).toEqual(["length", "bust", "sleeve", "shoulder"]);
  });

  it("accepts ordinary measurements, a child's and a flat width", () => {
    expect(fitRangeProblems({ length: 54, bust: 36, sleeve: 24, shoulder: 15 }, "in")).toEqual([]);
    expect(fitRangeProblems({ length: 30, bust: 22, sleeve: 14, shoulder: 10 }, "in")).toEqual([]);
    // The brand's own chart measures the width flat: 21 to 26 inches.
    expect(fitRangeProblems({ length: 50, bust: 21, sleeve: 28 }, "in")).toEqual([]);
  });

  it("reads the same person's measurements in centimetres", () => {
    expect(fitRangeProblems({ length: 137, bust: 91, sleeve: 61, shoulder: 38 }, "cm")).toEqual([]);
    // 30 is a fine length in inches (a child) and far too short in centimetres.
    expect(fitRangeProblems({ length: 30 }, "in")).toEqual([]);
    expect(fitRangeProblems({ length: 30 }, "cm").map((p) => p.key)).toEqual(["length"]);
  });

  it("leaves empty and missing fields to the required-fields check", () => {
    expect(fitRangeProblems({ length: "", bust: 0, sleeve: "abc" }, "in")).toEqual([]);
    expect(fitRangeProblems(null, "in")).toEqual([]);
  });

  it("reads numbers typed as text", () => {
    expect(fitRangeProblems({ length: "54", bust: "655" }, "in").map((p) => p.key)).toEqual([
      "bust",
    ]);
  });
});

describe("what the shopper is told", () => {
  const problems = fitRangeProblems({ length: 12, bust: 655 }, "in");

  it("names each measurement and what it can be", () => {
    expect(fitRangeMessage(problems, labelOf(false), "in", false)).toBe(
      "Check these measurements: Length (20 to 75 in), Bust (10 to 80 in)",
    );
  });

  it("in Arabic, with the unit", () => {
    expect(fitRangeMessage(problems, labelOf(true), "in", true)).toBe(
      "تحقق من هذه القياسات: الطول (من 20 إلى 75 إنش)، الصدر (من 10 إلى 80 إنش)",
    );
    expect(
      fitRangeMessage(fitRangeProblems({ length: 30 }, "cm"), labelOf(true), "cm", true),
    ).toContain("سم");
  });
});
