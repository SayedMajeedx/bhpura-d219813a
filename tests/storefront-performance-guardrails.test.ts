import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("storefront performance guardrails", () => {
  it("prioritizes the actual first promo image LCP candidate", () => {
    const home = read("src/routes/$slug.index.tsx");

    expect(home).toContain("firstImageIndex");
    expect(home).toContain('fetchPriority={index === firstImageIndex ? "high" : "auto"}');
    expect(home).toContain('loading={index === firstImageIndex ? "eager" : "lazy"}');
    expect(home).toContain('sizes="(min-width: 640px) 50vw, 100vw"');
  });

  it("does not eagerly prioritize every hero carousel slide", () => {
    const home = read("src/routes/$slug.index.tsx");

    expect(home).toContain("prioritizeHero && slideIndex === 0");
    expect(home).toContain('loading={slideIndex === 0 ? "eager" : "lazy"}');
    expect(home).not.toContain('fetchPriority={idx === 0 ? "high" : "auto"}');
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
    const home = read("src/routes/$slug.index.tsx");

    expect(home).toContain("productsAreaBackground");
    expect(home).toContain("style={{ backgroundColor: productsAreaBackground }}");
    expect(home).toContain('className="w-full pb-8 sm:pb-12"');
  });

  it("keeps the footer flush with the storefront content", () => {
    const shell = read("src/routes/$slug.route.tsx");

    expect(shell).toContain('className="border-t py-5 sm:py-6"');
    expect(shell).not.toContain('className="border-t mt-8 sm:mt-10 py-5 sm:py-6"');
  });
});
