import { describe, it, expect } from "vitest";

describe("Stage 5 - Settings Search and Store Readiness", () => {
  it("evaluates store readiness completion percentages accurately", () => {
    const calculateReadiness = (items: { isComplete: boolean }[]) => {
      const completed = items.filter((i) => i.isComplete).length;
      const total = items.length;
      const percent = Math.round((completed / total) * 100);
      return { completed, total, percent, isAllComplete: completed === total };
    };

    // 0 / 5 complete
    expect(
      calculateReadiness([
        { isComplete: false },
        { isComplete: false },
        { isComplete: false },
        { isComplete: false },
        { isComplete: false },
      ]),
    ).toEqual({ completed: 0, total: 5, percent: 0, isAllComplete: false });

    // 3 / 5 complete (60%)
    expect(
      calculateReadiness([
        { isComplete: true },
        { isComplete: true },
        { isComplete: true },
        { isComplete: false },
        { isComplete: false },
      ]),
    ).toEqual({ completed: 3, total: 5, percent: 60, isAllComplete: false });

    // 5 / 5 complete (100%)
    expect(
      calculateReadiness([
        { isComplete: true },
        { isComplete: true },
        { isComplete: true },
        { isComplete: true },
        { isComplete: true },
      ]),
    ).toEqual({ completed: 5, total: 5, percent: 100, isAllComplete: true });
  });

  it("identifies matching settings entries across Arabic and English terms", () => {
    const searchEntries = [
      { id: "business", keywords: ["شعار", "لوجو", "logo", "business name"] },
      { id: "payments", keywords: ["دفع", "بنفت", "benefitpay", "card", "cod"] },
      { id: "checkout", keywords: ["شحن", "توصيل", "shipping", "delivery", "zones"] },
      { id: "storefront", keywords: ["ألوان", "خطوط", "fonts", "theme", "seo"] },
    ];

    const search = (q: string) => {
      const query = q.trim().toLowerCase();
      return searchEntries.filter((e) => e.keywords.some((k) => k.toLowerCase().includes(query)));
    };

    expect(search("شعار").map((e) => e.id)).toContain("business");
    expect(search("logo").map((e) => e.id)).toContain("business");
    expect(search("بنفت").map((e) => e.id)).toContain("payments");
    expect(search("shipping").map((e) => e.id)).toContain("checkout");
    expect(search("fonts").map((e) => e.id)).toContain("storefront");
  });
});
