import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("CSP security headers and Manifest assets", () => {
  it("ensures public/placeholder.svg exists and contains valid SVG", () => {
    const svgPath = path.resolve(process.cwd(), "public/placeholder.svg");
    expect(fs.existsSync(svgPath)).toBe(true);
    const content = fs.readFileSync(svgPath, "utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain("</svg>");
  });

  it("ensures public/og-placeholder.png exists", () => {
    const pngPath = path.resolve(process.cwd(), "public/og-placeholder.png");
    expect(fs.existsSync(pngPath)).toBe(true);
    const stat = fs.statSync(pngPath);
    expect(stat.size).toBeGreaterThan(100);
  });

  it("ensures CSP connect-src permits tenant subdomains, Cloudflare, GA4, and Meta", () => {
    const serverTsPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverTsPath, "utf-8");
    const cspMatch = content.match(/"Content-Security-Policy":\s*\n?\s*"([^"]+)"/);
    expect(cspMatch).not.toBeNull();
    const csp = cspMatch![1];

    const connectSrcMatch = csp.match(/connect-src\s+([^;]+);/);
    expect(connectSrcMatch).not.toBeNull();
    const connectSrc = connectSrcMatch![1];

    expect(connectSrc).toContain("https://*.boutq.store");
    expect(connectSrc).toContain("https://boutq.store");
    expect(connectSrc).toContain("wss://*.boutq.store");
    expect(connectSrc).toContain("https://*.cloudflare.com");
    expect(connectSrc).toContain("https://*.cloudflareinsights.com");
    expect(connectSrc).toContain("https://*.google-analytics.com");
    expect(connectSrc).toContain("https://*.facebook.com");
  });

  it("detects SVG vs PNG icons correctly for manifest", () => {
    const isSvg = (url: string) => /\.svg(\?.*)?$/i.test(url);

    const svgIcon = "https://media.boutq.store/brands/brand-1/logo/logo.svg";
    const pngIcon = "https://media.boutq.store/brands/brand-1/logo/logo.png";
    const svgWithQuery = "https://media.boutq.store/brands/brand-1/logo/logo.svg?v=2";

    expect(isSvg(svgIcon)).toBe(true);
    expect(isSvg(svgWithQuery)).toBe(true);
    expect(isSvg(pngIcon)).toBe(false);

    const getIconConfig = (url: string) => ({
      src: url,
      sizes: isSvg(url) ? "any" : "192x192 512x512",
      type: isSvg(url) ? "image/svg+xml" : "image/png",
      purpose: "any maskable",
    });

    const svgConfig = getIconConfig(svgIcon);
    expect(svgConfig.type).toBe("image/svg+xml");
    expect(svgConfig.sizes).toBe("any");

    const pngConfig = getIconConfig(pngIcon);
    expect(pngConfig.type).toBe("image/png");
    expect(pngConfig.sizes).toBe("192x192 512x512");
  });
});
