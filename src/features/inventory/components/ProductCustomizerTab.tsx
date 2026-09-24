import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Sparkles, Sliders } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

import { CUSTOMIZER_PRESETS } from "@/lib/addons/addon-presets";
import type { CustomField } from "@/features/inventory/types";

import type { Dispatch, SetStateAction } from "react";
import type { ProductForm } from "@/features/inventory/lib/product-form";
import type { ProductDialogData } from "@/features/inventory/hooks/use-product-dialog-data";

/** Third step of the product editor: customer customization fields and their storefront preview. */
export function ProductCustomizerTab({
  isAr,
  customFieldPresets,
  form,
  setForm,
}: {
  isAr: boolean;
  customFieldPresets: ProductDialogData["customFieldPresets"];
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-xl border border-border p-5 bg-secondary/10 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>
                {isAr ? "⚙️ محرك تصميم وتخصيص المنتج" : "⚙️ Product Customization Engine"}
              </span>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary uppercase">
                Unlimited
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isAr
                ? "أضف حقولاً مخصصة غير محدودة لتمكين العميل من تخصيص طلبه."
                : "Configure unlimited bespoke text fields, dropdown options, and upload forms."}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Select
              onValueChange={(presetKey) => {
                const addonPreset = customFieldPresets.find((pr) => pr.key === presetKey);
                const staticPreset =
                  CUSTOMIZER_PRESETS[presetKey as keyof typeof CUSTOMIZER_PRESETS];
                const preset = addonPreset || staticPreset;
                if (preset) {
                  const isCustomPreset = Boolean(preset.fields && preset.fields.length > 0);
                  setForm({
                    ...form,
                    is_made_to_order: isCustomPreset ? true : form.is_made_to_order,
                    custom_fields: [
                      ...(form.custom_fields ?? []),
                      ...preset.fields.map(
                        (f: any, index: number) =>
                          ({
                            ...f,
                            key: `f${Date.now()}-${index}-${f.key}`,
                          }) as CustomField,
                      ),
                    ],
                  });
                  toast.success(isAr ? "تم تطبيق النموذج بنجاح" : "Preset applied successfully");
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs w-48 rounded-lg bg-background font-bold">
                <SelectValue
                  placeholder={isAr ? "⚡ نموذج مسبق سريع" : "⚡ Quick Preset Customizer"}
                />
              </SelectTrigger>
              <SelectContent>
                {customFieldPresets.map((pr) => (
                  <SelectItem key={pr.key} value={pr.key}>
                    {isAr ? pr.label.ar : pr.label.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg font-bold touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                setForm({
                  ...form,
                  custom_fields: [
                    ...(form.custom_fields ?? []),
                    {
                      key: `f${Date.now()}`,
                      label_ar: "",
                      label_en: "",
                      type: "text",
                      options: [],
                      required: false,
                    },
                  ],
                });
              }}
            >
              {isAr ? "إضافة حقل" : "Add field"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between p-3.5 bg-background rounded-lg border border-border">
          <div>
            <p className="text-xs font-bold text-foreground">
              {isAr ? "منتج حسب الطلب (لا يُخصم من المخزون)" : "Made to order (no stock deduction)"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "المنتجات المصنعة حسب الطلب لا تتطلب توفر مخزون جاهز ولا يتم خصمها من المخزون عند الشراء"
                : "Made-to-order items do not require ready physical stock and are not depleted on purchase"}
            </p>
          </div>
          <Switch
            checked={Boolean(form.is_made_to_order)}
            onCheckedChange={(checked) => setForm({ ...form, is_made_to_order: checked })}
          />
        </div>

        {Boolean(form.is_made_to_order) && (
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-xs text-muted-foreground leading-relaxed flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground block mb-0.5">
                {isAr ? "وضع تنفيذ المنتج في المتجر:" : "Storefront execution mode:"}
              </span>
              <span>
                {isAr
                  ? "إذا أضفت مقاسات جاهزة بجدول المتغيرات، سيتيح المتجر للعميل الاختيار بين (مقاس جاهز) أو (صنع حسب الطلب). أما إذا لم تضف مقاسات جاهزة، فسيتحول المنتج تلقائياً إلى (حصري حسب الطلب) بدون خيارات مقاسات عادية."
                  : "If you add ready sizes in the variants table, customers can choose between ready-to-wear and made-to-order. If no ready sizes are added, it will automatically present as Made-to-Order Only."}
              </span>
            </div>
          </div>
        )}

        {(form.custom_fields ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border-2 border-dashed border-border-strong rounded-xl bg-background/50">
            <Sliders className="h-8 w-8 opacity-40 mb-2.5 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground">
              {isAr ? "لا توجد خيارات مخصصة مفعلة" : "No custom options configured yet"}
            </span>
            <span className="text-xs opacity-75 mt-1">
              {isAr
                ? "استخدم النماذج السريعة بالأعلى لتعبئة الحقول بضغطة زر!"
                : "Use the dropdown template presets above to populate in 1-click!"}
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {(form.custom_fields ?? [])
              .map((field, index) => ({ field, index }))
              .map(({ field: f, index: i }) => {
                const upd = (patch: Partial<CustomField>) => {
                  const next = [...form.custom_fields];
                  next[i] = { ...next[i], ...patch };
                  setForm({ ...form, custom_fields: next });
                };
                const remove = () =>
                  setForm({
                    ...form,
                    custom_fields: form.custom_fields.filter((_, j) => j !== i),
                  });
                return (
                  <div
                    key={f.key}
                    className="rounded-xl border border-border p-4 bg-background space-y-3 shadow-sm transition hover:border-primary/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <Input
                        className="h-9 text-xs rounded-lg"
                        placeholder={isAr ? "التسمية بالعربية" : "Arabic label"}
                        value={f.label_ar ?? ""}
                        onChange={(e) => upd({ label_ar: e.target.value })}
                      />
                      <Input
                        className="h-9 text-xs rounded-lg"
                        placeholder={isAr ? "التسمية بالإنجليزية" : "English label"}
                        value={f.label_en ?? ""}
                        onChange={(e) => upd({ label_en: e.target.value })}
                      />
                      <Select
                        value={f.type}
                        onValueChange={(v) => upd({ type: v as CustomField["type"] })}
                      >
                        <SelectTrigger className="h-9 text-xs rounded-lg font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{isAr ? "نص" : "Text"}</SelectItem>
                          <SelectItem value="number">{isAr ? "رقم" : "Number"}</SelectItem>
                          <SelectItem value="select">
                            {isAr ? "قائمة اختيار" : "Dropdown"}
                          </SelectItem>
                          <SelectItem value="file">{isAr ? "رفع ملف" : "File upload"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {f.type === "select" && (
                      <Input
                        className="h-9 text-xs rounded-lg"
                        placeholder={
                          isAr ? "الخيارات مفصولة بفاصلة (,) أو (،)" : "Options separated by commas"
                        }
                        defaultValue={(f.options ?? []).join(", ")}
                        onChange={(e) =>
                          upd({
                            options: e.target.value
                              .split(/[,،]/)
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    )}

                    {/* Real-time storefront preview block */}
                    <div className="rounded-lg bg-muted/40 p-3 border border-dashed border-border-subtle text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                          {isAr
                            ? "👁️ معاينة فورية لصفحة المنتج"
                            : "👁️ Real-time Storefront Preview"}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-1 font-bold text-foreground/90">
                          <span>
                            {isAr
                              ? f.label_ar || f.label_en || "اسم الحقل"
                              : f.label_en || f.label_ar || "Field Name"}
                          </span>
                          {f.required && <span className="text-red-500 font-bold">*</span>}
                        </div>
                        {f.type === "text" && (
                          <Input
                            disabled
                            className="h-8.5 text-xs bg-background rounded-lg"
                            placeholder={isAr ? "كتابة نص مخصص..." : "Enter custom text..."}
                          />
                        )}
                        {f.type === "number" && (
                          <Input
                            disabled
                            type="number"
                            className="h-8.5 text-xs bg-background rounded-lg"
                            placeholder="123"
                          />
                        )}
                        {f.type === "file" && (
                          <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background text-muted-foreground">
                            <svg
                              className="h-4 w-4 opacity-60"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                              />
                            </svg>
                            <span className="text-xs font-bold">
                              {isAr
                                ? "انقر لرفع ملف مخصص (.pdf, .png, .jpg)"
                                : "Click to upload custom file (.pdf, .png, .jpg)"}
                            </span>
                          </div>
                        )}
                        {f.type === "select" && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {(f.options ?? []).length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">
                                {isAr ? "لا توجد خيارات بعد" : "No options specified yet"}
                              </span>
                            ) : (
                              (f.options ?? []).map((opt) => (
                                <div
                                  key={opt}
                                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground shadow-sm"
                                >
                                  {opt}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between border-t border-border-subtle pt-3 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Switch
                          checked={!!f.required}
                          onCheckedChange={(v) => upd({ required: v })}
                        />
                        <span className="text-muted-foreground">
                          {isAr ? "حقل إلزامي" : "Required field"}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 p-0 touch-manipulation"
                          disabled={i === 0}
                          onClick={(e) => {
                            e.preventDefault();
                            const next = [...form.custom_fields];
                            const temp = next[i];
                            next[i] = next[i - 1];
                            next[i - 1] = temp;
                            setForm({ ...form, custom_fields: next });
                          }}
                          title={isAr ? "نقل للأعلى" : "Move Up"}
                        >
                          ▲
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 p-0 touch-manipulation"
                          disabled={i === (form.custom_fields ?? []).length - 1}
                          onClick={(e) => {
                            e.preventDefault();
                            const next = [...form.custom_fields];
                            const temp = next[i];
                            next[i] = next[i + 1];
                            next[i + 1] = temp;
                            setForm({ ...form, custom_fields: next });
                          }}
                          title={isAr ? "نقل للأسفل" : "Move Down"}
                        >
                          ▼
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 text-xs rounded font-bold touch-manipulation"
                          onClick={(e) => {
                            e.preventDefault();
                            remove();
                          }}
                        >
                          {isAr ? "حذف" : "Remove"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
