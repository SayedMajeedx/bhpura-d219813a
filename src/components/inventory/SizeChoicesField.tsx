import { useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toggledSize, withSize } from "@/lib/size-choices";

/**
 * A new product's sizes: the store's usual sizes as chips one tap away, and any other typed by
 * hand. With `stock`, each chosen size takes its opening pieces beside it. Rules in
 * `src/lib/size-choices.ts`.
 */
export function SizeChoicesField({
  legend,
  offered,
  sizes,
  onSizes,
  stock,
  onStock,
  stockLabel,
  hint,
  isAr,
}: {
  /** The store's own word for its size axis. */
  legend: string;
  /** The sizes offered in one tap (`usualSizes`). */
  offered: readonly string[];
  sizes: readonly string[];
  onSizes: (sizes: string[]) => void;
  /** Each chosen size's opening pieces, as typed. */
  stock?: Readonly<Record<string, string>>;
  onStock?: (size: string, typed: string) => void;
  /** The pieces field's name, in the reader's language. */
  stockLabel?: string;
  /** Under the chips: what choosing no size means. */
  hint: string;
  isAr: boolean;
}) {
  const uid = useId();
  const [typed, setTyped] = useState("");
  const choices = [...offered, ...sizes.filter((size) => !offered.includes(size))];
  const addTyped = () => {
    onSizes(withSize(sizes, typed));
    setTyped("");
  };

  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((size) => {
            const on = sizes.includes(size);
            return (
              <button
                key={size}
                type="button"
                aria-pressed={on}
                onClick={() => onSizes(toggledSize(sizes, size))}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm pointer-coarse:min-h-11",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                <span dir="auto">{size}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex min-w-0 gap-2">
        <Input
          aria-label={isAr ? "مقاس آخر" : "Another size"}
          value={typed}
          maxLength={40}
          placeholder={isAr ? "مقاس آخر" : "Another size"}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTyped();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={addTyped}
          disabled={!typed.trim()}
          className="shrink-0 gap-1"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {isAr ? "إضافة" : "Add"}
        </Button>
      </div>
      {stock && onStock && sizes.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sizes.map((size, index) => (
            <div key={size} className="flex min-w-0 items-center gap-2">
              <label
                htmlFor={`${uid}-stock-${index}`}
                className="min-w-0 shrink truncate text-xs font-medium"
                dir="auto"
              >
                {size}
              </label>
              <Input
                id={`${uid}-stock-${index}`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={stock[size] ?? ""}
                placeholder="0"
                aria-label={stockLabel ? `${stockLabel}: ${size}` : undefined}
                onChange={(e) => onStock(size, e.target.value)}
                className="h-9 min-w-0 flex-1 font-mono tabular-nums"
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  );
}
