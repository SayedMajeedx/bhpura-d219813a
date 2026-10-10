import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidateCatalog, setMadeToOrderLimit } from "@/lib/data/catalog";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  madeToOrderLimitSummary,
  parseMadeToOrderLimit,
} from "@/features/inventory/lib/made-to-order-limit";

/**
 * How many pieces of a made-to-order product can still be made. Saved on its own, at once,
 * through the database's own setter (never with the rest of the product form), so a form left
 * open cannot overwrite what orders have taken since. A new product gets the field once it is
 * saved.
 */
export function MadeToOrderLimitField({
  brandId,
  productId,
  available,
  isAr,
}: {
  brandId: string;
  /** Null while the product is being created. */
  productId: string | null;
  /** The product's current number (null: no limit). */
  available: number | null | undefined;
  isAr: boolean;
}) {
  const qc = useQueryClient();
  const lang = isAr ? "ar" : "en";
  const [current, setCurrent] = useState<number | null>(available ?? null);
  const [text, setText] = useState(
    available === null || available === undefined ? "" : String(available),
  );
  useEffect(() => {
    setCurrent(available ?? null);
    setText(available === null || available === undefined ? "" : String(available));
  }, [available]);

  const parsed = parseMadeToOrderLimit(text);
  const changed = parsed.ok && parsed.value !== current;
  const save = useMutation({
    mutationFn: (value: number | null) => setMadeToOrderLimit(productId as string, value),
    onSuccess: (_result, value) => {
      setCurrent(value);
      toast.success(isAr ? "تم حفظ عدد القطع حسب الطلب" : "Made-to-order limit saved");
      void invalidateCatalog(qc, brandId);
    },
    onError: (error) => toast.error(getFriendlyErrorMessage(error)),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <Label htmlFor="made-to-order-limit" className="text-xs font-semibold">
        {isAr ? "كم قطعة يمكن صنعها حسب الطلب بعد؟" : "How many more can be made to order?"}
      </Label>
      {productId ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="made-to-order-limit"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              className="h-9 w-28 text-xs font-mono"
              placeholder={isAr ? "بلا حد" : "No limit"}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={!changed || save.isPending}
              onClick={() => parsed.ok && save.mutate(parsed.value)}
            >
              {save.isPending
                ? isAr
                  ? "جاري الحفظ…"
                  : "Saving…"
                : isAr
                  ? "حفظ العدد"
                  : "Save limit"}
            </Button>
            {text.trim() !== "" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setText("")}
              >
                {isAr ? "بلا حد" : "No limit"}
              </Button>
            )}
          </div>
          {!parsed.ok ? (
            <p className="text-xs font-semibold text-destructive" role="alert">
              {parsed.error[lang]}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {madeToOrderLimitSummary(current, lang)}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "احفظ المنتج أولاً، ثم حدد عدد القطع التي يمكن صنعها."
            : "Save the product first, then set how many pieces can be made."}
        </p>
      )}
    </div>
  );
}
