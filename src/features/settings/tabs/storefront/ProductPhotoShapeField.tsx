import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  PRODUCT_PHOTO_CLASS,
  PRODUCT_PHOTO_RATIOS,
  verticalProductPhoto,
  type ProductPhotoRatio,
} from "@/lib/brand-templates/design-presets";

const SHAPE_WORDS: Record<ProductPhotoRatio, { ar: string; en: string }> = {
  "3:4": { ar: "طولي 3:4", en: "Portrait 3:4" },
  "4:5": { ar: "طولي 4:5", en: "Portrait 4:5" },
  "1:1": { ar: "مربع", en: "Square" },
  "4:3": { ar: "عرضي 4:3", en: "Landscape 4:3" },
};

/**
 * The shape of a product's photo on the storefront's cards. Until the store picks one it follows
 * its kind of goods (`verticalProductPhoto`: portrait for clothes, square for food, beauty and
 * jewellery, landscape for home and services), and the first choice says which; picking that
 * choice again hands the shape back to the vertical (null).
 */
export function ProductPhotoShapeField({
  value,
  vertical,
  isAr,
  onChange,
}: {
  value: string | null | undefined;
  vertical: string | null | undefined;
  isAr: boolean;
  onChange: (value: ProductPhotoRatio | null) => void;
}) {
  const labelId = useId();
  const fallback = verticalProductPhoto(vertical);
  const chosen = PRODUCT_PHOTO_RATIOS.includes(value as ProductPhotoRatio)
    ? (value as ProductPhotoRatio)
    : null;
  const options: Array<{
    value: ProductPhotoRatio | null;
    shape: ProductPhotoRatio;
    label: string;
  }> = [
    {
      value: null,
      shape: fallback,
      label: isAr
        ? `حسب نوع متجرك (${SHAPE_WORDS[fallback].ar})`
        : `Your kind of store (${SHAPE_WORDS[fallback].en})`,
    },
    ...PRODUCT_PHOTO_RATIOS.map((shape) => ({
      value: shape,
      shape,
      label: isAr ? SHAPE_WORDS[shape].ar : SHAPE_WORDS[shape].en,
    })),
  ];

  return (
    <div className="space-y-2">
      <div>
        <p id={labelId} className="text-xs font-semibold text-foreground">
          {isAr ? "شكل صور المنتجات في البطاقات" : "Product photo shape on cards"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "اختر الشكل الذي تُصوَّر به منتجاتك، فلا تُقصّ الصور. صفحة المنتج لها شكلها في الأسفل."
            : "Pick the shape your products are photographed in, so their photos are not cropped. The product page has its own below."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {options.map((option) => {
          const selected = option.value === chosen;
          return (
            <button
              key={option.value ?? "vertical"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-2.5 text-center text-xs transition-colors",
                selected
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              <span className="flex h-12 w-full items-center justify-center" aria-hidden="true">
                <span
                  className={cn(
                    "block h-full max-w-full rounded-sm bg-muted ring-1 ring-border",
                    PRODUCT_PHOTO_CLASS[option.shape],
                  )}
                />
              </span>
              <span className="leading-tight">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
