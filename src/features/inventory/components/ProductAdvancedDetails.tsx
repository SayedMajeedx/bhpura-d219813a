import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ChevronDown, Sliders } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { resolveVariantAxis } from "@/lib/addons/addon-registry";
import type { Product } from "@/features/inventory/types";

import type { Dispatch, SetStateAction } from "react";
import type { ProductForm } from "@/features/inventory/lib/product-form";
import type { ProductDialogData } from "@/features/inventory/hooks/use-product-dialog-data";

/** Collapsible advanced details: fabric and occasion, badges, size guide and option-axis labels. */
export function ProductAdvancedDetails({
  isAr,
  product,
  storeProfile,
  addonAxisDefaults,
  sizeGuidesQ,
  form,
  setForm,
  advancedOpen,
  setAdvancedOpen,
  showExtraAxes,
  setShowExtraAxes,
}: {
  isAr: boolean;
  product: Product | null;
  storeProfile: ProductDialogData["storeProfile"];
  addonAxisDefaults: ProductDialogData["addonAxisDefaults"];
  sizeGuidesQ: ProductDialogData["sizeGuidesQ"];
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  advancedOpen: boolean;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  showExtraAxes: boolean;
  setShowExtraAxes: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="rounded-xl border border-border-strong bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setAdvancedOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-foreground bg-secondary/15 hover:bg-secondary/25 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <span>
            {isAr
              ? "خيارات ومواصفات إضافية (الأقمشة، المناسبات، المسميات والشارات)"
              : "Advanced Options & Details (Fabrics, Occasions, Labels & Badges)"}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            advancedOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {advancedOpen && (
        <div className="p-4 space-y-4 border-t border-border-subtle animate-in fade-in duration-150">
          {/* Fabric & Occasion */}
          {resolveVariantAxis({
            axis: "fabric",
            product,
            addonDefaults: addonAxisDefaults,
            lang: isAr ? "ar" : "en",
          }).visible && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground">
                  {isAr ? "نوع القماش" : "Fabric Type"}
                </Label>
                <Input
                  className="mt-1 h-9.5 rounded-lg text-xs"
                  placeholder={
                    isAr ? "مثال: كريب ملكي، لينن، حرير..." : "e.g., Royal Crepe, Linen..."
                  }
                  value={form.fabric_type}
                  onChange={(e) => setForm({ ...form, fabric_type: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">
                  {isAr ? "مناسبة لـ" : "Suitable for"}
                </Label>
                <div className="mt-1">
                  <select
                    className="w-full h-9.5 rounded-lg border border-input bg-background px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
                    value={form.occasion}
                    onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                  >
                    <option value="">{isAr ? "اختر المناسبة..." : "Select occasion..."}</option>
                    <option value="يومي">{isAr ? "يومي" : "Daily"}</option>
                    <option value="سهرة">{isAr ? "سهرة" : "Evening"}</option>
                    <option value="مناسبات">{isAr ? "مناسبات" : "Occasions"}</option>
                    <option value="إطلالة رسمية">{isAr ? "إطلالة رسمية" : "Formal"}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Feature & Sale Switches */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border-subtle p-3 bg-secondary/10">
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "إبراز في الرائج الآن" : "Feature in Trending now"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "أولوية في العرض للعملاء" : "Prioritizes this product for discovery"}
                </p>
              </div>
              <Switch
                checked={form.featured_trending}
                onCheckedChange={(v) => setForm({ ...form, featured_trending: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle p-3 bg-secondary/10">
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "إظهار شارة التنزيلات" : "Show Sale badge"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr ? "تظهر عند وجود سعر أصلي أعلى" : "Shown when an original price is higher"}
                </p>
              </div>
              <Switch
                checked={form.show_sale_badge}
                onCheckedChange={(v) => setForm({ ...form, show_sale_badge: v })}
              />
            </div>
          </div>

          {/* Custom Variant Labels */}
          <div className="rounded-lg border border-border-subtle p-3.5 bg-secondary/5 space-y-3">
            <div>
              <p className="text-xs font-bold text-foreground">
                {isAr ? "🏷️ مسميات المتغيرات المخصصة" : "🏷️ Custom Variant Labels"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تخصيص أسماء أعمدة المقاس، اللون، والخامة لصفحة عرض المنتج."
                  : "Override default column labels (Size, Color, Fabric) for the storefront."}
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">
                    {isAr ? "مسمى المقاس بالعربية" : "Custom Size Label — Arabic"}
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-md text-xs"
                    placeholder={
                      addonAxisDefaults?.size === null
                        ? isAr
                          ? "معطّل افتراضياً (اكتب لتفعيله)"
                          : "Disabled by default (type to enable)"
                        : addonAxisDefaults?.size?.ar || (isAr ? "المقاس / خيار" : "Size / Option")
                    }
                    value={form.variant_label_size_ar || ""}
                    onChange={(e) => setForm({ ...form, variant_label_size_ar: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">
                    {isAr ? "مسمى المقاس بالإنجليزية" : "Custom Size Label — English"}
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-md text-xs"
                    placeholder={
                      addonAxisDefaults?.size === null
                        ? "Disabled by default (type to enable)"
                        : addonAxisDefaults?.size?.en || "Size / Option"
                    }
                    value={form.variant_label_size_en || ""}
                    onChange={(e) => setForm({ ...form, variant_label_size_en: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">
                    {isAr ? "مسمى اللون بالعربية" : "Custom Color Label — Arabic"}
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-md text-xs"
                    placeholder={
                      addonAxisDefaults?.color === null
                        ? isAr
                          ? "معطّل افتراضياً (اكتب لتفعيله)"
                          : "Disabled by default (type to enable)"
                        : addonAxisDefaults?.color?.ar || (isAr ? "اللون" : "Color")
                    }
                    value={form.variant_label_color_ar || ""}
                    onChange={(e) => setForm({ ...form, variant_label_color_ar: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">
                    {isAr ? "مسمى اللون بالإنجليزية" : "Custom Color Label — English"}
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-md text-xs"
                    placeholder={
                      addonAxisDefaults?.color === null
                        ? "Disabled by default (type to enable)"
                        : addonAxisDefaults?.color?.en || "Color"
                    }
                    value={form.variant_label_color_en || ""}
                    onChange={(e) => setForm({ ...form, variant_label_color_en: e.target.value })}
                  />
                </div>
              </div>

              {/* Axis 3: Fabric / Packaging / Custom */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">
                    {isAr
                      ? "مسمى الخاصية 3 بالعربية (الخامة / نوع التغليف)"
                      : "Axis 3 Label — Arabic (Fabric / Packaging)"}
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-md text-xs"
                    placeholder={
                      addonAxisDefaults?.fabric?.ar ||
                      (isAr ? "الخامة أو نوع التغليف" : "Fabric or Packaging")
                    }
                    value={form.variant_label_fabric_ar || ""}
                    onChange={(e) => setForm({ ...form, variant_label_fabric_ar: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-muted-foreground">
                    {isAr ? "مسمى الخاصية 3 بالإنجليزية" : "Axis 3 Label — English"}
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-md text-xs"
                    placeholder={addonAxisDefaults?.fabric?.en || "Fabric or Packaging"}
                    value={form.variant_label_fabric_en || ""}
                    onChange={(e) => setForm({ ...form, variant_label_fabric_en: e.target.value })}
                  />
                </div>
              </div>

              {/* Axis 4 & Axis 5 */}
              {showExtraAxes || form.variant_label_four_ar || form.variant_label_five_ar ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-b border-border-subtle pb-2.5">
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">
                        {isAr
                          ? "مسمى الخاصية 4 بالعربية (مثال: الحشوة / درجة التحميص)"
                          : "Axis 4 Label — Arabic (e.g. Filling / Roast)"}
                      </Label>
                      <Input
                        className="mt-1 h-8 rounded-md text-xs"
                        placeholder={isAr ? "الحشوة أو درجة التحميص" : "Filling or Roast"}
                        value={form.variant_label_four_ar || ""}
                        onChange={(e) =>
                          setForm({ ...form, variant_label_four_ar: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">
                        {isAr ? "مسمى الخاصية 4 بالإنجليزية" : "Axis 4 Label — English"}
                      </Label>
                      <Input
                        className="mt-1 h-8 rounded-md text-xs"
                        placeholder="Filling or Roast"
                        value={form.variant_label_four_en || ""}
                        onChange={(e) =>
                          setForm({ ...form, variant_label_four_en: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pb-1">
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">
                        {isAr
                          ? "مسمى الخاصية 5 بالعربية (مثال: الإضافات / المرفقات)"
                          : "Axis 5 Label — Arabic (e.g. Add-ons)"}
                      </Label>
                      <Input
                        className="mt-1 h-8 rounded-md text-xs"
                        placeholder={isAr ? "الإضافات أو المرفقات" : "Add-ons or Options"}
                        value={form.variant_label_five_ar || ""}
                        onChange={(e) =>
                          setForm({ ...form, variant_label_five_ar: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground">
                        {isAr ? "مسمى الخاصية 5 بالإنجليزية" : "Axis 5 Label — English"}
                      </Label>
                      <Input
                        className="mt-1 h-8 rounded-md text-xs"
                        placeholder="Add-ons or Options"
                        value={form.variant_label_five_en || ""}
                        onChange={(e) =>
                          setForm({ ...form, variant_label_five_en: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-primary font-bold hover:bg-primary/5 gap-1.5"
                    onClick={() => setShowExtraAxes(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>
                      {isAr
                        ? "+ إضافة خاصية إضافية (المحور 4 و 5)"
                        : "+ Add Extra Attributes (Axis 4 & 5)"}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {storeProfile?.modules?.size_guide && (
            <div className="rounded-lg border border-border-subtle p-3.5 bg-secondary/5 space-y-3">
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "📏 دليل المقاسات لهذا المنتج" : "📏 Product Size Guide"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "حدد دليل مقاسات خاص بهذا المنتج، أو اتركه يتبع القسم / الافتراضي للمتجر."
                    : "Assign a dedicated size guide or inherit from category / store default."}
                </p>
              </div>
              <div>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.size_guide_hidden ? "__hidden__" : form.size_guide_id || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__hidden__") {
                      setForm({ ...form, size_guide_hidden: true, size_guide_id: null });
                    } else if (val === "") {
                      setForm({ ...form, size_guide_hidden: false, size_guide_id: null });
                    } else {
                      setForm({ ...form, size_guide_hidden: false, size_guide_id: val });
                    }
                  }}
                >
                  <option value="">
                    {isAr
                      ? "تلقائي (يتبع تصنيف المنتج أو الافتراضي للمتجر)"
                      : "Automatic (Inherit from category or store default)"}
                  </option>
                  <option value="__hidden__">
                    {isAr
                      ? "🚫 إخفاء دليل المقاسات لهذا المنتج"
                      : "🚫 Hide size guide for this product"}
                  </option>
                  {(sizeGuidesQ.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {isAr ? g.name_ar : g.name_en}{" "}
                      {g.is_default ? (isAr ? "(الافتراضي)" : "(Default)") : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
