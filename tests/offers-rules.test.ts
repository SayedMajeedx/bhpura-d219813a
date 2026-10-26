import { describe, expect, it } from "vitest";
import {
  appliedOfferName,
  appliedOffersOf,
  discountSources,
  freeDeliveryNudge,
  nudgeSentence,
  offerEnds,
  offersForProduct,
  offerTerms,
  type StoreOffer,
} from "../src/lib/offers";
import {
  draftOffer,
  emptyOfferForm,
  formFromRow,
  offerFormProblem,
  offerState,
  rowFromForm,
} from "../src/features/offers/lib/offer-form";
import type { StoreOfferRow } from "../src/lib/data/offers";

const money = (n: number) => `${n.toFixed(3)} BHD`;

const offer = (over: Partial<StoreOffer>): StoreOffer => ({
  id: "o1",
  kind: "discount",
  name_ar: "",
  name_en: "",
  ends_at: null,
  min_subtotal: null,
  min_items: null,
  product_ids: [],
  category_slugs: [],
  exclude_sale_items: false,
  discount_type: "percentage",
  discount_value: 10,
  max_discount: null,
  buy_quantity: null,
  get_quantity: null,
  get_product_ids: [],
  get_category_slugs: [],
  get_percent: null,
  max_sets: null,
  local_only: true,
  ...over,
});

describe("how an offer reads to a shopper", () => {
  it("says a discount with what it asks, in both languages", () => {
    const tenOver40 = offer({ min_subtotal: 40, max_discount: 5 });
    expect(offerTerms(tenOver40, "en", money)).toBe(
      "10% off (up to 5.000 BHD) on orders of 40.000 BHD or more",
    );
    expect(offerTerms(tenOver40, "ar", money)).toBe("خصم 10% حتى 5.000 BHD للطلبات من 40.000 BHD");
    expect(
      offerTerms(offer({ discount_type: "fixed", discount_value: 3, min_items: 2 }), "ar", money),
    ).toBe("خصم 3.000 BHD عند شراء قطعتين أو أكثر");
  });

  it("says buy X get Y with Arabic counted nouns", () => {
    const b2g1 = offer({ kind: "buy_x_get_y", buy_quantity: 2, get_quantity: 1, get_percent: 100 });
    expect(offerTerms(b2g1, "en", money)).toBe("Buy 2, get 1 free");
    expect(offerTerms(b2g1, "ar", money)).toBe("اشترِ قطعتين واحصل على قطعة واحدة مجانًا");
    const half = offer({ kind: "buy_x_get_y", buy_quantity: 3, get_quantity: 2, get_percent: 50 });
    expect(offerTerms(half, "ar", money)).toBe("اشترِ 3 قطع واحصل على قطعتين بخصم 50%");
    expect(offerTerms(half, "en", money)).toBe("Buy 3, get 2 at 50% off");
  });

  it("says free delivery, local unless the store says otherwise", () => {
    expect(offerTerms(offer({ kind: "free_delivery", min_subtotal: 30 }), "en", money)).toBe(
      "Free local delivery on orders of 30.000 BHD or more",
    );
    expect(offerTerms(offer({ kind: "free_delivery", local_only: false }), "ar", money)).toBe(
      "توصيل مجاني",
    );
  });

  it("says when it ends, with Western digits", () => {
    expect(offerEnds({ ends_at: "2026-10-31T12:00:00Z" }, "ar")).toBe("حتى 31 أكتوبر");
    expect(offerEnds({ ends_at: "2026-10-31T12:00:00Z" }, "en")).toBe("Until 31 Oct");
    expect(offerEnds({ ends_at: null }, "en")).toBeNull();
  });
});

describe("which offers reach a product", () => {
  const abaya = { id: "p1", category: "abayas", onSale: false };
  it("follows the database: named products, named categories, or every product", () => {
    const list = [
      offer({ id: "all" }),
      offer({ id: "dresses", category_slugs: ["dresses"] }),
      offer({ id: "this", product_ids: ["p1"] }),
      offer({ id: "free", kind: "free_delivery" }),
      offer({ id: "no-sale", exclude_sale_items: true }),
    ];
    expect(offersForProduct(list, abaya).map((o) => o.id)).toEqual([
      "all",
      "this",
      "no-sale",
      "free",
    ]);
    expect(offersForProduct(list, { ...abaya, onSale: true }).map((o) => o.id)).toEqual([
      "all",
      "this",
      "free",
    ]);
  });
});

