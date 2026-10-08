import { describe, expect, it, vi } from "vitest";

// Price and date formatters, and the image addresses, are built once and reused: building them per
// call was the biggest single cost of hydrating a store page on a phone. The output must not change.

const client = { supabase: {} };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { cachedNumberFormat, cachedDateFormat, westernNumeralLocale } =
  await import("../src/lib/intl-cache");
const { formatMoney, formatDate } = await import("../src/lib/format");
const { formatPrice } = await import("../src/lib/storefront-context");
const { cloudflareImageUrl } = await import("../src/lib/media-delivery");

describe("cached formatters give the same text as new ones", () => {
  it("formats prices the way a fresh Intl.NumberFormat does", () => {
    const fresh = (locale: string, currency: string, digits: number, amount: number) =>
      new Intl.NumberFormat(westernNumeralLocale(locale), {
        style: "currency",
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(amount);
    for (const amount of [0, 12.5, 40, 1234.567, 99999.9]) {
      expect(formatPrice(amount, "BHD", "en")).toBe(fresh("en-BH", "BHD", 3, amount));
      expect(formatPrice(amount, "bhd", "ar")).toBe(fresh("ar-BH-u-nu-latn", "BHD", 3, amount));
      expect(formatPrice(amount, "SAR", "en")).toBe(fresh("en-BH", "SAR", 2, amount));
    }
    expect(formatMoney(12.5, "KWD")).toBe(
      new Intl.NumberFormat(westernNumeralLocale("en-BH"), {
        style: "currency",
        currency: "KWD",
        currencyDisplay: "symbol",
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(12.5),
    );
  });

  it("formats dates and keeps the fallbacks", () => {
    expect(formatDate("2026-10-07")).toBe(
      new Intl.DateTimeFormat(westernNumeralLocale("en-BH"), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(2026, 9, 7)),
    );
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(westernNumeralLocale("ar-BH-u-nu-latn")).toContain("latn");
    expect(westernNumeralLocale("not a locale!!")).toBe("en-BH-u-nu-latn");
    // The shortcut gives what Intl.Locale gives.
    for (const locale of ["en-BH", "ar-BH-u-nu-latn", "ar", "en-GB", "ar-SA"]) {
      expect(westernNumeralLocale(locale)).toBe(
        new Intl.Locale(locale, { numberingSystem: "latn" }).toString(),
      );
    }
  });
});

describe("cached formatters are built once", () => {
  it("builds one NumberFormat and one DateTimeFormat for a thousand calls", () => {
    const numberSpy = vi.spyOn(Intl, "NumberFormat");
    const dateSpy = vi.spyOn(Intl, "DateTimeFormat");
    for (let i = 0; i < 1000; i++) {
      formatPrice(i, "BHD", "ar");
      formatMoney(i, "BHD", "en-BH");
      formatDate("2026-10-07");
    }
    // One for the Arabic price, one for the English money, one date: never one per call.
    expect(numberSpy.mock.calls.length).toBeLessThanOrEqual(2);
    expect(dateSpy.mock.calls.length).toBeLessThanOrEqual(1);
    numberSpy.mockRestore();
    dateSpy.mockRestore();
  });

  it("keeps different options apart", () => {
    const a = cachedNumberFormat("en-BH", { style: "currency", currency: "BHD" });
    const b = cachedNumberFormat("en-BH", { style: "currency", currency: "SAR" });
    expect(a).not.toBe(b);
    expect(a).toBe(cachedNumberFormat("en-BH", { style: "currency", currency: "BHD" }));
    expect(cachedDateFormat("en-GB", { year: "numeric" })).toBe(
      cachedDateFormat("en-GB", { year: "numeric" }),
    );
  });

  it("still refuses a bad currency, as before", () => {
    expect(() => formatPrice(1, "", "en")).toThrow();
    expect(formatMoney(1, "")).toBe(" 1.00");
  });
});

describe("image addresses", () => {
  const src = "https://media.boutq.store/brands/b1/hero/a.webp";

  it("are the same string every time, per width and quality", () => {
    const first = cloudflareImageUrl(src, 640);
    expect(first).toBe(
      `/cdn-cgi/image/width=640,fit=scale-down,quality=75,format=auto,metadata=none,onerror=redirect/${encodeURI(src)}`,
    );
    expect(cloudflareImageUrl(src, 640)).toBe(first);
    expect(cloudflareImageUrl(src, 960)).not.toBe(first);
    expect(cloudflareImageUrl(src, 640, 60)).toContain("quality=60");
  });

  it("leave vectors, data images, empty and ImageKit addresses alone", () => {
    expect(cloudflareImageUrl("https://x/logo.svg", 640)).toBe("https://x/logo.svg");
    expect(cloudflareImageUrl("data:image/png;base64,AAAA", 640)).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(cloudflareImageUrl("", 640)).toBe("");
    expect(cloudflareImageUrl("https://ik.imagekit.io/x/a.jpg", 640)).toBe(
      "https://ik.imagekit.io/x/a.jpg",
    );
  });
});
