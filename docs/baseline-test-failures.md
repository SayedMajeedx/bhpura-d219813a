# Baseline Test Failures Documentation

This document records the **pre-existing baseline test failures** identified during the repository audit and format pass (`chore/format-base-branch`). Per engineering guardrails (§9 in `AGENTS.md`), existing tests are never silently deleted, weakened, or rewritten to force a pass outside their assigned scope.

---

## Suite Summary
- **Total Test Files Evaluated**: 146 files
- **Total Tests Passing**: 919 tests
- **Overall Pass Rate**: > 98.5%
- **All Storefront 2.0 & Brand Wizard Tests**: 100% Passing (35/35 Vitest + 12/12 Playwright)

---

## Detailed Breakdown of Pre-Existing Baseline Failures

### 1. Design System Guardrail Budgets (`tests/design-system-guardrails.test.ts`) — 6 Failures
- **`keeps text below the 12px legibility floor within budget`**: Legacy components across the codebase contain text smaller than 12px exceeding the static AST budget.
- **`keeps hand-rolled <button> elements within budget`**: Legacy components use raw HTML `<button>` elements instead of the unified `<Button>` shadcn component.
- **`keeps glass and blur off data surfaces within budget`**: Pre-existing data tables and metric cards retain legacy backdrop-blur classes.
- **`keeps opacity-hacked borders within budget`**: Legacy neutral borders using opacity hacks (e.g. `border-neutral-100/50`) instead of `border-border`.
- **`eliminates opacity hacks for text hierarchy`**: Legacy text elements using opacity hacks instead of `text-muted-foreground`.
- **`routes every focus state through the shared two-pixel ring`**: Legacy components with custom or missing focus ring outlines.

### 2. Formatting Behavior (`tests/formatting.behavior.test.ts`) — 2 Failures
- **`translates units to Arabic in Arabic locale`**: Expectation mismatch on whether unit abbreviation 'g' should render as 'غرام' or stay standardized.
- **`handles missing size or unit gracefully`**: Edge case handling in variant size formatting when size and unit are partially undefined.

### 3. Addon Registry Integration (`tests/addon-registry.test.ts`) — 1 Failure
- **`lists all registered addons`**: Registry manifest count assertion expectation drift from recently added vertical packages.

### 4. Vanilla Core Guardrails (`tests/vanilla-core-guard.test.ts`) — 1 Failure
- **`verifies that vertical keywords do not leak into vanilla core files`**: Core utility and add-on wrapper files contain mentions of vertical types (e.g., abayas, fashion) awaiting extraction into pure registry metadata.

### 5. Products Made to Order (`tests/products-made-to-order.test.ts`) — 1 Failure
- **`shows custom tailoring banner when item location is custom or manual`**: Component banner DOM condition expects specific mock order item location structure.

### 6. Fit Passport Integration (`tests/fit-passport.test.ts`) — 1 Failure
- **`generates display variant parts omitting placeholder sizes`**: Variant helper output structure difference when omitting placeholder strings.

### 7. Food & Sweets Variant Refinement (`tests/food-sweets-variants-refinement.test.ts`) — 1 Failure
- **`splits '700 - عادية' with unit 'g' cleanly`**: Regular expression tokenizer delimiter expectation for composite sweets size strings.

---

## Isolation & Confidence
These baseline failures represent pre-existing architectural debt on the base branch and do **not** affect Storefront 2.0 or Brand Wizard functionality:
- All Storefront 2.0 Layer 1, 2, and 3 test suites (`storefront-v2-foundation.test.ts`, `storefront-v2-layer2.test.ts`, `storefront-v2-layer3.test.ts`, `brand-templates.test.ts`) pass at **100%** (35/35 passing).
- All 12 Playwright E2E suites (`hero-fallback.spec.ts`, `pdp-v2.spec.ts`, `motion-a11y.spec.ts`, `quick-view.spec.ts`, `brand-wizard.spec.ts`) pass at **100%** (12/12 passing).
