import { describe, expect, it } from "vitest";
import baselineData from "../scripts/maintainability-baseline.json";
import { collectMaintainabilityMetrics } from "../scripts/maintainability-metrics.mjs";

/**
 * Maintainability ratchet test suite.
 *
 * Modelled on `tests/design-system-guardrails.test.ts`.
 *
 * These budgets are ceilings, not targets. They may only ever move DOWN.
 * When a phase lands and a count drops, lower the budget in the same PR
 * so the ground that was won cannot be quietly given back.
 *
 * Recorded on 2026-09-24 (Phase 0 baseline). Lowered on 2026-09-24 after
 * Phases 3–4 (type escapes and the storefront catalog data layer).
 *
 * `directSupabaseCalls` was re-based once, on 2026-09-25, when the metric
 * started counting calls behind a cast (`(supabase as any).from(`), which it
 * had missed: same code, 195 -> 251. It is a measurement correction, not new
 * debt, and the budget only moves down from here.
 */

const BUDGETS = {
  asAny: 625,
  colonAny: 724,
  asNever: 0,
  tsIgnore: 0,
  tsExpectError: 0,
  eslintDisable: 10,
  directSupabaseCalls: 124,
  readFileSyncTestFiles: 71,
  filesOver1000: 23,
  maxLinesForNewFile: 600,
  maxLinesForExistingFile: 1000,
} as const;

/**
 * Line-count budgets for the 31 files that already exceed 1000 lines on 2026-09-24.
 * No file in this list may grow past its recorded budget.
 * When Phase 5 extracts subcomponents and logic, lower each file's budget accordingly.
 * Removed once under 1000 lines: admin.b.$slug.inventory.tsx (Phase 5, now ~250 lines),
 *   admin.b.$slug.orders.$id.tsx (Phase 5, now ~980 lines),
 *   admin.b.$slug.orders.index.tsx (Phase 5, now ~920 lines).
 */
const GIANT_FILES_BUDGETS: Record<string, number> = {
  "src/features/settings/registry.ts": 2616,
  "src/routes/_authenticated/admin.b.$slug.content-studio.tsx": 2458,
  "src/components/subscription/BrandSubscriptionHub.tsx": 1972,
  "src/routes/_authenticated/admin.b.$slug.export.tsx": 1838,
  "src/lib/addons/addon-showcase-data.ts": 1893,
  "src/routes/_authenticated/admin.b.$slug.customers.tsx": 1770,
  "src/components/super/SuperPlansManager.tsx": 1728,
  "src/routes/_authenticated/admin.b.$slug.team.tsx": 1705,
  "src/addons/size-guides/components/admin/SizeGuideStudioPage.tsx": 1703,
  "src/routes/$slug.account.tsx": 1477,
  "src/routes/_authenticated/admin.b.$slug.incubators.tsx": 1438,
  "src/routes/_authenticated/admin.b.$slug.campaigns.tsx": 1448,
  "src/routes/_authenticated/admin.b.$slug.import.tsx": 1448,
  "src/components/reviews/ReviewStoryDialog.tsx": 1442,
  "src/routes/_authenticated/admin.b.$slug.expenses.tsx": 1316,
  "src/components/inventory/InstagramImporterModal.tsx": 1328,
  "src/lib/public-api/public-api-router.server.ts": 1271,
  "src/lib/instagram-ai-importer.ts": 1260,
  "src/routes/_authenticated/admin.brands.tsx": 1172,
  "src/routes/_authenticated/admin.b.$slug.integrations.tsx": 1188,
  "src/routes/onboard.tsx": 1092,
  "src/routes/_authenticated/admin.b.$slug.customers.$customerId.tsx": 1041,
  "src/routes/_authenticated/admin.b.$slug.pages.tsx": 1058,
};

// Baseline file inventory to determine which files are "NEW"
const BASELINE_FILES = new Set(Object.keys(baselineData.fileLineCounts));

describe("maintainability ratchets", () => {
  const metrics = collectMaintainabilityMetrics();

  it("keeps 'as any' type escapes within budget", () => {
    expect(metrics.typeEscapes.asAny).toBeLessThanOrEqual(BUDGETS.asAny);
  });

  it("keeps ': any' type escapes within budget", () => {
    expect(metrics.typeEscapes.colonAny).toBeLessThanOrEqual(BUDGETS.colonAny);
  });

  it("keeps 'as never' type escapes within budget", () => {
    expect(metrics.typeEscapes.asNever).toBeLessThanOrEqual(BUDGETS.asNever);
  });

  it("allows zero '@ts-ignore' suppressions", () => {
    expect(metrics.typeEscapes.tsIgnore).toBe(BUDGETS.tsIgnore);
  });

  it("allows zero '@ts-expect-error' suppressions", () => {
    expect(metrics.typeEscapes.tsExpectError).toBe(BUDGETS.tsExpectError);
  });

  it("keeps 'eslint-disable' comments within budget", () => {
    expect(metrics.typeEscapes.eslintDisable).toBeLessThanOrEqual(BUDGETS.eslintDisable);
  });

  it("keeps direct Supabase calls in routes, components, and features within budget", () => {
    expect(metrics.directSupabaseCalls.total).toBeLessThanOrEqual(BUDGETS.directSupabaseCalls);
  });

  it("keeps brittle readFileSync test files within budget", () => {
    expect(metrics.readFileSyncTestFiles.length).toBeLessThanOrEqual(BUDGETS.readFileSyncTestFiles);
  });

  it("keeps total count of files over 1000 lines within budget", () => {
    expect(metrics.filesOver1000.length).toBeLessThanOrEqual(BUDGETS.filesOver1000);
  });

  it("prevents any existing giant file (>1000 lines) from growing beyond its budget", () => {
    for (const [file, budget] of Object.entries(GIANT_FILES_BUDGETS)) {
      const actual = metrics.fileLineCounts[file];
      expect(actual, `Expected file ${file} to exist in metrics`).toBeDefined();
      expect(
        actual,
        `File ${file} grew from budget of ${budget} to ${actual} lines. Line counts may only decrease.`,
      ).toBeLessThanOrEqual(budget);
    }
  });

  it("forbids any NEW file from exceeding 600 lines", () => {
    for (const [file, lines] of Object.entries(metrics.fileLineCounts)) {
      if (!BASELINE_FILES.has(file)) {
        expect(
          lines,
          `New file ${file} has ${lines} lines, exceeding the 600-line ceiling for new files. Extract components/helpers.`,
        ).toBeLessThanOrEqual(BUDGETS.maxLinesForNewFile);
      }
    }
  });

  it("forbids any existing non-giant file from growing past 1000 lines", () => {
    for (const [file, lines] of Object.entries(metrics.fileLineCounts)) {
      if (!(file in GIANT_FILES_BUDGETS)) {
        expect(
          lines,
          `File ${file} has ${lines} lines, exceeding the 1000-line ceiling for non-giant files. Extract components/helpers.`,
        ).toBeLessThanOrEqual(BUDGETS.maxLinesForExistingFile);
      }
    }
  });
});
