import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Design system ratchet.
 *
 * The visual audit found ~3,000 sub-legible text sizes, 222 hand-rolled
 * buttons and five competing radius scales — none of which arrived in a single
 * bad commit. They accumulated because nothing counted them.
 *
 * These budgets are ceilings, not targets. They may only ever move DOWN. When a
 * phase lands and a count drops, lower the budget in the same commit so the
 * ground that was won cannot be quietly given back.
 *
 * Budgets recorded at the end of Phase 1 (token foundation).
 *
 * 2026-09-22: while CI was red for unrelated reasons (format check, a
 * Playwright config crash) later phases quietly regressed several counts past
 * their budgets. The drift was cleaned up the same day and the original
 * ceilings restored; the ratchet is enforceable again.
 */

const SRC = path.resolve(__dirname, "../src");

/** Files that legitimately need raw hex — see Phase 1 notes. */
const HEX_EXEMPT = [
  // Merchants pick literal brand colours in these editors.
  "components/settings/QuickThemeCustomizer.tsx",
  "routes/_authenticated/admin.b.$slug.settings.tsx",
  // html2canvas / jspdf rasterise these and do not resolve CSS variables.
  "components/orders/InvoicePreview.tsx",
  "routes/invoice.$id.tsx",
  // Web manifest is served as JSON — CSS variables cannot be used there.
  "routes/$slug.manifest[.webmanifest].ts",
];

/** Directory/file prefixes with the same exemption rationale as HEX_EXEMPT. */
const HEX_EXEMPT_PREFIXES = [
  // The settings editors moved from the monolithic settings route into feature groups
  // (colour pickers with literal defaults, live invoice/hero previews).
  "features/settings/",
  // Brand wizard colour pickers and palette previews.
  "components/super-admin/brand-wizard/",
  // The content studio's creative palettes: html2canvas rasterises the stage and
  // does not resolve CSS variables (moved here from the studio route).
  "features/content-studio/",
  // Colour maths and per-vertical palette/colour-name data (not UI styling).
  "lib/logo-palette.ts",
  "lib/brand-palette-apply.ts",
  "lib/brand-templates/",
  "lib/color-names.ts",
];

