import { describe, expect, it } from "vitest";
import {
  extraHourPriceOf,
  fromPriceOf,
  includeLinesOf,
  isServicesStore,
  compareAtAt,
  fromCompareAtOf,
  lengthPrices,
  lengthRangeText,
  minutesText,
  packageOffer,
  serviceImages,
  splitServices,
  reservesPicture,
  servicePlace,
} from "../src/features/services-home/lib/services-home";
import type { ProductRow } from "../src/lib/data/storefront";
import {
  packageLength,
  packageSaving,
  packageSavingText,
  separatePrice,
  wasPrice,
} from "../src/lib/bookings/service-package";

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
    expect(minutesText(660, true)).toBe("11 ساعة");
    expect(minutesText(90, true)).toBe("90 دقيقة");
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
      { minutes: 60, price: 40, was: null },
      { minutes: 120, price: 70, was: null },
      { minutes: 180, price: 95, was: null },
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
      was: null,
      saving: null,
      includes: [],
    });
    expect(packageOffer(product({ is_package: true }), [], [booth], name)).toBeNull();
  });

  it("compares a package at its own length, as its page does (Aurora's Diamond: 41%, not 3%)", () => {
    const hours = (h: number) => h * 60;
    const service = (id: string, prices: Array<[number, number]>) =>
      product({ id, name: id, product_variants: prices.map(([h, p]) => variant(p, hours(h))) });
    const photobooth = service("photobooth", [
      [3, 55],
      [5, 91],
    ]);
    const phonebooth = service("phonebooth", [
      [3, 40],
      [5, 66],
    ]);
    const videobooth = service("videobooth", [
      [3, 70],
      [5, 116],
    ]);
    const diamond = product({
      id: "diamond",
      is_package: true,
      product_variants: [variant(160, hours(5))],
    });
    const lines = ["photobooth", "phonebooth", "videobooth"].map((id) => ({
      product_id: id,
      quantity: 1,
    }));
    const offer = packageOffer(diamond, lines, [photobooth, phonebooth, videobooth], (p) => p.name);
    expect(offer).toMatchObject({ price: 160, apart: 273, saving: { amount: 113, percent: 41 } });
    // The package's own page, given the same length, says the same.
    const services = [photobooth, phonebooth, videobooth].map((p) => ({
      id: p.id,
      variants: p.product_variants,
    }));
    expect(
      packageSaving(
        separatePrice(lines, services, packageLength(diamond.product_variants, null)),
        160,
      ),
    ).toEqual({ amount: 113, percent: 41 });
    expect(packageSavingText({ amount: 113, percent: 41 }, "113.000 د.ب", true)).toBe(
      "وفّر 113.000 د.ب (41%)",
    );
    expect(packageSavingText({ amount: 113, percent: 41 }, "BHD 113.000", false)).toBe(
      "Save BHD 113.000 (41%)",
    );
  });

  it("takes a package's chosen length, else its cheapest price's, else none", () => {
    const variants = [variant(160, 300), variant(120, 180)];
    expect(packageLength(variants, 300)).toBe(300);
    expect(packageLength(variants, null)).toBe(180);
    expect(packageLength([variant(50)], null)).toBeNull();
  });
});

describe("the cards' shared words and pictures", () => {
  it("say where a service happens in the shopper's language, or nothing", () => {
    expect(servicePlace("customer", false)).toBe("At your place");
    expect(servicePlace("both", true)).toBe("في موقعك أو موقعنا");
    expect(servicePlace(null, false)).toBeNull();
  });

  it("keep a picture's space only when another card of the row has a picture", () => {
    const card = (image_url: string | null) => ({ image_url }) as never;
    expect(reservesPicture([card(null), card("https://cdn/booth.jpg")])).toBe(true);
    expect(reservesPicture([card(null), card(null)])).toBe(false);
  });
});

describe("the price a service is struck against", () => {
  const hours = (h: number) => h * 60;
  const photobooth = product({ id: "photobooth", product_variants: [variant(50, hours(5))] });
  const videobooth = product({ id: "videobooth", product_variants: [variant(85, hours(5))] });
  const lines = ["photobooth", "videobooth"].map((id) => ({ product_id: id, quantity: 1 }));

  it("is the merchant's own price before discount, over the services apart", () => {
    // Aurora's Diamond Package: 160 for 5 hours, 215 before discount, 135 apart.
    const diamond = product({
      id: "diamond",
      is_package: true,
      product_variants: [variant(160, hours(5), 215)],
    });
    const offer = packageOffer(diamond, lines, [photobooth, videobooth], (p) => p.name);
    expect(offer).toMatchObject({
      price: 160,
      apart: 135,
      was: 215,
      saving: { amount: 55, percent: 26 },
    });
  });

  it("is the services apart when no price before discount is set, and nothing when neither is above", () => {
    const pearl = product({
      id: "pearl",
      is_package: true,
      product_variants: [variant(120, hours(5))],
    });
    expect(packageOffer(pearl, lines, [photobooth, videobooth], (p) => p.name)).toMatchObject({
      was: 135,
      saving: { amount: 15, percent: 11 },
    });
    expect(wasPrice(null, 100, 120)).toBeNull();
    expect(wasPrice(100, null, 120)).toBeNull();
    expect(wasPrice(130, 140, 120)).toBe(130);
  });

  it("is each length's own, on a rental and a service card", () => {
    const booth = product({
      product_variants: [variant(45, hours(4), 60), variant(40, hours(3))],
    });
    expect(lengthPrices(booth)).toEqual([
      { minutes: 180, price: 40, was: null },
      { minutes: 240, price: 45, was: 60 },
    ]);
    expect(compareAtAt(booth, hours(4))).toBe(60);
    // The card's "from" price is 3 hours, which has none.
    expect(fromCompareAtOf(booth)).toBeNull();
  });
});
