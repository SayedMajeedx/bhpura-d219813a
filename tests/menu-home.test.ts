import { describe, expect, it } from "vitest";
import {
  basketQty,
  menuCartLine,
  menuItemAction,
  menuPrice,
  menuSections,
  orderAgainItems,
  valueOpen,
} from "../src/features/storefront-home/lib/menu-home";
import type { ProductRow, StorefrontVariant } from "../src/lib/data/storefront";

// The quick-order menu's rules (`MenuHome`): its sections, what an item's button does, its price,
// "order again" and what the basket holds.

const variant = (id: string, price: number, stock: number, over: Record<string, unknown> = {}) => ({
  id,
  selling_price: price,
  original_price: null,
  stock_main: stock,
  stock_incubator: 0,
  size: null,
  color: null,
  ...over,
});

const product = (id: string, over: Record<string, unknown> = {}): ProductRow =>
  ({
    id,
    name: id,
    name_ar: null,
    name_en: id,
    description: null,
    category: null,
    image_url: null,
    media: null,
    brand_id: "b",
    created_at: "2026-10-01",
    item_kind: "product",
    is_made_to_order: false,
    custom_fields: null,
    product_variants: [variant(`${id}-v`, 2, 5)],
    ...over,
  }) as ProductRow;

const categories = [
  { slug: "bread", name_ar: "خبز", name_en: "Bread" },
  { slug: "cakes", name_ar: "كيك", name_en: "Cakes" },
  { slug: "empty", name_ar: "فارغ", name_en: "Empty" },
];

describe("the menu's sections", () => {
  it("follows the store's categories in their order, leaves out an empty one, and gathers the rest", () => {
    const sections = menuSections(
      [
        product("cake", { category: "cakes" }),
        product("loaf", { category: "bread" }),
        product("odd", { category: "gone" }),
        product("plain"),
      ],
      categories,
      false,
    );
    expect(sections.map((s) => [s.id, s.title, s.products.map((p) => p.id)])).toEqual([
      ["menu-bread", "Bread", ["loaf"]],
      ["menu-cakes", "Cakes", ["cake"]],
      ["menu-more", "More", ["odd", "plain"]],
    ]);
    expect(menuSections([product("cake", { category: "cakes" })], categories, true)[0].title).toBe(
      "كيك",
    );
  });

  it("calls everything the menu when nothing is filed under a category", () => {
    expect(menuSections([product("a")], [], false).map((s) => s.title)).toEqual(["Our menu"]);
    expect(menuSections([product("a")], [], true).map((s) => s.title)).toEqual(["قائمتنا"]);
    expect(menuSections([], categories, false)).toEqual([]);
  });
});

describe("an item's button", () => {
  it("adds an item with one variant at once", () => {
    const action = menuItemAction(product("loaf"));
    expect(action).toEqual({ kind: "add", variant: expect.objectContaining({ id: "loaf-v" }) });
  });

  it("asks for a choice when there are several, and says sold out when none can be bought", () => {
    const beans = product("beans", {
      product_variants: [variant("250g", 4, 3), variant("1kg", 12, 0)],
    });
    expect(menuItemAction(beans)).toEqual({ kind: "choose" });
    expect(
      menuItemAction(product("gone", { product_variants: [variant("gone-v", 2, 0)] })),
    ).toEqual({ kind: "sold_out" });
    expect(menuItemAction(product("none", { product_variants: [] }))).toEqual({
      kind: "sold_out",
    });
  });

  it("opens the page of a made-to-order item or one asking the customer's own details", () => {
    expect(menuItemAction(product("cake", { is_made_to_order: true }))).toEqual({
      kind: "details",
    });
    expect(
      menuItemAction(product("name-cake", { custom_fields: [{ label: "Name on the cake" }] })),
    ).toEqual({ kind: "details" });
  });
});

