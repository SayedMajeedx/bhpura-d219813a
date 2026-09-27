import { describe, expect, it, vi } from "vitest";
import {
  CREATIVE_FORMATS,
  creativeFileName,
  deliverCreativeFile,
} from "../src/lib/creative-export";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Pura growth tools", () => {
  it("keeps fit passports consent-based, versioned, and brand isolated", () => {
    const migration = read("supabase/migrations/20260903180000_pura_fit_passports.sql");
    expect(migration).toContain("consent_to_store boolean NOT NULL DEFAULT false");
    expect(migration).toContain("customer_fit_passport_history");
    expect(migration).toContain("public.can_access_brand(brand_id)");
    expect(migration).toContain("UNIQUE (brand_id, customer_id)");
  });

  it("offers production social formats with predictable file names", () => {
    expect(CREATIVE_FORMATS.story).toMatchObject({ width: 1080, height: 1920 });
    expect(CREATIVE_FORMATS.portrait).toMatchObject({ width: 1080, height: 1350 });
    expect(CREATIVE_FORMATS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(creativeFileName("pura", "Silk Abaya", "story", "png")).toBe(
      "pura-silk-abaya-story.png",
    );
    expect(creativeFileName("pura", null, "square", "mp4")).toBe("pura-creative-square.mp4");
  });

  it("shares the PNG on a phone, and downloads it elsewhere", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const originalMatchMedia = window.matchMedia;
    const originalWidth = window.innerWidth;
    const setDevice = (phone: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches: phone && query === "(pointer: coarse)",
      })) as unknown as typeof window.matchMedia;
      Object.defineProperty(window, "innerWidth", {
        value: phone ? 390 : 1440,
        configurable: true,
      });
    };
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const objectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:creative");
    try {
      setDevice(true);
      expect(await deliverCreativeFile(blob, "pura-a.png", "image/png", "Eid")).toBe("shared");
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Eid", files: [expect.any(File)] }),
      );
      // Closing the share sheet is not a failure and does not download.
      share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
      expect(await deliverCreativeFile(blob, "pura-a.png", "image/png", "Eid")).toBe("cancelled");
      expect(click).not.toHaveBeenCalled();

      setDevice(false);
      expect(await deliverCreativeFile(blob, "pura-a.png", "image/png", "Eid")).toBe("downloaded");
      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.download).toBe("pura-a.png");
      expect(link.href).toBe("blob:creative");
      // The temporary link does not stay in the page.
      expect(document.body.contains(link)).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
      Reflect.deleteProperty(navigator, "share");
      Reflect.deleteProperty(navigator, "canShare");
      click.mockRestore();
      objectUrl.mockRestore();
    }
  });
});
