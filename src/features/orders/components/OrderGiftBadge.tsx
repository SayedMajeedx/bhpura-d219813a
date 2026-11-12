import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { orderGift } from "@/lib/gift-order";

/**
 * "Gift": the order goes to someone as a gift (`orderGift`: its own details, else an older order's
 * notes), with what goes with it, so staff pack it as one. Nothing for an order that is not a gift.
 */
export function OrderGiftBadge({
  order,
  lang,
  className,
}: {
  order: { gift?: unknown; notes?: string | null };
  lang: "ar" | "en";
  className?: string;
}) {
  const gift = orderGift(order);
  if (!gift) return null;
  const isAr = lang === "ar";
  const extras = [
    gift.card ? (isAr ? "بطاقة" : "card") : null,
    gift.addons.length > 0
      ? gift.addons.map((addon) => (isAr ? addon.nameAr : addon.nameEn)).join(isAr ? "، " : ", ")
      : null,
  ].filter(Boolean);
  const title = [
    gift.recipient ? `${isAr ? "إلى" : "To"} ${gift.recipient}` : null,
    extras.length > 0 ? `${isAr ? "مع" : "With"}: ${extras.join(isAr ? "، " : ", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-foreground",
        className,
      )}
      title={title || undefined}
    >
      <Gift className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 break-words" dir="auto">
        {isAr ? "هدية" : "Gift"}
        {gift.recipient ? ` · ${gift.recipient}` : ""}
        {gift.addons.length > 0 ? ` · ${isAr ? "مع إضافات" : "with add-ons"}` : ""}
      </span>
    </span>
  );
}
