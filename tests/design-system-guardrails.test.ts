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
 */

const SRC = path.resolve(__dirname, "../src");

/** Files that legitimately need raw hex — see Phase 1 notes. */
const HEX_EXEMPT = [
  // Merchants pick literal brand colours in these editors.
  "components/settings/QuickThemeCustomizer.tsx",
  "routes/_authenticated/admin.b.$slug.settings.tsx",
  "routes/_authenticated/admin.b.$slug.content-studio.tsx",
  // html2canvas / jspdf rasterise these and do not resolve CSS variables.
  "components/orders/InvoicePreview.tsx",
  "routes/invoice.$id.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

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
  it("keeps text below the 12px legibility floor within budget", () => {
    // Phase 2 drives this to 0. Every one of these is an arbitrary pixel size
    // smaller than text-xs, which is already the smallest size worth shipping.
    const count = countMatches(/text-\[(?:[0-9]|10|11)(?:\.\d+)?px\]/g);
    expect(count).toBe(0);
  });

  it("keeps hand-rolled <button> elements within budget", () => {
    // AGENTS.md §2: anything that behaves like a button uses <Button>.
    const count = countMatches(/<button[\s>]/g);
    expect(count).toBeLessThanOrEqual(223);
  });

  it("keeps glass and blur off data surfaces within budget", () => {
    // AGENTS.md §6: glassmorphism is for floating elements only.
    const count = countMatches(/backdrop-blur-[a-z0-9]+/g);
    expect(count).toBeLessThanOrEqual(60);
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
    expect(count).toBeLessThanOrEqual(2524);
  });

  it("allows no new raw hex outside the files that genuinely need it", () => {
    const count = countMatches(/#[0-9a-fA-F]{6}\b/g, (rel) => !HEX_EXEMPT.includes(rel));
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
});
