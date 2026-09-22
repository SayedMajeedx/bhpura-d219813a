import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Boutq serves every vertical and every audience, so user-facing Arabic must be
 * gender-neutral. The convention is the masculine-singular imperative, which is
 * the generic form in Arabic UI ("اشترك", "اختر", "أدخل"), and a kasra-free
 * pronoun suffix ("اشتراكك", not "اشتراككِ"). Impersonal phrasing ("يرجى
 * المحاولة") is also fine.
 *
 * This guard fails on the feminine forms that kept coming back: the original
 * copy was written for a single abaya brand and addressed women directly.
 */

/**
 * Feminine second-person imperatives, matched only as whole Arabic words so
 * masculine plurals that merely end in the same letters ("المتسوقين",
 * "المسجلين") and place names ("العدلية") do not trip the guard.
 */
const FEMININE_IMPERATIVES = [
  "تسوقي",
  "تسوّقي",
  "اشتركي",
  "اختاري",
  "صممي",
  "صمّمي",
  "سجلي",
  "سجّلي",
  "أكملي",
  "اكملي",
  "احصلي",
  "تابعي",
  "ابحثي",
  "جربي",
  "جرّبي",
  "شاركي",
  "أضيفي",
  "اكتبي",
  "حددي",
  "حدّدي",
  "راجعي",
  "ادخلي",
  "أدخلي",
  "انقري",
  "اضغطي",
  "قومي",
  "تأكدي",
  "استخدمي",
  "ارفعي",
  "حمّلي",
  "افتحي",
  "أكدي",
  "حاولي",
  "اطلبي",
  "تفضلي",
  "انتظري",
  "زوري",
  "اكتشفي",
  "استمتعي",
  "املئي",
  "عدّلي",
  "امسحي",
  "احذفي",
  "انسخي",
  "ألغي",
  "أنشئي",
  "ابدئي",
  "اضبطي",
  "قفي",
  "لفي",
  "لُفي",
  "قيسي",
  "ضعي",
  "خذي",
  "ارتدي",
  "اربطي",
  "امسكي",
  "عزيزتي",
  "عميلتنا",
];

const ARABIC = "؀-ۿ";
const verbPattern = new RegExp(
  `(^|[^${ARABIC}])(${FEMININE_IMPERATIVES.join("|")})([^${ARABIC}]|$)`,
  "u",
);
/** An explicit kasra on a 2nd-person suffix is always the feminine address. */
const feminineSuffixPattern = new RegExp(`[${ARABIC}]+كِ`, "u");

const ROOTS = ["src", "apps", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", "build", ".wrangler"]);
const EXTS = /\.(ts|tsx|sql)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.test(entry)) out.push(full);
  }
  return out;
}

const FILES = ROOTS.flatMap((r) => walk(resolve(process.cwd(), r))).map((file) => ({
  rel: file.split(/[\\/]/).slice(-4).join("/"),
  lines: readFileSync(file, "utf8").split("\n"),
}));

function findViolations(pattern: RegExp) {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const { rel, lines } of FILES) {
    lines.forEach((line, i) => {
      // Comments are not user-facing copy.
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("--")) return;
      if (pattern.test(line)) hits.push({ file: rel, line: i + 1, text: trimmed.slice(0, 110) });
    });
  }
  return hits;
}

describe("Arabic copy stays gender-neutral", () => {
  it("uses no feminine second-person imperatives", () => {
    const violations = findViolations(verbPattern);
    expect(
      violations,
      `Use the masculine-singular imperative (the generic form) or impersonal phrasing:\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("uses no explicitly feminine pronoun suffix (ـكِ)", () => {
    const violations = findViolations(feminineSuffixPattern);
    expect(
      violations,
      `Drop the kasra so the suffix reads as the generic "ـك":\n${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it("actually scans the codebase", () => {
    // Guards against the walker silently finding nothing and the suite passing vacuously.
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES.some((f) => f.lines.some((l) => /[؀-ۿ]/.test(l)))).toBe(true);
  });
});

describe("shared storefront copy is vertical-neutral", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("keeps apparel wording out of the generic bundle offer", () => {
    // BundleOffer renders on every vertical, so "الطقم" (outfit/set) and
    // "التنسيق" (styling) cannot appear in it.
    const bundle = read("src/components/storefront/BundleOffer.tsx");
    for (const word of ["الطقم", "التنسيق"]) {
      expect(bundle, `BundleOffer must not say "${word}"`).not.toContain(word);
    }
    expect(bundle).toContain("أكمل طلبك");
  });

  it("keeps the pricing setting description in sync with the bundle label", () => {
    expect(read("src/features/settings/tabs/orders/PricingGroup.tsx")).toContain("أكمل طلبك");
  });
});
