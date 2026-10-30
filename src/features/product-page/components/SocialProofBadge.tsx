import { TrendingUp } from "lucide-react";
import { countOf } from "@/lib/arabic-count";

/**
 * "Bought 5 times in the last week", a quiet line under the price (the database gives the count only
 * from 3 up: `get_product_recent_purchase_count`). It was an amber pill with a sparkle beside the
 * pulsing stock badge, and read "11 مرات" where Arabic says "11 مرة" (`countOf`).
 */
export function SocialProofBadge({ count, lang }: { count: number; lang: "ar" | "en" }) {
  const times = countOf(count, "time", lang);
  return (
    <p className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
      <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
      {lang === "ar"
        ? `تم شراؤه ${times} خلال الأسبوع الماضي`
        : `Bought ${times} in the last 7 days`}
    </p>
  );
}
