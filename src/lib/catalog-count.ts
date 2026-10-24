import { arCount } from "@/lib/arabic-count";

/**
 * How many products (or services) a list holds, counted as each language counts: "12 منتجًا",
 * "3 منتجات", "منتجان", "12 products". The listing once wrote "12 منتجات" and "عرض 12 من أصل
 * 12 منتج" on the same screen.
 */
type CountOptions = { services?: boolean; lang: "ar" | "en" };

const AR = {
  product: { one: "منتج واحد", two: "منتجان", few: "منتجات", many: "منتجًا", none: "لا منتجات" },
  service: { one: "خدمة واحدة", two: "خدمتان", few: "خدمات", many: "خدمة", none: "لا خدمات" },
};

export function catalogCount(n: number, { services = false, lang }: CountOptions): string {
  if (lang === "en") {
    const noun = services ? "service" : "product";
    return `${n} ${n === 1 ? noun : `${noun}s`}`;
  }
  const forms = services ? AR.service : AR.product;
  return n <= 0 ? forms.none : arCount(n, forms);
}

/** A filtered list: "8 من 12" while filters hide some, else the whole count. */
export function shownOfTotal(shown: number, total: number, options: CountOptions): string {
  if (shown >= total) return catalogCount(total, options);
  return options.lang === "ar"
    ? `${shown} من ${total}`
    : `${shown} of ${catalogCount(total, options)}`;
}
