import { describe, expect, it } from "vitest";
import { adminAppHead, LAUNCH_SCREENS } from "../src/lib/admin-app-head";
import { alertIcon } from "../supabase/functions/send-mobile-push/alert-icon";
import adminManifestText from "../public/admin-app/manifest.webmanifest?raw";
import { runAdminWorker } from "./helpers/admin-worker";

// The PWA review of 2026-11-05, third part: an iPhone flashed white on opening the app, the
// install sheet had nothing to show, and every store's alert wore Boutq's icon.

const splashFiles = Object.keys(import.meta.glob("../public/admin-app/splash/*.png")).map((path) =>
  path.replace("../public", ""),
);
const screenshotFiles = Object.keys(import.meta.glob("../public/admin-app/screenshots/*.png")).map(
  (path) => path.replace("../public", ""),
);

describe("opening the app on an iPhone or iPad", () => {
  const head = adminAppHead();
  const startup = head.links.filter((l) => l.rel === "apple-touch-startup-image");

  it("shows a launch screen made for each screen, that exists", () => {
    expect(startup).toHaveLength(LAUNCH_SCREENS.length);
    for (const link of startup) expect(splashFiles).toContain(link.href);
    expect(startup[0]).toMatchObject({
      href: "/admin-app/splash/splash-1320x2868.png",
      media:
        "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
    });
    // No two screens claim the same picture by mistake.
    expect(new Set(startup.map((l) => l.media)).size).toBe(startup.length);
  });

  it("keeps iOS's default status bar, readable over the admin's light top bar", () => {
    expect(head.meta).toContainEqual({
      name: "apple-mobile-web-app-status-bar-style",
      content: "default",
    });
  });
});

describe("the install sheet", () => {
  const manifest = JSON.parse(adminManifestText) as {
    description: string;
    screenshots: Array<{ src: string; sizes: string; form_factor: string; label: string }>;
  };

  it("shows pictures for a phone and for a computer, in both languages, that exist", () => {
    const factors = manifest.screenshots.map((s) => s.form_factor);
    expect(factors).toContain("narrow");
    expect(factors).toContain("wide");
    for (const shot of manifest.screenshots) {
      expect(screenshotFiles).toContain(shot.src);
      expect(shot.label).toMatch(/[؀-ۿ]/);
      const [w, h] = shot.sizes.split("x").map(Number);
      expect(shot.form_factor === "wide" ? w > h : h > w).toBe(true);
    }
    expect(manifest.description).toMatch(/[؀-ۿ]/);
  });
});

describe("a store's alert", () => {
  it("wears the store's own picture, from the media host only", () => {
    const favicon = "https://media.boutq.store/brands/b/favicon/tile.png";
    expect(alertIcon({ favicon_url: favicon, logo_url: "x" })).toBe(favicon);
    expect(alertIcon({ favicon_url: "https://media.boutq.store/a.svg", logo_url: favicon })).toBe(
      favicon,
    );
    expect(alertIcon({ favicon_url: "https://evil.example/a.png" })).toBeNull();
    expect(alertIcon(null)).toBeNull();
  });

  it("is drawn by the worker with that picture, and Boutq's for anything else", async () => {
    const worker = runAdminWorker();
    const icon = "https://media.boutq.store/brands/b/favicon/tile.png";
    await worker.fire("push", { data: { json: () => ({ title: "New order", icon }) } });
    await worker.fire("push", {
      data: { json: () => ({ title: "New order", icon: "https://evil.example/a.png" }) },
    });
    expect(worker.shown.map((s) => s.options.icon)).toEqual([icon, "/admin-app/icon-192.png"]);
  });
});
