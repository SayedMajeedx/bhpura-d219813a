import {
  AlertTriangle,
  CalendarDays,
  Check,
  Scissors,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStorefront } from "@/lib/storefront-context";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { resolveColorHex } from "@/lib/color-names";
import { formatAxisValue, type VariantField } from "@/lib/variant-axes";
import { readyUnitsOf } from "@/lib/product-availability";
import { lowStockLevel } from "@/lib/inventory-health";
import { lowStockLine } from "@/features/product-page/lib/stock-line";
import type { QuickAddPlan, QuickAddVariant } from "@/features/product-page/lib/quick-add";
import type { useQuickAddChoice } from "./use-quick-add";
import type { QuickAddPage } from "./use-quick-add";

type Choice = ReturnType<typeof useQuickAddChoice>;

/** The store's own word for making to measure, as on the product page's toggle. */
export function useCustomWord(): string {
  const { lang, t } = useStorefront();
  const { vocabulary } = useVocabulary();
  return vocabulary.custom_sizing?.[lang] || t("قياس خاص", "Custom sizing");
}

/** "باقي قطعة واحدة فقط" at the store's own low-stock level or fewer; nothing above it. */
export function useLowStockLine() {
  const { settings, lang } = useStorefront();
  const level = lowStockLevel(settings?.low_stock_threshold);
  return (variant: QuickAddVariant | null | undefined) =>
    variant ? lowStockLine(readyUnitsOf([variant]), level, lang) : null;
}

/** The chosen piece's "last pieces" line, as the product page draws it. */
export function LowStockNote({ variant }: { variant: QuickAddVariant | null | undefined }) {
  const line = useLowStockLine()(variant);
  if (!line) return null;
  return (
    <p role="status" className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      {line}
    </p>
  );
}

/**
 * The options of the pieces that can be added, in the store's words: a colour axis as swatches, the
 * rest as chips. Nothing starts picked; a value no piece has with the other picks is dimmed, and
 * choosing it lets go of the pick it does not fit.
 */
export function QuickAddOptions({
  choice,
  choices,
  onPicked,
}: {
  choice: Choice;
  choices: QuickAddVariant[];
  onPicked?: (field: VariantField, value: string) => void;
}) {
  const { lang } = useStorefront();
  const { axes, picked, selected } = choice;
  return (
    <>
      {axes.map((axis) => {
        const current = (picked[axis.field] ?? selected?.[axis.field] ?? "").trim();
        return (
          <div key={axis.key} className="mt-4 first:mt-0">
            <div className="text-xs font-medium text-foreground">
              {axis.label}:{" "}
              <span className="font-normal text-muted-foreground">
                {current ? formatAxisValue(axis, current, lang, choices) : ""}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={axis.label}>
              {axis.values.map((value) => {
                const isSelected = current.toLowerCase() === value.toLowerCase();
                const display = formatAxisValue(axis, value, lang, choices);
                const fits = choice.fits(axis.field, value);
                const pick = () => {
                  choice.select(axis.field, value);
                  onPicked?.(axis.field, value);
                };
                if (axis.swatch) {
                  const hex = resolveColorHex(value) || "#e5e7eb";
                  const light = ["#ffffff", "#fffff0", "#fffdd0", "#e5e7eb"].includes(
                    hex.toLowerCase(),
                  );
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant="ghost"
                      size="icon"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={display}
                      title={display}
                      onClick={pick}
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-transparent border p-0 transition ${
                        isSelected
                          ? "border-primary ring-2 ring-primary ring-offset-2"
                          : "border-border hover:scale-105"
                      } ${fits ? "" : "opacity-40"}`}
                      style={{ backgroundColor: hex }}
                    >
                      {isSelected && (
                        <Check
                          className={`h-3.5 w-3.5 ${light ? "text-black" : "text-white"}`}
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  );
                }
                return (
                  <Button
                    key={value}
                    type="button"
                    variant="ghost"
                    size="sm"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={pick}
                    className={`h-auto min-w-10 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    } ${fits ? "" : "opacity-40 line-through"}`}
                  >
                    {display}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** The words of a plan that opens a page. */
export function pageWords(
  reason: "tailor" | "details" | "book",
  customWord: string,
  t: (ar: string, en: string) => string,
): string {
  if (reason === "tailor") return customWord;
  if (reason === "book") return t("احجز", "Book");
  return t("اختر التفاصيل", "Choose details");
}

export function PageIcon({ reason, className }: { reason: string; className?: string }) {
  if (reason === "tailor") return <Scissors className={className} aria-hidden="true" />;
  if (reason === "book") return <CalendarDays className={className} aria-hidden="true" />;
  return <SlidersHorizontal className={className} aria-hidden="true" />;
}

/**
 * The quick view's and the sheet's buttons: add the chosen piece (asking for the option still to
 * pick until one is), or the one button to the page the plan sends the shopper to; and, beside a
 * made-to-order piece's ready sizes, the way to have it made to measure.
 */
export function QuickAddButtons({
  plan,
  choice,
  busy,
  onAdd,
  onOpenPage,
}: {
  plan: QuickAddPlan;
  choice: Choice;
  busy?: boolean;
  onAdd: () => void;
  onOpenPage: (page: QuickAddPage) => void;
}) {
  const { t } = useStorefront();
  const customWord = useCustomWord();
  const { selected, openAxis } = choice;
  return (
    <>
      {plan.kind === "add" ? (
        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={onAdd}
          disabled={busy || !selected}
          className="w-full gap-2 font-medium"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {selected || !openAxis
            ? t("إضافة إلى السلة", "Add to bag")
            : t(`اختر ${openAxis.label}`, `Choose ${openAxis.label.toLowerCase()}`)}
        </Button>
      ) : plan.kind === "page" ? (
        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={() => onOpenPage(plan.reason)}
          className="w-full gap-2 font-medium"
        >
          <PageIcon reason={plan.reason} className="h-4 w-4" />
          {pageWords(plan.reason, customWord, t)}
        </Button>
      ) : (
        <Button type="button" variant="default" size="lg" disabled className="w-full font-medium">
          {t("غير متوفر الآن", "Not available now")}
        </Button>
      )}

      {plan.kind === "add" && plan.tailorToo && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => onOpenPage("tailor")}
          className="w-full gap-2 font-medium"
        >
          <Scissors className="h-4 w-4" aria-hidden="true" />
          {t(`أو ${customWord}`, `Or ${customWord.toLowerCase()}`)}
        </Button>
      )}
    </>
  );
}