function isHexExempt(rel: string): boolean {
  return HEX_EXEMPT.includes(rel) || HEX_EXEMPT_PREFIXES.some((p) => rel.startsWith(p));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** One-line truncations in the code today; the ceiling only moves down. */
const TRUNCATE_BUDGET = 209;

const FILES = walk(SRC).map((file) => ({
  rel: path.relative(SRC, file).split(path.sep).join("/"),
  source: fs.readFileSync(file, "utf-8"),
}));

function countMatches(pattern: RegExp, filter?: (rel: string) => boolean): number {
  let total = 0;
  for (const { rel, source } of FILES) {
    if (filter && !filter(rel)) continue;
    total += source.match(pattern)?.length ?? 0;
  }
  return total;
}

describe("design system guardrails", () => {
  it("crops every upload with a named preset, never a hand-picked aspect", () => {
    // The opening tag, skipping arrow functions in its props. A preset ties the crop ratio to the output size and to the surface that
    // renders it (tests/image-crop-system.test.tsx), so they cannot drift.
    const offenders: string[] = [];
    let uses = 0;
    for (const { rel, source } of FILES) {
      for (const match of source.matchAll(/<CropUploadButton\b(?:=>|[^>])*>/g)) {
        uses += 1;
        if (!/\bpreset=/.test(match[0]) || /\baspect=/.test(match[0])) offenders.push(rel);
      }
    }
    expect(uses).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("keeps text below the 12px legibility floor within budget", () => {
    // Phase 2 drives this to 0. Every one of these is an arbitrary pixel size
    // smaller than text-xs, which is already the smallest size worth shipping.
    const count = countMatches(/text-\[(?:[0-9]|10|11)(?:\.\d+)?px\]/g);
    expect(count).toBe(0);
  });

  it("keeps hand-rolled <button> elements within budget", () => {
    // AGENTS.md §2: anything that behaves like a button uses <Button>.
    const count = countMatches(/<button[\s>]/g);
    expect(count).toBeLessThanOrEqual(212);
  });

  it("lets card-like buttons wrap their text, within budget", () => {
    // <Button> never wraps (whitespace-nowrap in its base classes). A Button
    // made into a card (h-auto) with a name and a description then runs its
    // text out of the card: the brand wizard's typography, radius and plan
    // cards, and the vertical picker, did on phones. Give such a card
    // `whitespace-normal` (and `min-w-0` / `break-words` on its lines). The
    // rest are mostly short one-line links ("Clear", "Retry"); drain them.
    const offenders: string[] = [];
    for (const { rel, source } of FILES) {
      for (const match of source.matchAll(/<Button\b(?:=>|[^>])*>/g)) {
        if (/\bh-auto\b/.test(match[0]) && !/\bwhitespace-normal\b/.test(match[0])) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders.length).toBeLessThanOrEqual(53);
  });

  it("keeps glass and blur off data surfaces within budget", () => {
    // AGENTS.md §6: glassmorphism is for floating elements only.
    const count = countMatches(/backdrop-blur-[a-z0-9]+/g);
    expect(count).toBeLessThanOrEqual(49);
  });

  it("keeps opacity-hacked borders within budget", () => {
    // --border-subtle and --border-strong exist now; these should drain away.
    const count = countMatches(/border-border\/\d+/g);
    expect(count).toBe(0);
  });

  it("eliminates opacity hacks for text hierarchy", () => {
    // Phase 5.2: text hierarchy relies on semantic tokens, not opacity hacks.
    const count = countMatches(/text-muted-foreground\/\d+/g);
    expect(count).toBe(0);
  });

  it("enforces logical directional CSS utilities for RTL/LTR parity", () => {
    // Phase 5.3: physical margins, paddings, and borders migrated to logical properties.
    const physicalProps = countMatches(/\b(?:ml|mr|pl|pr)-[0-9.]+\b/g);
    expect(physicalProps).toBe(0);
  });

  it("keeps raw palette literals within budget", () => {
    // Semantic --success / --warning / --info / --destructive replace these.
    const count = countMatches(
      /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    );
    expect(count).toBeLessThanOrEqual(2446);
  });

  it("allows no new raw hex outside the files that genuinely need it", () => {
    const count = countMatches(/#[0-9a-fA-F]{6}\b/g, (rel) => !isHexExempt(rel));
    expect(count).toBeLessThanOrEqual(246);
  });

  it("routes every focus state through the shared two-pixel ring", () => {
    // AGENTS.md §3. This one is already at zero — keep it there.
    const thinFocusRings = countMatches(/focus(?:-visible)?:ring-1\b/g);
    expect(thinFocusRings).toBe(0);
  });

  it("defines semantic status tokens rather than leaving pages to guess", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf-8");
    for (const token of ["--success", "--warning", "--info", "--destructive"]) {
      expect(css).toContain(`${token}:`);
      expect(css).toContain(`${token}-foreground:`);
      expect(css).toContain(`${token}-subtle:`);
    }
    expect(css).toContain("--border-subtle:");
    expect(css).toContain("--border-strong:");
  });

  it("collapses the OS radius variables onto three roles", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf-8");
    // panel, window and dock must resolve to one value, not three.
    expect(css).toContain("--os-radius-window: var(--os-radius-panel)");
    expect(css).toContain("--os-radius-dock: var(--os-radius-panel)");
  });

  it("keeps the dark theme on the maroon brand hue", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf-8");
    const darkBlock = css.slice(css.indexOf(".dark {"), css.indexOf("@layer base"));
    // The old palette re-hued primary to a gold-tan (hue 70), which shipped a
    // different brand in dark mode than in light.
    expect(darkBlock).not.toMatch(/--primary:\s*oklch\([^)]*\s7\d\)/);
    expect(darkBlock).toMatch(/--primary:\s*oklch\([^)]*\s25\)/);
  });

  it("never cuts a product's name to one line", () => {
    // A name is what the shopper is choosing: cut on one line, half of "Soft transparency,
    // timeless elegance" is gone. A product title wraps onto two lines (and in a grid always
    // keeps the height of two, so a row's prices line up). Anything still cut is shown in full
    // by TruncationReveal on a rest of the mouse, a tap or a long press.
    const offenders: string[] = [];
    for (const { rel, source } of FILES) {
      for (const match of source.matchAll(/className="([^"]*\bproduct-title\b[^"]*)"/g)) {
        if (/\b(truncate|line-clamp-1|whitespace-nowrap)\b/.test(match[1])) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("writes an order's money in the reader's language on the order screens", () => {
    // `formatMoney(amount, currency)` with no language writes English ("BHD 30.000"): the order
    // page did, in Arabic, beside a list that wrote "30.000 د.ب.". An order screen says which
    // language it writes in. The invoice message (SendInvoiceDialog) keeps its own language.
    const orderScreens = (rel: string) =>
      (rel.startsWith("features/orders/") || rel.startsWith("components/orders/")) &&
      rel !== "components/orders/SendInvoiceDialog.tsx";
    const offenders: string[] = [];
    for (const { rel, source } of FILES) {
      if (!orderScreens(rel)) continue;
      for (const match of source.matchAll(/formatMoney\(([^()]|\([^()]*\))*\)/g)) {
        const args = match[0].slice("formatMoney(".length, -1);
        let depth = 0;
        let commas = 0;
        for (const c of args) {
          if (c === "(" || c === "[" || c === "{") depth += 1;
          else if (c === ")" || c === "]" || c === "}") depth -= 1;
          else if (c === "," && depth === 0) commas += 1;
        }
        if (commas === 1) offenders.push(`${rel}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps one-line truncation within budget", () => {
    // `truncate` hides the end of a text. It is right for a secondary line (an email under a
    // name, a file name) and wrong for the name itself: use `line-clamp-2 break-words` there.
    expect(countMatches(/\btruncate\b/g)).toBeLessThanOrEqual(TRUNCATE_BUDGET);
  });

  it("never makes a delivery or returns promise of its own on a shopper's screen", () => {
    // What a shopper is told about delivery and returns is the store's own settings, put into
    // words by `src/lib/delivery-info.ts` and `delivery-estimate.ts`. The product page once told
    // every store's shoppers "2-4 business days across all GCC countries, returns within 14
    // days", and checkout filled an unwritten time with "24 - 48 hours in Bahrain".
    const shopperScreens = (rel: string) =>
      rel.startsWith("routes/$slug.") ||
      rel.startsWith("components/storefront/") ||
      /^features\/(product-page|checkout|storefront-[a-z-]+|services-home)\//.test(rel);
    const promise =
      /\d+\s*[-–]\s*\d+\s*(business days|hours|أيام عمل|ساعة)|GCC countries|دول مجلس التعاون|within 14 days|خلال 14 يوم|fast delivery|توصيل سريع/i;
    const offenders = FILES.filter((file) => shopperScreens(file.rel) && promise.test(file.source));
    expect(offenders.map((file) => file.rel)).toEqual([]);
  });

  it("never sizes a grid column with a bare fr", () => {
    // `1fr` is `minmax(auto, 1fr)`: the column cannot get narrower than its widest content, so
    // one long product name pushes the page wider than a phone, and because the page hides
    // sideways overflow the edge is cut off (the checkout did this). Write `minmax(0,1fr)`;
    // Tailwind's own `grid-cols-2` already does.
    const offenders: string[] = [];
    for (const { rel, source } of FILES) {
      for (const match of source.matchAll(/grid-cols-\[([^\]]*)\]/g)) {
        if (match[1].split("_").some((track) => /^\d*\.?\d+fr$/.test(track))) {
          offenders.push(`${rel}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps a grid's implicit column from growing wider than its box", () => {
    // "grid gap-4" and "grid md:grid-cols-2" (below md) are one implicit `auto` column with the
    // same weakness. src/styles/layout-guards.css sizes it minmax(0, 1fr) for every such grid.
    const css = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf-8");
    const guards = fs.readFileSync(
      path.resolve(__dirname, "../src/styles/layout-guards.css"),
      "utf-8",
    );
    expect(css).toContain('@import "./styles/layout-guards.css";');
    expect(guards).toMatch(/@layer base\s*{[\s\S]*\.grid:not\(/);
    expect(guards).toContain("grid-auto-columns: minmax(0, 1fr);");
  });
});

describe("the phone layer (src/styles/mobile-native.css)", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");
  const stylesheets = [
    "src/styles.css",
    ...fs
      .readdirSync(path.resolve(__dirname, "../src/styles"))
      .filter((name) => name.endsWith(".css"))
      .map((name) => `src/styles/${name}`),
  ];

  /** The CSS with every `@media (...hover: hover...)` and reduced-motion block taken out. */
  function outsideHoverQueries(css: string): string {
    let out = "";
    let i = 0;
    while (i < css.length) {
      const at = css.slice(i).search(/@media[^{]*(hover:\s*hover|prefers-reduced-motion)[^{]*\{/);
      if (at < 0) return out + css.slice(i);
      out += css.slice(i, i + at);
      let j = i + at + css.slice(i + at).indexOf("{") + 1;
      for (let depth = 1; depth > 0 && j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
      }
      i = j;
    }
    return out;
  }

  it("keeps fields at 16px on a touch screen, so iOS does not zoom into them", () => {
    // The admin's list searches were 12px: tapping one zoomed the page and left it zoomed.
    expect(read("src/styles.css")).toContain('@import "./styles/mobile-native.css";');
    const rules = read("src/styles/mobile-native.css");
    expect(rules).toMatch(
      /@media \(pointer: coarse\)\s*{[\s\S]*\[class\*="text-xs"\][\s\S]*font-size: 16px;/,
    );
    // Not in a layer: it has to beat the utility classes.
    expect(rules.slice(0, rules.indexOf("@media (pointer: coarse)"))).not.toContain("@layer");
  });

  it("never takes zoom away", () => {
    const sources = import.meta.glob("../src/**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const offenders = Object.entries(sources)
      .filter(([, text]) => /maximum-scale|user-scalable\s*=\s*no/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("moves an element on hover only for a mouse", () => {
    // A finger has no hover: the browser keeps the first tap's :hover, so a card stayed lifted.
    const offenders = stylesheets.flatMap((file) =>
      [...outsideHoverQueries(read(file)).matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)]
        .filter(([, , body]) => /transform:\s*(?!none)/.test(body))
        .map(([, selector]) => `${file}: ${selector.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("a name's start edge (text-page-start)", () => {
  it("follows its parent's direction, not any ancestor's", () => {
    // `[dir="rtl"] .text-page-start` and `[dir="ltr"] .text-page-start` both matched an Arabic
    // invoice inside a left-to-right <html>; the later rule won and "Abaya | Sahab" sat left.
    const guards = fs.readFileSync(
      path.resolve(__dirname, "../src/styles/layout-guards.css"),
      "utf-8",
    );
    expect(guards).toMatch(/:dir\(rtl\) > \.text-page-start\s*{\s*text-align: right;/);
    expect(guards).toMatch(/:dir\(ltr\) > \.text-page-start\s*{\s*text-align: left;/);
    expect(guards).not.toMatch(/\[dir="(rtl|ltr)"\] \.text-page-start/);
  });
});
