import { countOf } from "@/lib/arabic-count";

/**
 * The line a shopper reads when the piece they chose is nearly gone: "باقي 3 قطع فقط". Said only
 * at the store's own low-stock level or fewer (`low_stock_threshold`, read with `lowStockLevel`;
 * 0 turns it off), and only for a piece sold from stock (a made-to-order piece has its own badge).
 * Above it nothing is said. The page once wrote "47 available" beside every size, which told a
 * visitor the store's stock and helped no one choose, "0 available" beside a sold-out size, and a
 * pulsing 🔥 at five pieces whatever level the store had set.
 */
export function lowStockLine(stock: number, level: number, lang: "ar" | "en"): string | null {
  const pieces = Math.floor(Number(stock));
  if (!Number.isFinite(pieces) || pieces <= 0 || level <= 0 || pieces > level) return null;
  return lang === "ar"
    ? `باقي ${countOf(pieces, "piece", "ar")} فقط`
    : `Only ${countOf(pieces, "piece", "en")} left`;
}
