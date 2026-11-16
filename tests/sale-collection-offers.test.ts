import { describe, expect, it } from "vitest";
import { productOnSaleOrOffer } from "../src/lib/offer-price";
import {
  homeGridProducts,
  homeMerchandising,
} from "../src/features/storefront-home/lib/home-products";
import type { StoreOffer } from "../src/lib/offers";
import type { ProductRow } from "../src/lib/data/storefront";

const offer = (patch: Partial<StoreOffer> = {}): StoreOffer => ({
  id: "o1",
  kind: "discount",
  name_ar: "الجمعة البيضاء",
  name_en: "White Friday",
  ends_at: null,
  min_subtotal: null,
  min_items: null,
  product_ids: ["in-offer"],
  category_slugs: [],
  exclude_sale_items: false,
  discount_type: "percentage",
  discount_value: 20,
  max_discount: null,
  buy_quantity: null,
  get_quantity: null,
  get_product_ids: [],
  get_category_slugs: [],
  get_percent: null,
  max_sets: null,
  local_only: true,
  pieces: "ready",
  ...patch,
});

const product = (id: string): ProductRow =>
  ({
    id,
    category: null,
    image_url: `https://media.example/${id}.jpg`,
    created_at: new Date().toISOString(),
    product_variants: [
      { id: `${id}-v`, selling_price: 20, original_price: null, stock_main: 3, size: null },
    ],
  }) as ProductRow;

describe("the sale collection reads the store's automatic offers", () => {
  const inOffer = product("in-offer");
  const other = product("other");

  it("counts a product an offer that lowers the price reaches", () => {
    expect(productOnSaleOrOffer(inOffer, [offer()])).toBe(true);
    expect(productOnSaleOrOffer(other, [offer()])).toBe(false);
  });

  it("is not on sale with no offer, or one that only applies above a minimum", () => {
    expect(productOnSaleOrOffer(inOffer, [])).toBe(false);
    expect(productOnSaleOrOffer(inOffer, [offer({ min_subtotal: 50 })])).toBe(false);
    expect(productOnSaleOrOffer(inOffer, [offer({ kind: "free_delivery" })])).toBe(false);
  });

  it("fills the sale rail and the sale grid with those products", () => {
    const products = [inOffer, other];
    const shown = { new: false, best: false, sale: true, trending: false };
    const rails = homeMerchandising(products, [], [], shown, [offer()]);
    expect(rails.saleProducts.map((p) => p.id)).toEqual(["in-offer"]);

    const grid = homeGridProducts({
      products,
      activeCategorySlugs: ["sale"],
      categories: [],
      bestSellerRows: [],
      now: Date.now(),
      offers: [offer()],
    });
    expect(grid.map((p) => p.id)).toEqual(["in-offer"]);
  });
});
