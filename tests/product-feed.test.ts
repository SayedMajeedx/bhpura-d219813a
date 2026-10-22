import { describe, expect, it } from "vitest";
import {
  feedItems,
  feedPrice,
  feedXml,
  plainText,
  type FeedProduct,
  type FeedStore,
  type FeedVariant,
} from "../src/lib/seo/product-feed";
import { feedAddress } from "../src/lib/seo/feed-address";
import { variantSellable } from "../src/lib/product-availability";
import { storeAxisDefaults } from "../src/lib/variant-axes";

// The shopping feed Meta Commerce Manager and Google Merchant Center fetch: one item per size,
// saying only what the storefront says (its price, its sale, whether it can be bought now, the
// store's own words for the options), and leaving out what either service would refuse.

const store: FeedStore = {
  base: "https://pura.boutq.store/pura",
  name: "Pura Line",
  currency: "BHD",
  lang: "en",
  axisDefaults: storeAxisDefaults([], "abayas"),
};

const product = (over: Partial<FeedProduct> = {}): FeedProduct => ({
  id: "p1",
  name: "عباية ليلى",
  name_ar: "عباية ليلى",
  name_en: "Layla Abaya",
  description_en: "<p>Soft   crepe &amp; a <b>silk</b> lining.</p>",
  image_url: "https://media.boutq.store/p1.jpg",
  media: [
    { url: "https://media.boutq.store/p1-back.jpg", type: "image" },
    { url: "https://media.boutq.store/p1.mp4", type: "video" },
  ],
  is_active: true,
  item_kind: "product",
  ...over,
});

const variant = (over: Partial<FeedVariant> = {}): FeedVariant => ({
  id: "v1",
  product_id: "p1",
  size: "52",
  color: null,
  selling_price: 30,
  original_price: null,
  stock_main: 2,
  stock_incubator: 0,
  ...over,
});

describe("the feed's items", () => {
  it("gives each size its own item, grouped under its product, linked to that size", () => {
    const items = feedItems(
      store,
      [product()],
      [variant(), variant({ id: "v2", size: "54", stock_main: 0 })],
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "v1",
      groupId: "p1",
      title: "Layla Abaya - 52",
      link: "https://pura.boutq.store/pura/product/p1?variant=v1",
      image: "https://media.boutq.store/p1.jpg",
      additionalImages: ["https://media.boutq.store/p1-back.jpg"],
      availability: "in_stock",
      price: "30.000 BHD",
      salePrice: null,
      brand: "Pura Line",
      size: "52",
    });
    // A sold-out size stays in, marked out of stock.
    expect(items[1].availability).toBe("out_of_stock");
  });

  it("writes a sale as the size's own price before and after", () => {
    const [item] = feedItems(
      store,
      [product()],
      [variant({ selling_price: 24, original_price: 30 })],
    );
    expect(item.price).toBe("30.000 BHD");
    expect(item.salePrice).toBe("24.000 BHD");
  });

  it("says a made-to-order piece can be bought while making is open, not once it is paused", () => {
    const open = product({ is_made_to_order: true });
    const paused = product({ is_made_to_order: true, made_to_order_paused_at: "2026-10-01" });
    const sold = variant({ stock_main: 0 });
    expect(feedItems(store, [open], [sold])[0].availability).toBe("in_stock");
    expect(feedItems(store, [paused], [sold])[0].availability).toBe("out_of_stock");
    // The cards read the same rule.
    expect(variantSellable(open, sold)).toBe(true);
    expect(variantSellable(paused, sold)).toBe(false);
  });

  it("names a product with one size by its name alone, with no group", () => {
    const [item] = feedItems(store, [product()], [variant({ size: "Standard" })]);
    expect(item.title).toBe("Layla Abaya");
    expect(item.groupId).toBeNull();
    expect(item.size).toBeNull();
    expect(item.link).toBe("https://pura.boutq.store/pura/product/p1");
  });

  it("leaves out a hidden product, a service, a package and a size with no price", () => {
    const items = feedItems(
      store,
      [
        product({ id: "hidden", is_active: false }),
        product({ id: "service", item_kind: "service" }),
        product({ id: "package", is_package: true }),
        product({ id: "free" }),
      ],
      [
        variant({ product_id: "hidden" }),
        variant({ product_id: "service" }),
        variant({ product_id: "package" }),
        variant({ product_id: "free", selling_price: 0 }),
      ],
    );
    expect(items).toEqual([]);
  });

  it("leaves out a size with no picture of its own or its product's", () => {
    const bare = product({ image_url: null, media: [] });
    const items = feedItems(
      store,
      [bare],
      [variant(), variant({ id: "v2", image_url: "https://media.boutq.store/v2.jpg" })],
    );
    expect(items.map((item) => item.id)).toEqual(["v2"]);
  });

  it("writes the Arabic feed in Arabic, and plain text in the description", () => {
    const [item] = feedItems({ ...store, lang: "ar" }, [product()], [variant()]);
    expect(item.title).toBe("عباية ليلى");
    const [en] = feedItems(store, [product()], [variant()]);
    expect(en.description).toBe("Soft crepe & a silk lining.");
  });

  it("makes a picture's path absolute on the store's host", () => {
    const [item] = feedItems(store, [product({ image_url: "/brands/b/p1.jpg" })], [variant()]);
    expect(item.image).toBe("https://pura.boutq.store/brands/b/p1.jpg");
  });
});

describe("the feed's document", () => {
  it("is RSS with Google's fields, every value escaped", () => {
    const [item] = feedItems(
      store,
      [product({ name_en: "Silk & Satin" })],
      [variant({ size: "Standard" })],
    );
    const doc = feedXml(store, [item]);
    expect(doc).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(doc).toContain("<title>Silk &amp; Satin</title>");
    expect(doc).toContain("<g:price>30.000 BHD</g:price>");
    expect(doc).toContain("<g:availability>in_stock</g:availability>");
    expect(doc).not.toContain("<g:sale_price>");
    expect(doc).not.toContain("<g:item_group_id>");
  });

  it("writes an amount with the currency's own decimals", () => {
    expect(feedPrice(12.5, "SAR")).toBe("12.50 SAR");
    expect(feedPrice(12.5, "kwd")).toBe("12.500 KWD");
  });

  it("cuts text to the limit at a word's end", () => {
    expect(plainText("one two three", 8)).toBe("one two…");
  });
});

describe("the feed's address", () => {
  it("is absolute, the store's own, and English by its parameter", () => {
    // In development the storefront lives under the store's slug on the local host.
    expect(feedAddress({ slug: "pura" }, "ar", "http://localhost:5173")).toBe(
      "http://localhost:5173/pura/products.xml",
    );
    expect(feedAddress({ slug: "pura" }, "en", "http://localhost:5173")).toBe(
      "http://localhost:5173/pura/products.xml?lang=en",
    );
  });
});
