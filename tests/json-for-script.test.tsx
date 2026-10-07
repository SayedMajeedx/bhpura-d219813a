import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { jsonForScript } from "../src/lib/seo/json-for-script";
import { JsonLd } from "../src/components/storefront/seo/JsonLd";
import { productHead } from "../src/features/product-page/lib/product-head";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";

// Structured data goes inside <script> elements. A name with `</script><script>…` in it must not be
// able to close the element and run code (every store shares one origin).

const EVIL = "</script><script>alert(document.domain)</script> & <b>";

describe("JSON written into a script element", () => {
  it("keeps < > & out of the text and still parses back to the same value", () => {
    const value = { name: EVIL, list: [EVIL, 1, null], nested: { "</script>": "\u2028\u2029" } };
    const text = jsonForScript(value);
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(text.toLowerCase()).not.toContain("</script");
    expect(JSON.parse(text)).toEqual(value);
  });

  it("writes undefined as null instead of nothing", () => {
    expect(jsonForScript(undefined)).toBe("null");
  });
});

describe("the storefront's structured data", () => {
  it("cannot be closed early by a product name (component)", () => {
    const { container } = render(<JsonLd schema={{ "@type": "Product", name: EVIL }} />);
    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(container.innerHTML.toLowerCase().match(/<\/script/g)).toHaveLength(1);
    const script = container.querySelector("script")!;
    expect(JSON.parse(script.textContent ?? "").name).toBe(EVIL);
  });

  it("cannot be closed early by a product name (product page head)", () => {
    const head = productHead({
      loaderData: {
        product: { id: "p1", name_ar: EVIL, name_en: EVIL, base_price: 5 },
        brand: { slug: "pura", name_en: EVIL },
        initialLang: "en",
      },
      params: { slug: "pura", id: "p1" },
    }) as { scripts?: Array<{ type?: string; children?: string }> };
    const ld = (head.scripts ?? []).filter((s) => s.type === "application/ld+json");
    expect(ld.length).toBeGreaterThan(0);
    for (const s of ld) {
      expect(s.children?.toLowerCase()).not.toContain("</script");
      expect(s.children).not.toMatch(/[<>&]/);
      expect(JSON.parse(s.children ?? "")["@context"]).toBe("https://schema.org");
    }
  });

  it("cannot be closed early by a brand name (storefront head)", () => {
    const head = storefrontHead({
      brand: { id: "b1", slug: "pura", name_ar: EVIL, name_en: EVIL },
      settings: { business_name: EVIL },
      initialLang: "en",
    }) as { scripts?: Array<{ type?: string; children?: string }> };
    const ld = (head.scripts ?? []).filter((s) => s.type === "application/ld+json");
    expect(ld).toHaveLength(2);
    for (const s of ld) {
      expect(s.children?.toLowerCase()).not.toContain("</script");
      expect(JSON.parse(s.children ?? "")).toBeTruthy();
    }
  });
});

describe("no script is written from plain JSON.stringify", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it("keeps every script body behind jsonForScript", () => {
    const offenders = walk("src")
      .filter((file) => !file.replaceAll("\\", "/").endsWith("lib/seo/json-for-script.ts"))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return (
          /__html:\s*JSON\.stringify\(/.test(text) ||
          /type:\s*"application\/ld\+json",\s*children:\s*JSON\.stringify\(/.test(text)
        );
      });
    expect(offenders).toEqual([]);
  });
});
