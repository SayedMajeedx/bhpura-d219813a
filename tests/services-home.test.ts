import { describe, expect, it } from "vitest";
import {
  extraHourPriceOf,
  fromPriceOf,
  includeLinesOf,
  isServicesStore,
  lengthPrices,
  lengthRangeText,
  minutesText,
  packageOffer,
  serviceImages,
  splitServices,
} from "../src/features/services-home/lib/services-home";
import type { ProductRow } from "../src/lib/data/storefront";

const variant = (price: number, minutes: number | null = null, was: number | null = null) => ({
  id: `v${price}-${minutes}`,
  selling_price: price,
  original_price: was,
  stock_main: 0,
  size: null,
  color: null,
  duration_minutes: minutes,
});

const product = (over: Record<string, unknown>): ProductRow =>
  ({
    id: "p",
    name: "Service",
    name_ar: null,
    name_en: null,
    description: null,
    description_ar: null,
    description_en: null,
    category: null,
    image_url: null,
    media: null,
    brand_id: "b",
    created_at: "2026-10-01",
    item_kind: "service",
    is_package: false,
    product_variants: [],
    ...over,
  }) as ProductRow;

const booth = product({
  id: "booth",
  name: "Booth",
  extra_hour_price: 15,
  product_variants: [variant(40, 60), variant(70, 120), variant(95, 180)],
  service_includes: [
    { ar: "طباعة فورية", en: "Instant prints" },
    { ar: "", en: "Props" },
    { ar: "", en: "" },
  ],
});
const prints = product({ id: "prints", name: "Prints", product_variants: [variant(20)] });
const bundle = product({
  id: "bundle",
  name: "Bundle",
  is_package: true,
  extra_hour_price: 15,
  product_variants: [variant(50, 60)],
});
const goods = product({ id: "shirt", name: "Shirt", item_kind: "product" });

describe("the home page of a services store", () => {
  it("is the services page only for a store of services with bookings on", () => {
    expect(isServicesStore(true, [booth, prints, bundle])).toBe(true);
    expect(isServicesStore(true, [booth, goods])).toBe(false);
    expect(isServicesStore(false, [booth])).toBe(false);
    expect(isServicesStore(true, [])).toBe(false);
  });

  it("separates services from packages", () => {
    const { services, packages } = splitServices([booth, bundle, prints, goods]);
    expect(services.map((p) => p.id)).toEqual(["booth", "prints"]);
    expect(packages.map((p) => p.id)).toEqual(["bundle"]);
  });

  it("reads a card's price, lengths, includes and extra hour", () => {
    expect(fromPriceOf(booth)).toBe(40);
    expect(fromPriceOf(prints)).toBe(20);
    expect(fromPriceOf(product({}))).toBeNull();
    expect(lengthRangeText(booth, false)).toBe("1 hour to 3 hours");
    expect(lengthRangeText(booth, true)).toBe("من ساعة إلى 3 ساعات");
    expect(lengthRangeText(prints, false)).toBe("");
    expect(minutesText(90, false)).toBe("90 min");
    expect(minutesText(120, true)).toBe("ساعتان");
    expect(includeLinesOf(booth, true)).toEqual(["طباعة فورية", "Props"]);
    expect(includeLinesOf(booth, false)).toEqual(["Instant prints", "Props"]);
    expect(extraHourPriceOf(booth)).toBe(15);
    expect(extraHourPriceOf(prints)).toBeNull();
  });

  it("lists a service's pictures once, cover first, and what each length costs", () => {
    const framed = product({
      image_url: "https://cdn.test/cover.jpg",
      media: [
        { type: "image", url: "https://cdn.test/a.jpg" },
        { type: "video", url: "https://cdn.test/v.mp4" },
        { type: "image", url: "https://cdn.test/cover.jpg" },
        null,
      ],
    });
    expect(serviceImages(framed)).toEqual(["https://cdn.test/cover.jpg", "https://cdn.test/a.jpg"]);
    expect(serviceImages(product({}))).toEqual([]);
    expect(lengthPrices(booth)).toEqual([
      { minutes: 60, price: 40 },
      { minutes: 120, price: 70 },
      { minutes: 180, price: 95 },
    ]);
    expect(lengthPrices(prints)).toEqual([]);
  });

  it("shows a package against its services apart", () => {
    const name = (p: ProductRow) => p.name;
    const offer = packageOffer(
      bundle,
      [
        { product_id: "booth", quantity: 1 },
        { product_id: "prints", quantity: 2 },
      ],
      [booth, prints, bundle],
      name,
    );
    // From prices apart: 40 + 2 x 20 = 80 against 50.
    expect(offer).toMatchObject({ price: 50, apart: 80, saving: { amount: 30, percent: 38 } });
    expect(offer?.includes).toEqual([
      { id: "booth", name: "Booth", quantity: 1 },
      { id: "prints", name: "Prints", quantity: 2 },
    ]);
    // No saving when the package costs as much as its parts; nothing without services.
    const same = packageOffer(
      product({ ...bundle, product_variants: [variant(80, 60)] }),
      [
        { product_id: "booth", quantity: 1 },
        { product_id: "prints", quantity: 2 },
      ],
      [booth, prints],
      name,
    );
    expect(same?.saving).toBeNull();
    // A package with no linked services still shows, by its price alone.
    expect(packageOffer(bundle, [], [booth], name)).toEqual({
      price: 50,
      apart: null,
      saving: null,
      includes: [],
    });
    expect(packageOffer(product({ is_package: true }), [], [booth], name)).toBeNull();
  });
});
