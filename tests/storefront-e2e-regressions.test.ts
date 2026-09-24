import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFooterVariant } from "../src/lib/storefront-engine";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Regressions found by driving the real storefront and admin in a browser.
 * Each test pins a specific defect that was measured, not inferred.
 */

describe("consent banner does not cover the mobile purchase bar", () => {
  it("renders inside the storefront shell", () => {
    const route = read("src/routes/$slug.route.tsx");
    // Mounted outside the shell it inherited the admin font stack and pulled
    // ~229 KB of fonts (Readex Pro + Zarid Display) nothing else uses.
    const shellIndex = route.indexOf("storefront-shell");
    const analyticsIndex = route.lastIndexOf("<StorefrontAnalytics />");
    expect(shellIndex).toBeGreaterThan(-1);
    expect(analyticsIndex).toBeGreaterThan(shellIndex);
    // And it must not also sit next to <StoreShell /> any more.
    expect(route).not.toMatch(/<StorefrontAnalytics \/>\s*<StoreShell \/>/);
  });

  it("offsets itself above a bottom-fixed CTA bar", () => {
    const banner = read("src/components/storefront-analytics.tsx");
    expect(banner).toContain("--sf-sticky-cta-h");
    // The fixed bottom-3 utility would sit on top of the bar.
    expect(banner).not.toContain("inset-x-3 bottom-3");
  });

  it("publishes the purchase bar height for overlays to clear", () => {
    const hook = read("src/hooks/use-sticky-cta-offset.ts");
    expect(hook).toContain("--sf-sticky-cta-h");
    expect(hook).toContain("ResizeObserver");
    // Cleaned up so other routes are not offset by a stale value.
    expect(hook).toContain("removeProperty");

    const pdp = read("src/routes/$slug.product.$id.tsx");
    expect(pdp).toContain("useStickyCtaOffset");
    expect(pdp).toContain("ref={stickyCtaRef}");
  });
});

describe("authenticated routes redirect instead of hanging", () => {
  const routeFiles = [
    "src/routes/_authenticated/route.tsx",
    "src/routes/_authenticated/admin.b.$slug.route.tsx",
    "src/routes/_authenticated/admin.b.$slug.settings.tsx",
    "src/routes/_authenticated/admin.b.$slug.team.tsx",
    "src/routes/_authenticated/admin.b.$slug.expenses.tsx",
    "src/routes/_authenticated/admin.b.$slug.incubators.tsx",
    "src/routes/_authenticated/admin.b.$slug.reports.tsx",
  ];

  it("never throws a redirect from inside a queryFn", () => {
    // TanStack Query treats a thrown redirect as a query error and retries it,
    // so the router never sees it and the route sits on its pending component
    // forever. /admin hung on "Loading..." for 28s in production because of it.
    // Brace-match each queryFn body so redirects that legitimately live in
    // beforeLoad's own scope are not mistaken for offenders.
    const queryFnBodies = (source: string): string[] => {
      const bodies: string[] = [];
      const marker = "queryFn: async () => {";
      let from = 0;
      for (;;) {
        const start = source.indexOf(marker, from);
        if (start < 0) break;
        let depth = 0;
        let i = start + marker.length - 1;
        for (; i < source.length; i += 1) {
          if (source[i] === "{") depth += 1;
          else if (source[i] === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        bodies.push(source.slice(start, i));
        from = i;
      }
      return bodies;
    };

    const offenders: string[] = [];
    for (const file of routeFiles) {
      for (const body of queryFnBodies(read(file))) {
        if (body.includes("throw redirect(")) offenders.push(file);
      }
    }
    expect(offenders, "move the redirect into beforeLoad's own scope").toEqual([]);
  });

  it("guards the resolved session in beforeLoad", () => {
    for (const file of routeFiles) {
      const source = read(file);
      if (!source.includes('queryKey: ["auth_user"]')) continue;
      expect(source, `${file} must redirect when there is no user`).toMatch(
        /if \(!user\) throw redirect\(\{ to: "\/auth" \}\)/,
      );
    }
  });
});

describe("footer layout value mismatch", () => {
  it("treats the legacy 'minimal' value as the simple footer", () => {
    // The settings dropdown wrote "minimal" while the storefront checked for
    // "simple", so choosing the simple footer silently did nothing. Two live
    // brands had "minimal" stored.
    expect(resolveFooterVariant({ storefront_design_version: 2, footer_layout: "minimal" })).toBe(
      "simple",
    );
    expect(resolveFooterVariant({ storefront_design_version: 1, footer_layout: "minimal" })).toBe(
      "simple",
    );
  });

  it("writes the canonical value from the settings dropdown", () => {
    const group = read("src/features/settings/tabs/storefront/DesignV2Group.tsx");
    expect(group).toContain('<SelectItem value="simple">');
    expect(group).not.toContain('<SelectItem value="minimal">');
    // The control shows what the storefront will actually render.
    expect(group).toContain("value={resolveFooterVariant(bs)}");
  });

  it("routes the storefront footer through the shared resolver", () => {
    const route = read("src/routes/$slug.route.tsx");
    expect(route).toContain('resolveFooterVariant(settings) === "columns"');
    // The old hand-rolled condition must be gone so the two cannot diverge.
    expect(route).not.toContain('settings?.footer_layout !== "simple" &&');
  });
});