describe("an item's price", () => {
  it("is one price, or from the cheapest a shopper can buy", () => {
    expect(menuPrice(product("loaf"))).toEqual({ amount: 2, from: false });
    const beans = product("beans", {
      product_variants: [variant("250g", 4, 3), variant("1kg", 12, 1), variant("5kg", 1, 0)],
    });
    // The sold-out 5kg does not set "from".
    expect(menuPrice(beans)).toEqual({ amount: 4, from: true });
    expect(menuPrice(product("gone", { product_variants: [variant("g", 2, 0)] }))).toBeNull();
  });
});

describe("order again", () => {
  const beans = product("beans", {
    product_variants: [variant("250g", 4, 3), variant("1kg", 12, 0)],
  });
  const loaf = product("loaf");
  const cake = product("cake", { is_made_to_order: true });
  const products = [beans, loaf, cake];

  it("offers what was ordered before, as it was had, most recent first and once each", () => {
    const items = orderAgainItems(
      [
        {
          order_date: "2026-10-01",
          status: "completed",
          order_items: [{ product_id: "beans", variant_id: "250g" }],
        },
        {
          order_date: "2026-10-20",
          status: "completed",
          order_items: [
            { product_id: "loaf", variant_id: "loaf-v" },
            { product_id: "beans", variant_id: "250g" },
          ],
        },
      ],
      products,
    );
    expect(items.map((i) => i.variant.id)).toEqual(["loaf-v", "250g"]);
  });

  it("leaves out a cancelled order, a sold-out variant, a made-to-order piece and a gone product", () => {
    const items = orderAgainItems(
      [
        {
          order_date: "2026-10-20",
          status: "cancelled",
          order_items: [{ product_id: "loaf", variant_id: "loaf-v" }],
        },
        {
          order_date: "2026-10-10",
          status: "completed",
          order_items: [
            { product_id: "beans", variant_id: "1kg" },
            { product_id: "cake", variant_id: "cake-v" },
            { product_id: "deleted", variant_id: "x" },
            { product_id: null, variant_id: null },
          ],
        },
      ],
      products,
    );
    expect(items).toEqual([]);
  });

  it("stops at its limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => product(`p${i}`));
    const order = {
      order_date: "2026-10-20",
      status: "completed",
      order_items: many.map((p) => ({ product_id: p.id, variant_id: `${p.id}-v` })),
    };
    expect(orderAgainItems([order], many)).toHaveLength(8);
    expect(orderAgainItems([order], many, 3)).toHaveLength(3);
  });
});

describe("the basket", () => {
  it("adds a plain line, with no details of the customer's own", () => {
    const loaf = product("loaf", { custom_fields: [] });
    const line = menuCartLine(loaf, loaf.product_variants![0], 3);
    expect(line).toMatchObject({
      product_id: "loaf",
      variant_id: "loaf-v",
      price: 2,
      qty: 3,
      custom_fields: [],
    });
  });

  it("counts a variant's plain lines only", () => {
    const cart = [
      { variant_id: "loaf-v", qty: 2, custom_fields: [] },
      { variant_id: "loaf-v", qty: 1 },
      { variant_id: "loaf-v", qty: 4, custom_fields: [{ label: "Name", value: "Sara" }] },
      { variant_id: "other", qty: 9 },
    ];
    expect(basketQty(cart, "loaf-v")).toBe(3);
    expect(basketQty(cart, "none")).toBe(0);
  });
});

describe("a choice in the sheet", () => {
  it("can be picked only while a variant with it can be bought", () => {
    const beans = product("beans");
    const variants = [
      variant("250g-light", 4, 3, { size: "250g", color: "Light" }),
      variant("250g-dark", 4, 0, { size: "250g", color: "Dark" }),
      variant("1kg-dark", 12, 2, { size: "1kg", color: "Dark" }),
    ] as unknown as StorefrontVariant[];
    expect(valueOpen(beans, variants, "size", "250g", {})).toBe(true);
    expect(valueOpen(beans, variants, "color", "Dark", { size: "250g" })).toBe(false);
    expect(valueOpen(beans, variants, "color", "Dark", { size: "1kg" })).toBe(true);
  });
});