describe("how far a cart is from free delivery", () => {
  const free30 = offer({ id: "f", kind: "free_delivery", min_subtotal: 30 });
  it("says what is left, and when it is reached", () => {
    const short = freeDeliveryNudge([free30], [{ price: 13, qty: 2 }]);
    expect(short).toMatchObject({ state: "short", remaining: 4 });
    expect(nudgeSentence(short!, "en", money)).toBe("Add 4.000 BHD more for free local delivery");
    expect(nudgeSentence(short!, "ar", money)).toBe("أضف 4.000 BHD ليصبح التوصيل المحلي مجانيًا");
    expect(freeDeliveryNudge([free30], [{ price: 30, qty: 1 }])).toMatchObject({
      state: "unlocked",
    });
  });

  it("says nothing for an offer it cannot put so simply, or an empty cart", () => {
    expect(
      freeDeliveryNudge([{ ...free30, category_slugs: ["abayas"] }], [{ price: 5, qty: 1 }]),
    ).toBeNull();
    expect(freeDeliveryNudge([{ ...free30, min_items: 3 }], [{ price: 5, qty: 1 }])).toBeNull();
    expect(freeDeliveryNudge([free30], [])).toBeNull();
  });

  it("leaves sale pieces out when the offer does, and picks the nearest offer", () => {
    const cart = [
      { price: 20, qty: 1, original_price: 25 },
      { price: 8, qty: 1 },
    ];
    expect(freeDeliveryNudge([{ ...free30, exclude_sale_items: true }], cart)).toMatchObject({
      remaining: 22,
    });
    const near = offer({ id: "near", kind: "free_delivery", min_subtotal: 29 });
    expect(freeDeliveryNudge([free30, near], cart)).toMatchObject({ remaining: 1 });
  });
});

describe("an order's offers", () => {
  it("names its code and its offers, never free delivery, in the discount line", () => {
    const order = {
      promo_code: "EID",
      applied_offers: [
        { id: "a", kind: "discount", name_ar: "عرض العيد", name_en: "", amount: 5 },
        { id: "b", kind: "free_delivery", name_ar: "", name_en: "", amount: 0 },
        "junk",
      ],
    };
    expect(discountSources(order, "ar")).toBe("رمز EID، عرض العيد");
    expect(discountSources(order, "en")).toBe("Promo: EID, عرض العيد");
    expect(discountSources({ promo_code: null, applied_offers: null }, "en")).toBe("");
    expect(appliedOffersOf(order.applied_offers)).toHaveLength(2);
  });

  it("names an offer the store left unnamed by its kind", () => {
    expect(
      appliedOfferName(
        { id: "x", kind: "free_delivery", name_ar: "", name_en: null, amount: 0 },
        "en",
      ),
    ).toBe("Free delivery");
    expect(
      appliedOfferName({ id: "x", kind: "discount", name_ar: null, name_en: "", amount: 2 }, "ar"),
    ).toBe("عرض المتجر");
  });
});

describe("the offer form", () => {
  it("saves only what its kind uses", () => {
    const form = { ...emptyOfferForm("buy_x_get_y"), min_subtotal: "50", discount_value: "10" };
    const row = rowFromForm(form);
    expect(row).toMatchObject({
      kind: "buy_x_get_y",
      buy_quantity: 2,
      get_quantity: 1,
      get_percent: 100,
      min_subtotal: null,
      discount_type: null,
      discount_value: null,
      get_product_ids: [],
    });
    expect(rowFromForm({ ...emptyOfferForm("free_delivery") })).toMatchObject({
      kind: "free_delivery",
      min_subtotal: 30,
      local_only: true,
    });
  });

  it("refuses what the table would refuse, in the reader's language", () => {
    expect(offerFormProblem({ ...emptyOfferForm("discount"), discount_value: "" }, false)).toBe(
      "Write how much the offer takes off.",
    );
    expect(offerFormProblem({ ...emptyOfferForm("discount"), discount_value: "120" }, true)).toBe(
      "لا تزيد النسبة على 100%.",
    );
    expect(offerFormProblem({ ...emptyOfferForm("buy_x_get_y"), get_other: true }, false)).toMatch(
      /Choose the products or categories/,
    );
    expect(
      offerFormProblem(
        {
          ...emptyOfferForm("discount"),
          starts_at: "2026-11-02T10:00",
          ends_at: "2026-11-01T10:00",
        },
        false,
      ),
    ).toBe("The offer ends before it starts.");
    expect(offerFormProblem(emptyOfferForm("discount"), false)).toBeNull();
  });

  it("opens a saved offer as it was saved", () => {
    const row = {
      ...rowFromForm({
        ...emptyOfferForm("buy_x_get_y"),
        get_other: true,
        get_category_slugs: ["dresses"],
      }),
      id: "o",
      brand_id: "b",
      created_at: "",
      updated_at: "",
    } as StoreOfferRow;
    expect(formFromRow(row)).toMatchObject({
      kind: "buy_x_get_y",
      get_other: true,
      get_category_slugs: ["dresses"],
    });
    expect(offerTerms(draftOffer(formFromRow(row)), "en", money)).toBe("Buy 2, get 1 free");
  });

  it("tells live, scheduled, ended and switched-off offers apart", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(offerState({ is_active: true, starts_at: null, ends_at: null }, now)).toBe("live");
    expect(
      offerState({ is_active: true, starts_at: "2026-11-01T00:00:00Z", ends_at: null }, now),
    ).toBe("scheduled");
    expect(
      offerState({ is_active: true, starts_at: null, ends_at: "2026-10-01T00:00:00Z" }, now),
    ).toBe("ended");
    expect(offerState({ is_active: false, starts_at: null, ends_at: null }, now)).toBe("off");
  });
});
