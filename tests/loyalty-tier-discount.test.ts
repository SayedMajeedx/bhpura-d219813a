import { describe, expect, it } from "vitest";
import {
  memberTierDiscount,
  tierDiscountLabel,
  tierDiscountPerk,
} from "../src/lib/loyalty-tier-discount";
import {
  discountLines,
  discountParts,
  keptDiscount,
} from "../src/features/orders/lib/discount-parts";

// A loyalty tier's discount: the larger of it and the code with the offers, never both (the
// owner's decision of 2026-11-27). The database's side is tests/loyalty-tier-discount-migration.

describe("the member's discount at checkout", () => {
  it("replaces the code and the offers when it saves more", () => {
    expect(memberTierDiscount({ subtotal: 50, percent: 10, code: 3, offers: 1 })).toEqual({
      code: 0,
      offers: 0,
      tier: 5,
    });
  });

  it("gives way when the code and the offers save as much or more", () => {
    expect(memberTierDiscount({ subtotal: 50, percent: 10, code: 5, offers: 0 })).toEqual({
      code: 5,
      offers: 0,
      tier: 0,
    });
    expect(memberTierDiscount({ subtotal: 50, percent: 10, code: 0, offers: 8 })).toEqual({
      code: 0,
      offers: 8,
      tier: 0,
    });
  });

  it("is nothing for a tier with no discount, and rounds to the fils", () => {
    expect(memberTierDiscount({ subtotal: 50, percent: 0, code: 0, offers: 0 }).tier).toBe(0);
    expect(memberTierDiscount({ subtotal: 33.333, percent: 7.5, code: 0, offers: 0 }).tier).toBe(
      2.5,
    );
  });

  it("is named by the tier, in the reader's language", () => {
    expect(tierDiscountLabel({ name_ar: "ذهبي", name_en: "Gold" }, 10, "en")).toBe(
      "Gold member discount (10%)",
    );
    expect(tierDiscountLabel({ name_ar: "ذهبي", name_en: "Gold" }, 10, "ar")).toBe(
      "خصم عضوية ذهبي (10٪)",
    );
    expect(tierDiscountLabel(null, 7.5, "en")).toBe("Member discount (7.5%)");
    expect(tierDiscountPerk(10, "ar")).toBe("خصم 10٪ على كل طلب");
    expect(tierDiscountPerk(0, "en")).toBeNull();
  });
});

describe("an order's member discount", () => {
  const order = { discount: 7, tier_discount: 5, loyalty_discount: 2, offer_discount: 0 };

  it("is a part of the discount of its own, kept when staff change a code", () => {
    expect(discountParts(order)).toEqual({ offers: 0, tier: 5, points: 2, code: 0, total: 7 });
    expect(keptDiscount(order)).toBe(7);
  });

  it("is named in the summary, even when it is the only part", () => {
    expect(discountLines({ discount: 5, tier_discount: 5 }, "en")).toEqual([
      { key: "tier", label: "Member discount", amount: 5 },
    ]);
    expect(discountLines(order, "ar").map((line) => line.key)).toEqual(["tier", "points"]);
  });
});
