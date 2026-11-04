import { FileText, Ruler, Scissors, SlidersHorizontal } from "lucide-react";
import { resolveAllVariantAxes, type variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { customFieldLabel, customFieldValue } from "@/lib/order-custom-fields";
import { lineFields, lineSize, madeToMeasure, madeToMeasureLabel } from "@/lib/made-to-measure";
import type { useVocabulary } from "@/hooks/use-vocabulary";
import type { OrderItem } from "@/features/orders/types";

const chip =
  "inline-flex items-center gap-1 rounded-lg border border-border-strong bg-background px-2.5 py-1 text-xs font-medium text-foreground";

/**
 * What a line is, read on the order page: its options in the store's own words (a piece made to
 * the customer's measurements names no size, `lineSize`), its measurements and answers, and what
 * the customer wrote for the workshop, as written (`lineFields`: the bookkeeping is left out).
 */
export function LineSpecsSummary({
  it,
  product,
  addonDefaults,
  length,
  appointment,
  madeToOrderModule,
  lang,
  vocabulary,
}: {
  it: OrderItem;
  product: Parameters<typeof resolveAllVariantAxes>[0]["product"];
  addonDefaults: ReturnType<typeof variantAxisDefaultsFrom>;
  /** A booked service's length, when the line is one. */
  length: string | null;
  appointment: boolean;
  madeToOrderModule: boolean;
  lang: "ar" | "en";
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  const isAr = lang === "ar";
  const { rows, notes } = lineFields(it.custom_field_values);
  const measured = madeToMeasure(it);
  const variant = it.selected_variant;
  if (!variant && rows.length === 0 && notes.length === 0) return null;
  const axes = resolveAllVariantAxes({ product, addonDefaults, lang });
  const size = lineSize(it);
  const Icon = madeToOrderModule ? Scissors : SlidersHorizontal;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
      <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span>
          {appointment
            ? isAr
              ? "تفاصيل الحجز"
              : "Booking details"
            : vocabulary.customization_options?.[lang] ||
              (isAr ? "المواصفات والخيارات" : "Specifications & Options")}
        </span>
      </div>
      {variant && (
        <div className="flex flex-wrap gap-2">
          {length && (
            <span className={chip}>
              <span className="text-muted-foreground">{isAr ? "المدة:" : "Length:"}</span>
              <b>{length}</b>
            </span>
          )}
          {!length && measured && (
            <span className={chip}>
              <Ruler className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <b>{madeToMeasureLabel(lang)}</b>
            </span>
          )}
          {!length && size && axes.size.visible && (
            <span className={chip}>
              <span className="text-muted-foreground">{axes.size.label}:</span>
              <b>{size}</b>
            </span>
          )}
          {variant.color && axes.color.visible && (
            <span className={chip}>
              <span className="text-muted-foreground">{axes.color.label}:</span>
              <b>{variant.color}</b>
            </span>
          )}
          {variant.fabric && axes.fabric.visible && (
            <span className={chip}>
              <span className="text-muted-foreground">{axes.fabric.label}:</span>
              <b>{variant.fabric}</b>
            </span>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border-subtle pt-1 sm:grid-cols-2">
          {rows.map((cf, i) => (
            <div key={`${cf.key}-${i}`} className="min-w-0 text-xs [overflow-wrap:anywhere]">
              <span className="font-bold text-muted-foreground">
                {customFieldLabel(cf, lang)}:{" "}
              </span>
              <span className="font-medium text-foreground">{customFieldValue(cf, lang)}</span>
            </div>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1 flex items-center gap-1.5 font-bold text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {isAr ? "ملاحظات للورشة" : "Notes for the workshop"}
          </p>
          {notes.map((note, i) => (
            <p
              key={i}
              dir="auto"
              className="whitespace-pre-line text-xs font-medium text-foreground [overflow-wrap:anywhere]"
            >
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
