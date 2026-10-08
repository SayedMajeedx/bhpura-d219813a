import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Sizes typed as "52, 54 56" or with Arabic commas, as a list. */
export function parseSizes(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,،;/]+/)
        .map((size) => size.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * For the ticked drafts: set the category, the sizes or the price on all of them at once, or take
 * them out of the review.
 */
export function BulkEditBar({
  isAr,
  count,
  onCategory,
  onSizes,
  onPrice,
  onRemove,
}: {
  isAr: boolean;
  count: number;
  onCategory: (category: string) => void;
  onSizes: (sizes: string[]) => void;
  onPrice: (price: number) => void;
  onRemove: () => void;
}) {
  const [category, setCategory] = useState("");
  const [sizes, setSizes] = useState("");
  const [price, setPrice] = useState("");
  const priceValue = parseFloat(price);
  const priceOk = Number.isFinite(priceValue) && priceValue > 0;

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    onApply: () => void,
    ok: boolean,
    inputProps: { inputMode?: "decimal"; width: string; placeholder: string },
  ) => (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputProps.inputMode}
        placeholder={inputProps.placeholder}
        aria-label={label}
        className={`h-8 rounded-lg text-xs ${inputProps.width}`}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!ok}
        onClick={onApply}
        className="h-8 rounded-lg text-xs font-bold"
      >
        {isAr ? "تطبيق" : "Apply"}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <p className="text-xs font-bold text-foreground">
        {isAr ? `${count} محدد: عدّلها معاً` : `${count} selected: edit them together`}
      </p>
      {field(
        isAr ? "التصنيف لكل المحدد" : "Category for all selected",
        category,
        setCategory,
        () => {
          onCategory(category.trim());
          setCategory("");
        },
        category.trim().length > 0,
        { width: "w-32", placeholder: isAr ? "التصنيف" : "Category" },
      )}
      {field(
        isAr ? "المقاسات لكل المحدد" : "Sizes for all selected",
        sizes,
        setSizes,
        () => {
          onSizes(parseSizes(sizes));
          setSizes("");
        },
        parseSizes(sizes).length > 0,
        { width: "w-36", placeholder: isAr ? "52, 54, 56" : "52, 54, 56" },
      )}
      {field(
        isAr ? "السعر لكل المحدد" : "Price for all selected",
        price,
        setPrice,
        () => {
          onPrice(priceValue);
          setPrice("");
        },
        priceOk,
        { inputMode: "decimal", width: "w-24", placeholder: isAr ? "السعر" : "Price" },
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRemove}
        className="h-8 gap-1.5 rounded-lg border-destructive/40 text-xs font-bold text-destructive hover:bg-destructive/10 sm:ms-auto"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {isAr ? "إزالة المحدد" : "Remove selected"}
      </Button>
    </div>
  );
}
