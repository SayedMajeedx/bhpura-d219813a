import { describe, it, expect } from "vitest";

describe("Instant Instagram Onboarding Logic", () => {
  it("cleans instagram handles and URLs to pure usernames", () => {
    const sanitizeHandle = (input: string) => {
      let handle = input.trim().replace(/^@/, "");
      handle = handle.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, "");
      handle = handle.split("/")[0].split("?")[0].trim();
      return handle;
    };

    expect(sanitizeHandle("@pureline_bh")).toBe("pureline_bh");
    expect(sanitizeHandle("https://www.instagram.com/puraline.official/")).toBe("puraline.official");
    expect(sanitizeHandle("https://instagram.com/boutq_fashion?igsh=123")).toBe("boutq_fashion");
    expect(sanitizeHandle("abaya_couture")).toBe("abaya_couture");
  });

  it("generates safe brand slug from username or title", () => {
    const toSlug = (text: string) => {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    expect(toSlug("puraline.official")).toBe("puraline-official");
    expect(toSlug("Abaya Couture 2026")).toBe("abaya-couture-2026");
    expect(toSlug("@store_boutique_")).toBe("store-boutique");
  });
});
