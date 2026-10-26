import { PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OFF_SALE_CHOICES, offSaleChoiceLabel, offSaleEnd, offSaleStatus } from "@/lib/off-sale";

/**
 * Taking a product, or a whole category, off sale for a while: an hour, four, until tomorrow or
 * until put back, and putting it back. It stays on the store with when it is back; shoppers cannot
 * order it until then (the database refuses a storefront order line for it). `current` is the
 * moment it is off sale until, already read by `offSaleUntil` (null: on sale).
 */
export function OffSaleControl({
  isAr,
  subject,
  current,
  pending,
  onSet,
}: {
  isAr: boolean;
  subject: "product" | "category";
  current: string | null;
  pending: boolean;
  onSet: (until: string | null) => void;
}) {
  const now = new Date();
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div>
        <p className="text-xs font-semibold">
          {subject === "category"
            ? isAr
              ? "إيقاف القسم عن البيع مؤقتًا"
              : "Take the category off sale for a while"
            : isAr
              ? "إيقاف المنتج عن البيع مؤقتًا"
              : "Take off sale for a while"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isAr
            ? "يبقى ظاهرًا في المتجر مع موعد عودته، ولا يمكن طلبه حتى ذلك الوقت. طلباتك من لوحة الإدارة لا تتأثر."
            : "It stays on the store with when it is back, and cannot be ordered until then. Orders you make in the admin are not affected."}
        </p>
      </div>
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <PauseCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            {offSaleStatus(current, isAr, now)}
          </span>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() => onSet(null)}
          >
            <PlayCircle className="h-4 w-4" aria-hidden />
            {isAr ? "أعده للبيع" : "Put back on sale"}
          </Button>
        </div>
      ) : (
        <div
          role="group"
          aria-label={isAr ? "مدة الإيقاف" : "How long"}
          className="flex flex-wrap gap-1.5"
        >
          {OFF_SALE_CHOICES.map((choice) => (
            <Button
              key={choice}
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={pending}
              onClick={() => onSet(offSaleEnd(choice, new Date()))}
            >
              {offSaleChoiceLabel(choice, isAr)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
