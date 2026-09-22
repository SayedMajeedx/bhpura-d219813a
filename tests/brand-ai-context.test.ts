import { describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn((table: string) => {
  if (table === "brands") {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "brand-123",
          name_ar: "دار الأناقة",
          name_en: "Dar AlAnaqa",
        },
        error: null,
      }),
    };
  }
  // store_vertical lives on business_settings (single source of truth), not brands.
  if (table === "business_settings") {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { store_vertical: "fashion" },
        error: null,
      }),
    };
  }
  if (table === "brand_addons") {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ addon_id: "fashion-core" }, { addon_id: "size-guides" }],
          error: null,
        }),
      }),
    };
  }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };
});

const supabaseAdmin = {
  from: mockFrom,
};

vi.mock("../src/integrations/supabase/client.server", () => ({ supabaseAdmin }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

import { getBrandAiContext } from "../src/lib/store-profile.server";

describe("getBrandAiContext", () => {
  it("aggregates aiContext and vocabulary from installed add-ons", async () => {
    const ctx = await getBrandAiContext("brand-123", { lang: "ar" });

    expect(ctx.brandId).toBe("brand-123");
    expect(ctx.brandName).toBe("دار الأناقة");
    expect(ctx.vertical).toBe("fashion");
    expect(ctx.installedAddonIds).toContain("fashion-core");
    expect(ctx.installedAddonIds).toContain("size-guides");

    // Vocabulary should have fashion overrides (e.g. tailor instead of workshop)
    expect(ctx.vocabulary.workshop.ar).toBe("الخياط");
    expect(ctx.vocabulary.sent_to_workshop.ar).toBe("تم الإرسال للخياط");

    // System prompt should contain base prompt and addon prompts
    expect(ctx.combinedSystemPrompt).toContain("دار الأناقة");
    expect(ctx.combinedSystemPrompt).toContain("fashion");
  });

  it("handles English locale properly", async () => {
    const ctx = await getBrandAiContext("brand-123", { lang: "en" });

    expect(ctx.brandName).toBe("Dar AlAnaqa");
    expect(ctx.vocabulary.workshop.en).toBe("Tailor");
    expect(ctx.combinedSystemPrompt).toContain("Dar AlAnaqa");
  });
});
