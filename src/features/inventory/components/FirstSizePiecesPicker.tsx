import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { piecesHint, piecesQuestion } from "@/features/inventory/lib/first-sizes";

/**
 * Asked when a product sold so far with no options gets its sizes while it holds pieces: which
 * of the new sizes those pieces are. That size takes the pieces, their history and orders; the
 * first is chosen until the merchant says otherwise.
 */
export function FirstSizePiecesPicker({
  pieces,
  options,
  chosen,
  onChoose,
  isAr,
}: {
  pieces: number;
  /** Each new size in words, in the order of the rows. */
  options: readonly string[];
  chosen: number;
  onChoose: (index: number) => void;
  isAr: boolean;
}) {
  return (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <legend className="sr-only">{piecesQuestion(pieces, isAr)}</legend>
      <p className="text-sm font-medium" aria-hidden="true">
        {piecesQuestion(pieces, isAr)}
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {options.map((label, index) => {
          const on = index === chosen;
          return (
            <button
              key={`${label}-${index}`}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChoose(index)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm pointer-coarse:min-h-11",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              <span dir="auto">{label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{piecesHint(isAr)}</p>
    </fieldset>
  );
}
