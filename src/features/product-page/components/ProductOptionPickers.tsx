import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { formatSizeWithUnit } from "@/lib/format";
import { translateOptionValue } from "@/lib/variant-i18n";
import { Ruler, Scissors, Sparkles } from "lucide-react";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { resolveAllVariantAxes } from "@/lib/addons/addon-registry";
import {
  type StorefrontProductDetail as Product,
  type StorefrontVariant as Variant,
} from "@/lib/data/storefront";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { resolveColorHex } from "@/lib/color-names";
/** Option pickers: ready/custom size mode, colour swatches, size, fabric and extra option pills, and a fallback variant list. */
export function ProductOptionPickers({
  hasReadySizes,
  hasVariants,
  isColorOutOfStock,
  isFabricOutOfStock,
  isMadeToOrder,
  isMeasurementField,
  isSizeOutOfStock,
  isTailoringActive,
  isVisualColorAxis,
  lang,
  optionsRef,
  primary,
  product,
  resolvedAxes,
  selectedColor,
  selectedFabric,
  selectedOptionFive,
  selectedOptionFour,
  selectedSize,
  setCfValues,
  setErrorMsg,
  setMeasurementsApplied,
  setQty,
  setSelectedColor,
  setSelectedFabric,
  setSelectedOptionFive,
  setSelectedOptionFour,
  setSelectedSize,
  setSizeMode,
  setVariantId,
  showSizeModeToggle,
  sizeMode,
  t,
  uniqueColors,
  uniqueFabrics,
  uniqueFive,
  uniqueFour,
  uniqueSizes,
  variantId,
  variants,
  vocabulary,
}: {
  hasReadySizes: boolean;
  hasVariants: boolean;
  isColorOutOfStock: Record<string, boolean>;
  isFabricOutOfStock: Record<string, boolean>;
  isMadeToOrder: boolean;
  isMeasurementField: (key: string) => boolean;
  isSizeOutOfStock: Record<string, boolean>;
  isTailoringActive: boolean;
  isVisualColorAxis: boolean;
  lang: ReturnType<typeof useStorefront>["lang"];
  optionsRef: RefObject<HTMLDivElement | null>;
  primary: string;
  product: Product;
  resolvedAxes: ReturnType<typeof resolveAllVariantAxes>;
  selectedColor: string | null;
  selectedFabric: string | null;
  selectedOptionFive: string | null;
  selectedOptionFour: string | null;
  selectedSize: string | null;
  setCfValues: Dispatch<SetStateAction<Record<string, string>>>;
  setErrorMsg: Dispatch<SetStateAction<string | null>>;
  setMeasurementsApplied: Dispatch<SetStateAction<boolean>>;
  setQty: Dispatch<SetStateAction<number>>;
  setSelectedColor: Dispatch<SetStateAction<string | null>>;
  setSelectedFabric: Dispatch<SetStateAction<string | null>>;
  setSelectedOptionFive: Dispatch<SetStateAction<string | null>>;
  setSelectedOptionFour: Dispatch<SetStateAction<string | null>>;
  setSelectedSize: Dispatch<SetStateAction<string | null>>;
  setSizeMode: Dispatch<SetStateAction<"ready" | "custom">>;
  setVariantId: Dispatch<SetStateAction<string | null>>;
  showSizeModeToggle: boolean;
  sizeMode: "ready" | "custom";
  t: ReturnType<typeof useStorefront>["t"];
  uniqueColors: string[];
  uniqueFabrics: string[];
  uniqueFive: string[];
  uniqueFour: string[];
  uniqueSizes: string[];
  variantId: string | null;
  variants: Variant[];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  return (
    <div ref={optionsRef} className="mb-6 space-y-4 scroll-mt-24">
      {showSizeModeToggle && (
        <div className="rounded-xl border bg-muted/30 p-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {t("طريقة اختيار المقاس", "Sizing Method")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={sizeMode === "ready" ? "default" : "outline"}
              onClick={() => {
                setSizeMode("ready");
                setErrorMsg(null);
                setCfValues((prev) => {
                  const next = { ...prev };
                  Object.keys(next).forEach((k) => {
                    if (isMeasurementField(k)) {
                      delete next[k];
                    }
                  });
                  return next;
                });
                setMeasurementsApplied(false);
              }}
              className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                sizeMode === "ready" ? "shadow-sm" : ""
              }`}
            >
              <Ruler className="h-4 w-4" />
              <span>{t("مقاس جاهز", "Ready Size")}</span>
            </Button>
            <Button
              type="button"
              variant={sizeMode === "custom" ? "default" : "outline"}
              onClick={() => {
                setSizeMode("custom");
                setErrorMsg(null);
              }}
              className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                sizeMode === "custom" ? "shadow-sm" : ""
              }`}
            >
              <Scissors className="h-4 w-4" />
              <span>{vocabulary.custom_sizing?.[lang] || t("مقاس مخصص", "Custom Size")}</span>
            </Button>
          </div>
        </div>
      )}

      {!showSizeModeToggle && isMadeToOrder && !hasReadySizes && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-foreground">
                {vocabulary.made_to_order?.[lang] || t("صنع حسب الطلب", "Made to Order")}
              </span>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {vocabulary.custom_order?.[lang] || t("خاص", "Bespoke")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(
              "يتم تجهيز هذه القطعة خصيصاً على قياساتك الفردية لضمان أفضل ملاءمة وأناقة.",
              "This piece is tailored specifically to your personal measurements for a perfect fit.",
            )}
          </p>
          <div className="pt-2 flex items-center justify-between border-t border-primary/10">
            <span className="text-xs text-muted-foreground">
              {t("تحتاجين مساعدة في القياسات؟", "Need measuring guidance?")}
            </span>
            <AddonSlot
              placement="storefront.product.optionsAside"
              props={{
                product,
                selectedSize: null,
                uniqueSizes: [],
              }}
            />
          </div>
        </div>
      )}

      {/* 🔵 Circular Color Swatches OR 🏷️ Option Pills (Flavors / Types / Roasts) */}
      {uniqueColors.length > 0 && (resolvedAxes.color.visible || uniqueColors.length > 1) && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <span>{resolvedAxes.color.label || (lang === "ar" ? "الخيار" : "Option")}:</span>
            {selectedColor && (
              <span className="text-muted-foreground font-normal">
                {translateOptionValue(selectedColor, lang)}
              </span>
            )}
          </div>
          {isVisualColorAxis ? (
            <div className="flex flex-wrap gap-2.5">
              {uniqueColors.map((color) => {
                const active = selectedColor === color;
                const oos = !isTailoringActive && Boolean(isColorOutOfStock[color]);
                const hex = resolveColorHex(color);
                const ringStyle = active ? { borderColor: primary } : {};
                const localizedColor = translateOptionValue(color, lang);
                return (
                  <Button
                    key={color}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedColor(color);
                      setErrorMsg(null);
                    }}
                    className={`h-11 w-11 rounded-full border-2 p-0 relative ${
                      active ? "scale-110 shadow-sm" : "border-transparent hover:scale-105"
                    } ${oos ? "opacity-45 cursor-not-allowed" : ""}`}
                    style={ringStyle}
                    title={
                      localizedColor +
                      (oos ? ` (${t("غير متوفر جاهز", "out of ready stock")})` : "")
                    }
                    aria-label={localizedColor}
                  >
                    {hex ? (
                      <span
                        className="h-7 w-7 rounded-full border shadow-inner block relative overflow-hidden"
                        style={{ backgroundColor: hex }}
                      >
                        {oos && (
                          <span className="absolute inset-0 w-full h-[2px] bg-destructive/80 rotate-45 origin-center top-1/2 -translate-y-1/2" />
                        )}
                      </span>
                    ) : (
                      <span className="h-7 w-7 rounded-full border bg-muted flex items-center justify-center text-xs font-bold uppercase truncate shadow-inner relative overflow-hidden">
                        {localizedColor.slice(0, 2)}
                        {oos && (
                          <span className="absolute inset-0 w-full h-[2px] bg-destructive/80 rotate-45 origin-center top-1/2 -translate-y-1/2" />
                        )}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {uniqueColors.map((color) => {
                const active = selectedColor === color;
                const oos = !isTailoringActive && Boolean(isColorOutOfStock[color]);
                return (
                  <Button
                    key={color}
                    type="button"
                    variant={active ? "default" : "outline"}
                    onClick={() => {
                      setSelectedColor(color);
                      setErrorMsg(null);
                    }}
                    className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                      oos
                        ? "line-through opacity-45 cursor-not-allowed bg-muted text-muted-foreground border-dashed"
                        : ""
                    }`}
                  >
                    {translateOptionValue(color, lang)}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 📏 Size Selection Pills (if any) */}
      {uniqueSizes.length > 0 &&
        resolvedAxes.size.visible &&
        (!showSizeModeToggle || sizeMode === "ready") && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <span>{resolvedAxes.size.label}:</span>
                {selectedSize && (
                  <span className="text-muted-foreground font-normal">
                    {formatSizeWithUnit(
                      selectedSize,
                      variants.find((v) => v.size === selectedSize && v.size_unit)?.size_unit ||
                        variants.find((v) => v.size === selectedSize)?.size_unit,
                      lang,
                    )}
                  </span>
                )}
              </div>
              <AddonSlot
                placement="storefront.product.optionsAside"
                props={{
                  product,
                  selectedSize,
                  onSelectSize: (sz: string) => setSelectedSize(sz),
                  uniqueSizes,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {uniqueSizes.map((sz) => {
                const active = selectedSize === sz;
                const matchingVariant = variants.find((v) => v.size === sz && v.size_unit);
                const unit =
                  matchingVariant?.size_unit || variants.find((v) => v.size === sz)?.size_unit;
                const sizeLabel = formatSizeWithUnit(sz, unit, lang);
                const oos =
                  isSizeOutOfStock[sz] ||
                  Number(
                    variants
                      .filter((v) => v.size === sz)
                      .reduce(
                        (acc, v) =>
                          acc + Number(v.stock_main || 0) + Number(v.stock_incubator || 0),
                        0,
                      ),
                  ) <= 0;
                return (
                  <Button
                    key={sz}
                    type="button"
                    variant={active ? "default" : "outline"}
                    onClick={() => {
                      setSelectedSize(sz);
                      setErrorMsg(null);
                    }}
                    className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                      oos
                        ? "line-through opacity-45 cursor-not-allowed bg-muted text-muted-foreground border-dashed"
                        : ""
                    }`}
                  >
                    {sizeLabel}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

      {/* 🧵 Fabric Selection Pills (if any) */}
      {uniqueFabrics.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <span>{resolvedAxes.fabric.label || (lang === "ar" ? "الخامة" : "Fabric")}:</span>
            {selectedFabric && (
              <span className="text-muted-foreground font-normal">
                {translateOptionValue(selectedFabric, lang)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueFabrics.map((fb) => {
              const active = selectedFabric === fb;
              const oos =
                !isTailoringActive &&
                (isFabricOutOfStock[fb] ||
                  Number(
                    variants
                      .filter((v) => v.fabric === fb)
                      .reduce(
                        (acc, v) =>
                          acc + Number(v.stock_main || 0) + Number(v.stock_incubator || 0),
                        0,
                      ),
                  ) <= 0);
              return (
                <Button
                  key={fb}
                  type="button"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    setSelectedFabric(fb);
                    setErrorMsg(null);
                  }}
                  className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                    oos
                      ? "line-through opacity-45 cursor-not-allowed bg-muted text-muted-foreground border-dashed"
                      : ""
                  }`}
                >
                  {translateOptionValue(fb, lang)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* 🏷️ Option Four Selection Pills (if any) */}
      {uniqueFour.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <span>{resolvedAxes.four.label || (lang === "ar" ? "الخيار 4" : "Option 4")}:</span>
            {selectedOptionFour && (
              <span className="text-muted-foreground font-normal">
                {translateOptionValue(selectedOptionFour, lang)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueFour.map((opt) => {
              const active = selectedOptionFour === opt;
              return (
                <Button
                  key={opt}
                  type="button"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    setSelectedOptionFour(opt);
                    setErrorMsg(null);
                  }}
                  className="min-h-11 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {translateOptionValue(opt, lang)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* 🏷️ Option Five Selection Pills (if any) */}
      {uniqueFive.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <span>{resolvedAxes.five.label || (lang === "ar" ? "الخيار 5" : "Option 5")}:</span>
            {selectedOptionFive && (
              <span className="text-muted-foreground font-normal">
                {translateOptionValue(selectedOptionFive, lang)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueFive.map((opt) => {
              const active = selectedOptionFive === opt;
              return (
                <Button
                  key={opt}
                  type="button"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    setSelectedOptionFive(opt);
                    setErrorMsg(null);
                  }}
                  className="min-h-11 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {translateOptionValue(opt, lang)}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback general buttons if no properties could be isolated or visible */}
      {(!resolvedAxes.color.visible || uniqueColors.length === 0) &&
        (!resolvedAxes.size.visible || uniqueSizes.length === 0) &&
        (!resolvedAxes.fabric.visible || uniqueFabrics.length === 0) &&
        (!resolvedAxes.four.visible || uniqueFour.length === 0) &&
        (!resolvedAxes.five.visible || uniqueFive.length === 0) &&
        hasVariants &&
        (!showSizeModeToggle || sizeMode === "ready") &&
        !isTailoringActive &&
        !variants.every(isPlaceholderVariant) && (
          <div>
            <div className="text-sm font-medium mb-2">{t("الخيارات", "Options")}</div>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const oos = Number(v.stock_main || 0) + Number(v.stock_incubator || 0) <= 0;
                const active = v.id === variantId;
                const label =
                  [
                    formatSizeWithUnit(v.size, v.size_unit, lang),
                    translateOptionValue(v.color, lang),
                    translateOptionValue(v.fabric, lang),
                    translateOptionValue(v.option_four, lang),
                    translateOptionValue(v.option_five, lang),
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("متغيّر", "Variant");
                return (
                  <Button
                    key={v.id}
                    type="button"
                    variant={active ? "default" : "outline"}
                    disabled={oos}
                    onClick={() => {
                      setVariantId(v.id);
                      setQty(1);
                      setErrorMsg(null);
                    }}
                    className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${
                      oos ? "opacity-40 line-through cursor-not-allowed" : ""
                    }`}
                    aria-pressed={active}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}
