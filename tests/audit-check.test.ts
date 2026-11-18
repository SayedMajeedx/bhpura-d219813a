import { describe, expect, it } from "vitest";
import { advisoriesOf, auditFindings } from "../scripts/audit-check.mjs";
import allowlist from "../scripts/audit-allowlist.json";

// The CI audit fails on high and critical advisories, except those excused with a reason and a
// review date (an advisory widened to every version with no fix, 2026-11-17, failed every branch).

const PICO = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const report = {
  vulnerabilities: {
    picomatch: {
      severity: "high",
      via: [{ url: PICO, name: "picomatch", severity: "high", title: "ReDoS" }],
    },
    vite: { severity: "high", via: ["picomatch"] },
    seroval: {
      severity: "moderate",
      via: [{ url: "https://github.com/advisories/GHSA-x", name: "seroval", severity: "moderate" }],
    },
  },
};
const excuse = {
  advisories: [{ url: PICO, package: "picomatch", reason: "build only", reviewBy: "2026-12-18" }],
};

describe("the dependency audit", () => {
  it("reads each advisory once, not the packages that only depend on it", () => {
    expect(advisoriesOf(report).map((a) => a.package)).toEqual(["picomatch", "seroval"]);
  });

  it("fails on a high advisory nobody excused, and ignores moderate ones", () => {
    expect(auditFindings(report, { advisories: [] }, "2026-11-18")).toEqual([
      expect.objectContaining({ url: PICO, why: "not excused" }),
    ]);
  });

  it("passes an excused advisory until its review date, then fails again", () => {
    expect(auditFindings(report, excuse, "2026-12-18")).toEqual([]);
    expect(auditFindings(report, excuse, "2026-12-19")).toEqual([
      expect.objectContaining({ url: PICO, why: "excused until 2026-12-18: review it again" }),
    ]);
  });

  it("keeps every excuse explained and dated", () => {
    for (const entry of allowlist.advisories) {
      expect(entry.url).toMatch(/^https:\/\/github\.com\/advisories\/GHSA-/);
      expect(entry.reason.length).toBeGreaterThan(40);
      expect(entry.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
