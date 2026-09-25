import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Wand as Wand2, Boxes, RefreshCw, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { createVariants, updateProduct } from "@/lib/data/catalog";
import { parseVariantPrompt, type VariantGenerationPlan } from "@/lib/generate-variants.functions";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";

import {
  variantAxisDefaultsFrom,
  resolveVariantAxis,
  sizingPresetsFrom,
  sizingPresetOrderFrom,
} from "@/lib/addons/addon-registry";
import {
  getVerticalSizingPresets,
  getVerticalAiPromptPlaceholder,
  getVerticalAxisPlaceholders,
} from "@/lib/addons/vertical-inventory";
import { useAddons } from "@/components/addons/AddonsProvider";
import type { Product, Variant, BulkVariantRow } from "@/features/inventory/types";
import { SIZE_UNITS, SIZE_UNIT_LABELS } from "@/features/inventory/lib/size-units";
import { BulkVariantPreview } from "@/features/inventory/components/BulkVariantPreview";
import { useBulkBatchControls } from "@/features/inventory/hooks/use-bulk-batch-controls";
import {
  buildBulkVariantRows,
  parsedPlanMessage,
  bulkRowPricing,
  hasInvalidBulkRows,
} from "@/features/inventory/lib/bulk-variants";
import { prefetchOptionTranslations } from "@/features/inventory/lib/option-translations";

