import { describe, it, expect } from "vitest";
import { executeOfflineCopilot } from "../src/lib/store-copilot.functions";

describe("Free Store AI Copilot Engine", () => {
  const mockSupabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 12, data: [] }),
      }),
      insert: (payload: any) => Promise.resolve({ error: null, data: payload }),
    }),
  };

  it("provides deterministic fallback responses for store summary in Arabic", async () => {
    const resSummary = await executeOfflineCopilot(
      mockSupabase,
      "brand-123",
      "ملخص المتجر",
      true,
    );

    expect(resSummary).toBeDefined();
    expect(resSummary.reply).toContain("إحصائيات المتجر السريعة");
    expect(resSummary.actionTaken).toBeDefined();
    expect(resSummary.actionTaken?.action).toBe("get_summary");
  });

  it("provides deterministic fallback responses for store summary in English", async () => {
    const resSummary = await executeOfflineCopilot(
      mockSupabase,
      "brand-123",
      "store summary",
      false,
    );

    expect(resSummary).toBeDefined();
    expect(resSummary.reply).toContain("Quick Store Stats");
    expect(resSummary.actionTaken).toBeDefined();
    expect(resSummary.actionTaken?.action).toBe("get_summary");
  });

  it("handles product creation intent gracefully in Arabic and English", async () => {
    const resProductAr = await executeOfflineCopilot(
      mockSupabase,
      "brand-123",
      "أضف فستان حرير بسعر 45",
      true,
    );

    expect(resProductAr.reply).toContain("فستان حرير");
    expect(resProductAr.actionTaken?.action).toBe("create_product");
    expect(resProductAr.actionTaken?.parameters?.price).toBe(45);

    const resProductEn = await executeOfflineCopilot(
      mockSupabase,
      "brand-123",
      "Add Silk Dress for 50",
      false,
    );

    expect(resProductEn.reply).toContain("Silk Dress");
    expect(resProductEn.actionTaken?.action).toBe("create_product");
    expect(resProductEn.actionTaken?.parameters?.price).toBe(50);
  });

  it("returns suggestions for general conversation", async () => {
    const resGeneral = await executeOfflineCopilot(
      mockSupabase,
      "brand-123",
      "مرحبا كيف حالك؟",
      true,
    );

    expect(resGeneral.reply).toContain("Boutq Copilot");
    expect(resGeneral.suggestedPrompts).toBeDefined();
    expect(resGeneral.suggestedPrompts!.length).toBeGreaterThan(0);
  });
});
