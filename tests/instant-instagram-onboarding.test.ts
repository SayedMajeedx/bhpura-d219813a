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

  it("extracts code, title, price, description and category from boutique Instagram caption", async () => {
    const { extractBoutiqueMetadataFromCaption } = await import("../src/lib/instagram-ai-importer");

    const caption = `minnaz.couture NEW COLLECTION 2026✨
Code: MC5
Price: 37 BD
عباية صممت بدمج قماشين باربي كوري، واضافه لمسات مميزه تصميم راقي جدا وعمليه 😍`;

    const meta = extractBoutiqueMetadataFromCaption(caption, "minnaz.couture");

    expect(meta.code).toBe("MC5");
    expect(meta.title).toBe("عباية MC5");
    expect(meta.price).toBe(37);
    expect(meta.category).toBe("عبايات");
    expect(meta.description).toContain("عباية صممت بدمج قماشين باربي كوري");
    expect(meta.description).not.toContain("minnaz.couture");
    expect(meta.description).not.toContain("NEW COLLECTION");
  });

  it("handles auto-fill derivation from Instagram handle smoothly", () => {
    const deriveFromHandle = (val: string) => {
      const clean = val.replace(/^@/, "").trim().toLowerCase();
      const slug = clean.replace(/[^a-z0-9_-]/g, "");
      const storeNameEn = clean.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return { clean, slug, storeNameEn };
    };

    expect(deriveFromHandle("unlabelled")).toEqual({
      clean: "unlabelled",
      slug: "unlabelled",
      storeNameEn: "Unlabelled",
    });

    expect(deriveFromHandle("minnaz.couture")).toEqual({
      clean: "minnaz.couture",
      slug: "minnazcouture",
      storeNameEn: "Minnaz Couture",
    });
  });

  it("builds official Instagram Business Login OAuth URL with strict parameters and signed state", async () => {
    process.env.INSTAGRAM_APP_ID = "1435921631930750";
    process.env.INSTAGRAM_APP_SECRET = "a90ae757a582b27770369abf970cb663";

    const {
      buildInstagramAuthorizeUrl,
      decodeOAuthState,
      INSTAGRAM_OAUTH_CONFIG,
    } = await import("../src/lib/instagram-oauth.server");

    expect(INSTAGRAM_OAUTH_CONFIG.REDIRECT_URI).toBe("https://boutq.store/api/auth/instagram/callback");
    expect(INSTAGRAM_OAUTH_CONFIG.DEFAULT_SCOPE).toBe("instagram_business_basic");

    const authUrl = buildInstagramAuthorizeUrl({
      brandId: "11111111-2222-3333-4444-555555555555",
      userId: "user-12345",
      returnTo: "/onboard",
    });

    const parsed = new URL(authUrl);
    expect(parsed.origin).toBe("https://www.instagram.com");
    expect(parsed.pathname).toBe("/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("1435921631930750");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://boutq.store/api/auth/instagram/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("instagram_business_basic");

    const stateParam = parsed.searchParams.get("state");
    expect(stateParam).toBeTruthy();

    const decoded = decodeOAuthState(stateParam!);
    expect(decoded).toBeTruthy();
    expect(decoded?.brandId).toBe("11111111-2222-3333-4444-555555555555");
    expect(decoded?.userId).toBe("user-12345");
    expect(decoded?.returnTo).toBe("/onboard");

    // Tampered state must be rejected
    const tampered = stateParam + "tampered";
    expect(decodeOAuthState(tampered)).toBeNull();
  });
});