export function BulkVariantDialog({
  productId,
  product,
  variants,
  canViewFinancials,
  onChanged,
}: {
  productId: string;
  product?: Product;
  variants: Variant[];
  canViewFinancials: boolean;
  onChanged: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const { profile: storeProfile } = useAdminStoreProfile(brand.id);
  const { addons } = useAddons();
  const addonAxisDefaults = useMemo(
    () => variantAxisDefaultsFrom(addons.length > 0 ? addons : storeProfile?.addons),
    [addons, storeProfile?.addons],
  );
  const currentVertical = storeProfile?.vertical || "general";

  const sizeAxis = resolveVariantAxis({
    axis: "size",
    product,
    addonDefaults: addonAxisDefaults,
    lang: isAr ? "ar" : "en",
  });
  const colorAxis = resolveVariantAxis({
    axis: "color",
    product,
    addonDefaults: addonAxisDefaults,
    lang: isAr ? "ar" : "en",
  });
  const fabricAxis = resolveVariantAxis({
    axis: "fabric",
    product,
    addonDefaults: addonAxisDefaults,
    lang: isAr ? "ar" : "en",
  });

  const orderedPresets = useMemo(() => {
    const rows = addons.length > 0 ? addons : storeProfile?.addons;
    const fromAddons = sizingPresetsFrom(rows);
    const order = sizingPresetOrderFrom(rows);
    return getVerticalSizingPresets(currentVertical, fromAddons, order);
  }, [addons, storeProfile?.addons, currentVertical]);

  const aiPromptPlaceholder = useMemo(
    () => getVerticalAiPromptPlaceholder(currentVertical, isAr),
    [currentVertical, isAr],
  );

  const { sizePlaceholder, colorPlaceholder } = useMemo(
    () => getVerticalAxisPlaceholders(currentVertical, isAr),
    [currentVertical, isAr],
  );
  const existingSku = variants.find((v) => v.sku)?.sku || "";
  const blank: VariantGenerationPlan = {
    base_sku: existingSku,
    sizes: [],
    colors: [],
    fabric: "",
    size_unit: "",
    cost_price: Number(product?.cost_price ?? 0),
    selling_price: Number(product?.base_price ?? 0),
    stock_main: 0,
    stock_incubator: 0,
    size_stock_map: {},
  };
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<VariantGenerationPlan>(blank);
  const [salePriceText, setSalePriceText] = useState("");
  const [sizesText, setSizesText] = useState("");
  const [colorsText, setColorsText] = useState("");
  const [rows, setRows] = useState<BulkVariantRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const batch = useBulkBatchControls(setRows, Number(product?.base_price ?? 0), isAr);

  const applyPlan = (next: VariantGenerationPlan) => {
    setPlan(next);
    setSalePriceText(
      next.selling_price > 0 && next.selling_price < Number(product?.base_price ?? 0)
        ? String(next.selling_price)
        : "",
    );
    setSizesText(next.sizes.join(", "));
    setColorsText(next.colors.join(", "));
    setRows([]);
  };

  const applyPreset = (preset: { sizes: string[] | readonly string[]; unit?: string }) => {
    setSizesText(Array.from(preset.sizes).join(", "));
    if (preset.unit !== undefined) {
      setPlan((prev) => ({
        ...prev,
        size_unit: (preset.unit || "") as VariantGenerationPlan["size_unit"],
      }));
    }
  };

  const parseWithAi = async () => {
    if (prompt.trim().length < 2)
      return toast.error(isAr ? "اكتب وصفاً للمتغيرات أولاً" : "Describe the variants first");
    setParsing(true);
    try {
      const productTitle = product?.name_ar || product?.name_en || product?.name || "";
      const result = await parseVariantPrompt({
        data: {
          prompt,
          language: isAr ? "ar" : "en",
          product_title: productTitle,
          base_sku: plan.base_sku || existingSku,
          base_price: Number(product?.base_price ?? 0),
          cost_price: Number(product?.cost_price ?? 0),
          brand_id: brand.id,
        },
      });
      applyPlan(result);
      toast.success(parsedPlanMessage(result.sizes.length || 0, result.colors.length || 0, isAr));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("RATE_LIMITED")
          ? isAr
            ? "تم استخدام المحلل السريع بدون انتظار"
            : "Quick analyzer used seamlessly"
          : isAr
            ? "تعذر فهم الطلب بالكامل. يمكنك مراجعة الحقول وإكمالها يدوياً."
            : "Could not fully parse request. You can edit the fields manually.",
      );
    } finally {
      setParsing(false);
    }
  };

  const buildPreview = () => {
    const result = buildBulkVariantRows({
      sizesText,
      colorsText,
      plan,
      basePrice: Number(product?.base_price ?? 0),
      costPrice: Number(product?.cost_price ?? 0),
      salePriceText,
      existingBarcodes: variants.map((v) => v.barcode).filter(Boolean) as string[],
    });
    if (result.kind === "error") {
      return toast.error(
        result.reason === "too-many"
          ? isAr
            ? "الحد الأقصى 100 متغير في المرة الواحدة"
            : "Maximum 100 variants per batch"
          : result.reason === "missing-base-sku"
            ? isAr
              ? "أدخل رمز المنتج الأساسي"
              : "Enter a base SKU"
            : isAr
              ? "لا يمكن أن يكون سعر التخفيض أعلى من السعر الأساسي."
              : "Sale price cannot be higher than the regular price.",
      );
    }
    setRows(result.rows);
  };

  const patchRow = (index: number, patch: Partial<BulkVariantRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saveAll = async () => {
    const invalid = hasInvalidBulkRows(rows, variants, Number(product?.base_price ?? 0));
    if (!rows.length || invalid)
      return toast.error(
        isAr
          ? "راجع الرموز والأسعار والمخزون؛ توجد قيمة ناقصة أو مكررة"
          : "Review SKUs, barcodes, prices, and stock; a value is missing or duplicated",
      );
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("AUTH_REQUIRED");
      await createVariants(
        brand.id,
        rows.map((row) => ({
          user_id: user.id,
          brand_id: brand.id,
          product_id: productId,
          size: row.size || null,
          size_unit: row.size_unit || null,
          color: row.color || null,
          fabric: row.fabric || null,
          sku: row.sku.trim(),
          barcode: row.barcode.trim(),
          cost_price: Number(product?.cost_price ?? 0),
          ...bulkRowPricing(row.sale_price, Number(product?.base_price ?? 0)),
          stock_main: row.stock_main,
          stock_incubator: row.stock_incubator,
          stock: Number(row.stock_main || 0) + Number(row.stock_incubator || 0),
        })),
      );
      const batchTerms = rows.flatMap((r) => [r.color, r.fabric]);
      prefetchOptionTranslations(batchTerms, isAr);
      let activationFailed = false;
      if (variants.length === 0) {
        activationFailed = await updateProduct(brand.id, productId, { is_active: true }).then(
          () => false,
          () => true,
        );
      }
      if (activationFailed) {
        toast.error(
          isAr
            ? "تمت إضافة المتغيرات، لكن تعذر تفعيل المنتج تلقائياً."
            : "Variants added, but the product could not be activated automatically.",
        );
      } else {
        toast.success(
          variants.length === 0
            ? isAr
              ? `تمت إضافة ${rows.length} متغير وتفعيل المنتج تلقائياً.`
              : `${rows.length} variants added and the product was activated automatically.`
            : isAr
              ? `تمت إضافة ${rows.length} متغير`
              : `${rows.length} variants added`,
        );
      }
      setOpen(false);
      setRows([]);
      setPrompt("");
      setPlan(blank);
      setSalePriceText("");
      setSizesText("");
      setColorsText("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isAr ? "فشل الحفظ" : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setPlan({
            ...blank,
            base_sku: existingSku,
            cost_price: Number(product?.cost_price ?? 0),
            selling_price: Number(product?.base_price ?? 0),
          });
          setSalePriceText("");
          setSizesText("");
          setColorsText("");
          setRows([]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wand2 className="me-2 h-4 w-4" />
          {isAr ? "إنشاء متغيرات متعددة" : "Bulk / AI variants"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAr ? "منشئ متغيرات المنتج الذكي" : "Smart Product Variant Builder"}
          </DialogTitle>
        </DialogHeader>

        {/* AI & NLP PROMPT BOX */}
        <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold">
              {isAr
                ? "صف المتغيرات بالعربية أو الإنجليزية (الذكاء الاصطناعي)"
                : "Describe variants in English or Arabic (AI Parser)"}
            </Label>
            <span className="text-xs text-muted-foreground">
              {isAr
                ? "يدعم المقاسات، الملابس، الألوان، الأسعار، والمخزون"
                : "Supports Sizes, Colors, Prices & Stock"}
            </span>
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={aiPromptPlaceholder}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button type="button" onClick={parseWithAi} disabled={parsing}>
              {parsing ? (
                <>
                  <Wand2 className="me-2 h-4 w-4 animate-spin" />
                  {isAr ? "جاري التحليل..." : "Parsing..."}
                </>
              ) : (
                <>
                  <Wand2 className="me-2 h-4 w-4" />
                  {isAr ? "تحليل فوري بالذكاء الاصطناعي" : "Instant AI / NLP Parse"}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الذكاء الاصطناعي يعبئ الحقول للمراجعة. لن يتم حفظ شيء قبل المعاينة والتأكيد."
                : "AI fills fields for review. Nothing is saved until you preview and confirm."}
            </p>
          </div>
        </div>

        {/* QUICK SIZING PRESET PILLS */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {isAr ? "قوالب مقاسات وخيارات جاهزة بنقرة واحدة:" : "1-Click Sizing Quick Presets:"}
          </Label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {orderedPresets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 bg-background hover:bg-secondary"
                onClick={() => applyPreset(preset)}
              >
                {isAr ? preset.labelAr : preset.labelEn}
              </Button>
            ))}
          </div>
        </div>

        {/* STRUCTURED VARIANT PLAN FIELDS */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>{isAr ? "رمز المنتج الأساسي" : "Base SKU"}</Label>
            <Input
              value={plan.base_sku}
              onChange={(e) => setPlan({ ...plan, base_sku: e.target.value })}
              placeholder={existingSku || "e.g. DRS-01"}
            />
          </div>
          <div>
            <Label>
              {sizeAxis.label} {isAr ? "(بفاصلة)" : "(comma separated)"}
            </Label>
            <Input
              value={sizesText}
              onChange={(e) => setSizesText(e.target.value)}
              placeholder={sizePlaceholder}
            />
          </div>
          {colorAxis.visible && (
            <div>
              <Label>
                {colorAxis.label} {isAr ? "(بفاصلة)" : "(comma separated)"}
              </Label>
              <Input
                value={colorsText}
                onChange={(e) => setColorsText(e.target.value)}
                placeholder={colorPlaceholder}
              />
            </div>
          )}
          {resolveVariantAxis({
            axis: "fabric",
            product,
            addonDefaults: addonAxisDefaults,
            lang: isAr ? "ar" : "en",
          }).visible && (
            <div>
              <Label>{isAr ? "الخامة" : "Fabric"}</Label>
              <Input
                value={plan.fabric}
                onChange={(e) => setPlan({ ...plan, fabric: e.target.value })}
                placeholder={isAr ? "كريب ملكي / حرير" : "Silk / Linen / Crepe"}
              />
            </div>
          )}
          <div>
            <Label>{isAr ? "وحدة المقاس" : "Size unit"}</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              value={plan.size_unit}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  size_unit: e.target.value as VariantGenerationPlan["size_unit"],
                })
              }
            >
              {SIZE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {isAr
                    ? SIZE_UNIT_LABELS[unit]?.ar || unit
                    : SIZE_UNIT_LABELS[unit]?.en || unit || "—"}
                </option>
              ))}
            </select>
          </div>
          {canViewFinancials && (
            <div>
              <Label>{isAr ? "التكلفة الموروثة" : "Inherited cost"}</Label>
              <Input
                className="bg-muted/50 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                type="number"
                min="0"
                step="0.01"
                value={Number(product?.cost_price ?? 0)}
                disabled
              />
            </div>
          )}
          <div>
            <Label>{isAr ? "السعر اللي يدفعه العميل" : "Customer Price"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              max={Math.max(0, Number(product?.base_price ?? 0))}
              placeholder={
                isAr
                  ? `الأساسي ${Number(product?.base_price ?? 0)}`
                  : `Regular ${Number(product?.base_price ?? 0)}`
              }
              value={salePriceText}
              onChange={(e) => setSalePriceText(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "السعر الفعلي للبيع. اتركه مطابقاً للأساسي أو فارغاً إذا لم يكن هناك تخفيض."
                : "The price customers actually pay. Leave blank if matching regular price."}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label>{isAr ? "مخزون المحل" : "Store stock"}</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-center text-xs">
                    {isAr
                      ? "القطع المتوفرة فعلياً داخل متجرك والجاهزة للبيع المباشر والشحن."
                      : "Physical stock in your primary store, ready for instant sale and shipping."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="number"
              min="0"
              value={plan.stock_main}
              onChange={(e) => setPlan({ ...plan, stock_main: Number(e.target.value) })}
            />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Label>{isAr ? "مخزون الحاضنة" : "Incubator stock"}</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-center text-xs">
                    {isAr
                      ? "القطع المعروضة في محلات خارجية أو حاضنات شريكة."
                      : "Items held at partner boutiques or business incubators."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="number"
              min="0"
              value={plan.stock_incubator}
              onChange={(e) => setPlan({ ...plan, stock_incubator: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={buildPreview}>
            <Boxes className="me-2 h-4 w-4" />
            {isAr ? "إنشاء المعاينة وتوليد الباركود" : "Build Preview & Barcodes"}
          </Button>
          {rows.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setRows([])}
            >
              <RefreshCw className="me-2 h-4 w-4" />
              {isAr ? "إعادة تعيين" : "Reset"}
            </Button>
          )}
        </div>

        {/* PREVIEW TABLE WITH BATCH POWER TOOLS */}
        {rows.length > 0 && (
          <BulkVariantPreview
            rows={rows}
            onPatchRow={patchRow}
            onRemoveRow={(index) => setRows((current) => current.filter((_, i) => i !== index))}
            batch={batch}
            axisLabels={{ size: sizeAxis.label, color: colorAxis.label, fabric: fabricAxis.label }}
            basePricePlaceholder={String(product?.base_price ?? 0)}
            canViewFinancials={canViewFinancials}
            isAr={isAr}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={saveAll} disabled={!rows.length || saving}>
            {saving
              ? isAr
                ? "جاري الحفظ..."
                : "Saving..."
              : isAr
                ? `حفظ ${rows.length} متغير`
                : `Save ${rows.length} variants`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
