import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { BilingualField } from "@/components/bilingual-field";

import type { Product } from "@/features/inventory/types";

import { type ProductFormErrors } from "@/features/inventory/lib/product-form";
import type { Dispatch, SetStateAction } from "react";
import type { ProductForm } from "@/features/inventory/lib/product-form";
import type { ProductDialogData } from "@/features/inventory/hooks/use-product-dialog-data";

import { ProductAdvancedDetails } from "@/features/inventory/components/ProductAdvancedDetails";
/** First step of the product editor: names, descriptions, category, price, cost and stock. */
export function ProductBasicTab({
  t,
  isAr,
  product,
  storeProfile,
  addonAxisDefaults,
  categoriesQ,
  sizeGuidesQ,
  form,
  setForm,
  errors,
  setErrors,
  advancedOpen,
  setAdvancedOpen,
  showExtraAxes,
  setShowExtraAxes,
}: {
  t: ReturnType<typeof useT>;
  isAr: boolean;
  product: Product | null;
  storeProfile: ProductDialogData["storeProfile"];
  addonAxisDefaults: ProductDialogData["addonAxisDefaults"];
  categoriesQ: ProductDialogData["categoriesQ"];
  sizeGuidesQ: ProductDialogData["sizeGuidesQ"];
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  errors: ProductFormErrors;
  setErrors: Dispatch<SetStateAction<ProductFormErrors>>;
  advancedOpen: boolean;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  showExtraAxes: boolean;
  setShowExtraAxes: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <BilingualField
        labelAr="اسم المنتج — عربي"
        labelEn="Product name — English"
        valueAr={form.name_ar}
        valueEn={form.name_en}
        onChangeAr={(v) => {
          setForm({ ...form, name_ar: v });
          if (v.trim() || form.name_en.trim()) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        onChangeEn={(v) => {
          setForm({ ...form, name_en: v });
          if (v.trim() || form.name_ar.trim()) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
      />
      {errors.name && (
        <p className="text-xs text-destructive font-semibold mt-1" role="alert">
          {errors.name}
        </p>
      )}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs font-bold text-muted-foreground">
            {t("inventory.category")}
          </Label>
          {form.category ? (
            <button
              type="button"
              onClick={() => setForm({ ...form, category: "" })}
              className="text-xs text-destructive hover:underline font-medium"
            >
              {isAr ? "إلغاء تعيين القسم (بدون قسم)" : "Clear category (No category)"}
            </button>
          ) : null}
        </div>
        <div>
          {(categoriesQ.data ?? []).length > 0 ? (
            <select
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
              value={(() => {
                if (!form.category) return "";
                const match = (categoriesQ.data ?? []).find(
                  (c) =>
                    c.slug?.toLowerCase() === form.category.toLowerCase() ||
                    c.name_en?.toLowerCase() === form.category.toLowerCase() ||
                    c.name_ar?.toLowerCase() === form.category.toLowerCase() ||
                    c.id === form.category,
                );
                return match ? match.slug || match.name_en || "" : form.category;
              })()}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">{isAr ? "بدون قسم" : "No category"}</option>
              {(categoriesQ.data ?? []).map((c) => {
                const val = c.slug || c.name_en || "";
                const label = isAr ? c.name_ar || c.name_en : c.name_en;
                return (
                  <option key={c.id} value={val}>
                    {label}
                  </option>
                );
              })}
              {form.category &&
                !(categoriesQ.data ?? []).some(
                  (c) =>
                    c.slug?.toLowerCase() === form.category.toLowerCase() ||
                    c.name_en?.toLowerCase() === form.category.toLowerCase() ||
                    c.name_ar?.toLowerCase() === form.category.toLowerCase() ||
                    c.id === form.category,
                ) && (
                  <option value={form.category}>
                    {form.category} ({isAr ? "قسم حالي غير مسجل" : "Current unlisted category"})
                  </option>
                )}
            </select>
          ) : (
            <Input
              placeholder={t("inventory.categoryPh")}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          )}
        </div>
        {(categoriesQ.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {isAr
              ? "أنشئ أقسامًا من صفحة الأقسام لتظهر هنا كقائمة منسدلة."
              : "Create categories in the Categories page to get a dropdown here."}
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs font-bold text-muted-foreground">
          {isAr ? "السعر الأساسي للمنتج (د.ب)" : "Base Price (BHD)"}
        </Label>
        <Input
          type="number"
          step="0.001"
          min="0"
          className={`mt-1 h-10.5 rounded-lg ${errors.price ? "border-destructive focus-visible:ring-destructive" : ""}`}
          placeholder="0.000"
          value={form.base_price}
          onChange={(e) => {
            setForm({ ...form, base_price: e.target.value });
            const v = e.target.value.trim();
            if (v && !isNaN(Number(v)) && Number(v) >= 0) {
              setErrors((prev) => ({ ...prev, price: undefined }));
            }
          }}
        />
        {errors.price ? (
          <p className="text-xs text-destructive font-semibold mt-1" role="alert">
            {errors.price}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1.5">
            {isAr
              ? "السعر العادي للمنتج، ويُورّث تلقائياً لكل متغير جديد."
              : "The product's regular price, inherited automatically by every new variant."}
          </p>
        )}
      </div>
      <div>
        <Label className="text-xs font-bold text-muted-foreground">
          {isAr ? "تكلفة القطعة عليك (اختياري)" : "Unit Cost (Optional)"}
        </Label>
        <Input
          type="number"
          step="0.001"
          min="0"
          className={`mt-1 h-10.5 rounded-lg ${errors.cost ? "border-destructive" : ""}`}
          placeholder={isAr ? "0.000 (اختياري)" : "0.000 (optional)"}
          value={form.cost_price}
          onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
        />
        {errors.cost && <p className="mt-1 text-xs text-destructive">{errors.cost}</p>}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isAr
            ? "اتركه فاضي إذا ما تعرف الرقم الآن، تقدر تضيفه لاحقاً لحساب صافي أرباحك بدقة."
            : "Leave it empty if you don't know it now; you can add it anytime later to track net profit."}
        </p>
      </div>
      {!product && (
        <div>
          <Label className="text-xs font-bold text-muted-foreground">
            {isAr
              ? "الكمية المتوفرة بالمحل (المخزون الأولي)"
              : "In-Store Available Quantity (Initial Stock)"}
          </Label>
          <Input
            type="number"
            step="1"
            min="0"
            className="mt-1 h-10.5 rounded-lg"
            placeholder="10"
            value={form.initial_stock}
            onChange={(e) => setForm({ ...form, initial_stock: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {isAr
              ? "الكمية الجاهزة للبيع فوراً. سيتم إنشاء مقاس افتراضي تلقائياً لتتمكن من بيع المنتج مباشرة."
              : "Ready-to-sell quantity. A default standard variant is created automatically so you can start selling immediately."}
          </p>
        </div>
      )}
      <div>
        <Label className="text-xs font-bold text-muted-foreground">{t("inventory.imageUrl")}</Label>
        <Input
          className="mt-1 h-10.5 rounded-lg"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between pt-2">
        <Label className="text-xs font-bold text-muted-foreground">
          {isAr ? "الوصف والتفاصيل التسويقية" : "Product Description"}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const title = form.name_ar || form.name_en || "المنتج";
            setForm((f) => ({
              ...f,
              description_ar: `${title} الفاخر والمميز بلمسة أنيقة وجودة عالية. تصنيع بإتقان يلائم كافة المناسبات ليعكس أناقتك الفريدة.`,
              description_en: `Premium ${form.name_en || form.name_ar || "product"} crafted with exceptional quality and sophisticated design. Perfectly tailored for everyday elegance and special occasions.`,
            }));
            toast.success(
              isAr
                ? "تم تم توليد الوصف التسويقي الذكي بنجاح!"
                : "AI product description generated successfully!",
            );
          }}
          className="h-8 text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 rounded-lg"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
          {isAr ? "✨ صياغة وصف ذكي" : "✨ AI Copywriter"}
        </Button>
      </div>
      <BilingualField
        multiline
        labelAr="الوصف — عربي"
        labelEn="Description — English"
        valueAr={form.description_ar}
        valueEn={form.description_en}
        onChangeAr={(v) => setForm({ ...form, description_ar: v })}
        onChangeEn={(v) => setForm({ ...form, description_en: v })}
      />

      <div className="flex items-center justify-between rounded-xl border border-border-strong p-4 bg-secondary/10 transition hover:bg-secondary/20">
        <div>
          <p className="text-sm font-bold text-foreground">
            {isAr ? "المنتج مفعّل في المتجر" : "Active in storefront"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr ? "إظهار للعملاء في المتجر العام" : "Show to customers in the public storefront"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`text-xs font-bold ${form.is_active ? "text-emerald-700 dark:text-emerald-500" : "text-muted-foreground"}`}
          >
            {form.is_active ? (isAr ? "مفعّل" : "Active") : isAr ? "مخفي" : "Hidden"}
          </span>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            aria-label={isAr ? "إظهار المنتج في المتجر" : "Show product in storefront"}
          />
        </div>
      </div>
      {!product && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3.5 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="leading-relaxed">
            {isAr
              ? "💡 هل لديك مقاسات أو ألوان متعددة؟ سيتم نشر هذا المنتج بمقاس قياسي تلقائياً، ويمكنك إضافة وتخصيص تفاصيل المقاسات والألوان في أي وقت بعد الحفظ."
              : "💡 Have multiple sizes or colors? This product will be published with a standard size automatically; you can add and customize variants anytime after saving."}
          </span>
        </div>
      )}
      {/* Step 3 (Collapsible): Advanced Details & Specifications */}
      <ProductAdvancedDetails
        isAr={isAr}
        product={product}
        storeProfile={storeProfile}
        addonAxisDefaults={addonAxisDefaults}
        sizeGuidesQ={sizeGuidesQ}
        form={form}
        setForm={setForm}
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        showExtraAxes={showExtraAxes}
        setShowExtraAxes={setShowExtraAxes}
      />
    </div>
  );
}
