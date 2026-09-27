import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// The storefront shell is split across its route and src/features/storefront-shell (Phase 5).
const shellSource = () =>
  [
    "src/routes/$slug.route.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-shell/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-shell/${dir}/${file}`),
    ),
  ]
    .map((file) => read(file))
    .join("\n");

// The home page is split across its route and src/features/storefront-home (Phase 5).
const homeSource = () =>
  [
    "src/routes/$slug.index.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-home/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-home/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

describe("storefront performance guardrails", () => {
  it("prioritizes the actual first promo image LCP candidate", () => {
    const home = homeSource();

    expect(home).toContain("firstImageIndex");
    expect(home).toContain('fetchPriority={index === firstImageIndex ? "high" : "auto"}');
    expect(home).toContain('loading={index === firstImageIndex ? "eager" : "lazy"}');
    expect(home).toContain('sizes="(min-width: 640px) 50vw, 100vw"');
  });

  it("does not eagerly prioritize every hero carousel slide", () => {
    const home = homeSource();

    expect(home).toContain("prioritizeHero && slideIndex === 0");
    expect(home).toContain('loading={slideIndex === 0 ? "eager" : "lazy"}');
    expect(home).not.toContain('fetchPriority={idx === 0 ? "high" : "auto"}');
  });

  it("keeps admin-only chart and PDF libraries out of forced shared chunks", () => {
    const config = read("vite.config.ts");
    expect(config).not.toContain('return "vendor-pdf"');
    expect(config).not.toContain('return "vendor-charts"');
  });

  it("uses self-hosted default fonts and immutable static assets", () => {
    const root = read("src/routes/__root.tsx");
    const fonts = read("src/fonts.css");
    const headers = read("public/_headers");

    expect(root).not.toContain("fonts.googleapis.com/css2?family=Tajawal");
    expect(fonts).toContain('font-family: "Tajawal"');
    expect(fonts).toContain('font-family: "Inter"');
    expect(headers).toContain("max-age=31536000, immutable");
  });

  it("continues the final editorial color through the products area", () => {
    const home = homeSource();

    expect(home).toContain("productsAreaBackground");
    expect(home).toContain("style={{ backgroundColor: productsAreaBackground }}");
    expect(home).toContain('className="w-full pb-8 sm:pb-12"');
  });

  it("keeps the footer flush with the storefront content", () => {
    const shell = shellSource();

    expect(shell).toContain('className="border-t py-5 sm:py-6"');
    expect(shell).not.toContain('className="border-t mt-8 sm:mt-10 py-5 sm:py-6"');
  });

  it("bundles the variable fonts as woff2 with their OFL licenses locally", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    const requiredFiles = [
      "public/fonts/variable/plus-jakarta-sans-wght.woff2",
      "public/fonts/variable/plus-jakarta-sans-italic-wght.woff2",
      "public/fonts/variable/readex-pro-hexp-wght.woff2",
      "public/fonts/licenses/plus-jakarta-sans-OFL.txt",
      "public/fonts/licenses/readex-pro-OFL.txt",
      "public/fonts/licenses/Tajawal-OFL.txt",
    ];

    for (const file of requiredFiles) {
      const bytes = readFileSync(resolve(process.cwd(), file));
      expect(bytes.length).toBeGreaterThan(0);
      // woff2 magic number: "wOF2"
      if (file.endsWith(".woff2")) expect(bytes.subarray(0, 4).toString("ascii")).toBe("wOF2");
    }
    expect(fontsCss).toContain('font-family: "Plus Jakarta Sans"');
    expect(fontsCss).toContain('font-family: "Readex Pro"');
    expect(fontsCss).toContain('format("woff2-variations")');
    expect(fontsCss).toContain("font-weight: 200 800");
    expect(fontsCss).toContain("font-weight: 160 700");
  });

  it("serves the default Arabic body font (Tajawal) locally, split per script", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    for (const weight of [400, 500, 700]) {
      for (const subset of ["arabic", "latin"]) {
        const file = `public/fonts/tajawal/tajawal-${weight}-${subset}.woff2`;
        expect(readFileSync(resolve(process.cwd(), file)).length).toBeGreaterThan(0);
        expect(fontsCss).toContain(`/fonts/tajawal/tajawal-${weight}-${subset}.woff2`);
      }
    }
    expect(fontsCss).toContain("unicode-range:");
    expect(fontsCss).toContain("U+0600-06FF");
  });

  it("never loads fonts through a render-blocking third-party chain", () => {
    const fontsCss = readFileSync(resolve(process.cwd(), "src/fonts.css"), "utf8");
    expect(fontsCss).not.toMatch(/@import\s+url\(/);
    expect(fontsCss).not.toContain("fonts.googleapis.com");
    expect(fontsCss).not.toContain(".ttf");
    expect(
      readdirSync(resolve(process.cwd(), "public/fonts/variable")).some((f) => f.endsWith(".ttf")),
    ).toBe(false);
  });

  it("keeps the banner parallax on editorial and category banners only", () => {
    // Motion on the hero, cards or grids would run on every product image.
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (full.endsWith("secondary-banner-parallax.tsx")) continue; // the component itself
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name) && read(full).includes("<SecondaryBannerParallax")) {
          users.push(full);
        }
      }
    };
    walk("src");
    expect(users.sort()).toEqual([
      "src/features/storefront-home/components/MerchandisingSection.tsx",
      "src/routes/$slug.$category.tsx",
    ]);
  });

  it("gives the banner parallax a CSS scroll-timeline fallback that honours reduced motion", () => {
    const styles = read("src/styles.css");
    expect(styles).toContain("animation-timeline: view(block)");
    expect(styles).toContain("animation-duration: auto");
    expect(styles).toContain("animation-range-start: entry 0%");
    expect(styles).toContain("animation-range-end: exit 100%");
    expect(styles).toContain("translate3d(0, -3rem, 0)");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });
});
