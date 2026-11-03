import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  question,
  isAr,
}: {
  pieces: number;
  /** Each new size in words, in the order of the rows. */
  options: readonly string[];
  chosen: number;
  onChoose: (index: number) => void;
  /** The question, when it is not about pieces in stock (a supplier's order names the default). */
  question?: string;
  isAr: boolean;
}) {
  const asked = question ?? piecesQuestion(pieces, isAr);
  return (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <legend className="sr-only">{asked}</legend>
      <p className="text-sm font-medium" aria-hidden="true">
        {asked}
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {options.map((label, index) => {
          const on = index === chosen;
          return (
            <Button
              key={`${label}-${index}`}
              type="button"
              role="radio"
              aria-checked={on}
              variant={on ? "default" : "outline"}
              size="sm"
              onClick={() => onChoose(index)}
              className="min-h-9 gap-1 rounded-full px-3 pointer-coarse:min-h-11"
            >
              {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              <span dir="auto">{label}</span>
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{piecesHint(isAr)}</p>
    </fieldset>
  );
}
