import React from "react";
import { resolveColorHex, extractUniqueVariantColors } from "@/lib/color-names";
import { resolveVariantAxis, type ProductVariantLabels } from "@/lib/addons/addon-registry";
import { isColorSwatchAxis, useStoreAxisDefaults } from "@/lib/variant-axes";
import { useStorefront } from "@/lib/storefront-context";

interface ColorDotsProps {
  variants?: Array<{ color?: string | null }>;
  /** Product whose per-product option labels (if any) decide what the colour slot means. */
  product?: ProductVariantLabels | null;
  maxVisible?: number;
  className?: string;
  onColorSelect?: (colorName: string) => void;
  selectedColor?: string | null;
}

export function ColorDots({
  variants,
  maxVisible = 5,
  className = "",
  onColorSelect,
  selectedColor,
  product,
}: ColorDotsProps) {
  const { lang } = useStorefront();
  const axisDefaults = useStoreAxisDefaults();
  const colors = extractUniqueVariantColors(variants);

  // The colour column only holds colours in some stores (a roastery keeps the
  // grind there). Dots appear only when the slot really means colour.
  const { label } = resolveVariantAxis({
    axis: "color",
    product,
    addonDefaults: axisDefaults,
    lang: lang === "ar" ? "ar" : "en",
    hasValues: colors.length > 0,
  });
  if (
    colors.length === 0 ||
    !isColorSwatchAxis(
      label,
      colors.map((c) => c.name),
    )
  ) {
    return null;
  }

  const visible = colors.slice(0, maxVisible);
  const remaining = colors.length - maxVisible;

  return (
    <div
      role="group"
      aria-label="خيارات الألوان المتاحة / Available color options"
      className={`flex items-center gap-1.5 flex-wrap ${className}`}
    >
      {visible.map((c) => {
        const hex = c.hex || resolveColorHex(c.name) || "#94a3b8";
        const isSelected = selectedColor === c.name;

        if (onColorSelect) {
          return (
            <button
              key={c.name}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onColorSelect(c.name);
              }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={isSelected}
              className={`h-3.5 w-3.5 rounded-full border border-border shadow-xs transition-transform duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                isSelected ? "ring-2 ring-primary ring-offset-1 scale-110" : ""
              }`}
              style={{ backgroundColor: hex }}
            />
          );
        }

        return (
          <span
            key={c.name}
            title={c.name}
            aria-label={c.name}
            className="h-3 w-3 rounded-full border border-border shadow-xs inline-block"
            style={{ backgroundColor: hex }}
          />
        );
      })}

      {remaining > 0 && (
        <span
          className="text-xs font-medium text-muted-foreground select-none leading-none px-0.5"
          aria-label={`+${remaining} ألوان إضافية`}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
