import { Link } from "@tanstack/react-router";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MomentBox } from "@/features/content-studio/components/MomentPanel";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * Made for You's choices: the store's made-to-order pieces to pick from,
 * and the making time the last chapter shows (from the settings, with a way
 * there when none is written). Nothing for other templates.
 */
export function MadeForYouPanel({ studio }: { studio: ContentStudio }) {
  const { isAr, templateId, slug } = studio;
  if (templateId !== "made-for-you") return null;
  const { products, selected, setProductId, makingTime } = studio;
  const madeToOrder = products.filter((product) => product.is_made_to_order).slice(0, 8);

  return (
    <MomentBox
      icon={Scissors}
      title={isAr ? "حسب الطلب" : "Made to order"}
      hint={
        madeToOrder.length > 0
          ? isAr
            ? "قطع تُصنع بعد الطلب:"
            : "Pieces made once they are ordered:"
          : isAr
            ? "لا توجد قطع حسب الطلب بعد. أي قطعة تصلح."
            : "No made-to-order pieces yet. Any piece will do."
      }
    >
      {madeToOrder.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {madeToOrder.map((product) => {
            const picked = product.id === selected?.id;
            return (
              <Button
                key={product.id}
                type="button"
                variant="chip"
                size="sm"
                aria-pressed={picked}
                onClick={() => setProductId(product.id)}
                className={cn(
                  "max-w-full rounded-full border-border",
                  picked && "border-primary bg-primary/10 text-primary hover:bg-primary/10",
                )}
              >
                <span className="truncate">
                  {isAr ? product.name_ar || product.name : product.name_en || product.name}
                </span>
              </Button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {makingTime
          ? isAr
            ? `آخر فصل يقول مدة التجهيز من إعداداتك: «${makingTime}».`
            : `The last chapter says your making time, from your settings: "${makingTime}".`
          : isAr
            ? "لم تُكتب مدة تجهيز القطع حسب الطلب بعد، فآخر فصل يذكر اسم القطعة."
            : "No making time is written yet, so the last chapter names the piece."}
      </p>
      {!makingTime && (
        <Link
          to="/admin/b/$slug/settings"
          params={{ slug }}
          className="inline-flex text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {isAr ? "كتابة مدة التجهيز" : "Write the making time"}
        </Link>
      )}
    </MomentBox>
  );
}
