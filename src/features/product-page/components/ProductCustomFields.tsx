import { useStorefront, useStoreModules } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Loader2, Scissors, FileText } from "lucide-react";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { toast } from "sonner";
import { uploadPublicMedia } from "@/lib/r2-upload";
import type { Dispatch, SetStateAction } from "react";

import type { CustomField } from "@/features/product-page/types";
/** Customer fields for custom sizing: measurements, choices, uploads and workshop notes. */
export function ProductCustomFields({
  brand,
  cfLabel,
  cfValues,
  lang,
  modules,
  setCfValues,
  setErrorMsg,
  setTailoringNotes,
  setUploadingField,
  showSizeModeToggle,
  sizeMode,
  t,
  tailoringNotes,
  uploadingField,
  visibleCustomFields,
  vocabulary,
}: {
  brand: ReturnType<typeof useStorefront>["brand"];
  cfLabel: (f: CustomField) => string;
  cfValues: Record<string, string>;
  lang: ReturnType<typeof useStorefront>["lang"];
  modules: ReturnType<typeof useStoreModules>;
  setCfValues: Dispatch<SetStateAction<Record<string, string>>>;
  setErrorMsg: Dispatch<SetStateAction<string | null>>;
  setTailoringNotes: Dispatch<SetStateAction<string>>;
  setUploadingField: Dispatch<SetStateAction<Record<string, boolean>>>;
  showSizeModeToggle: boolean;
  sizeMode: "ready" | "custom";
  t: ReturnType<typeof useStorefront>["t"];
  tailoringNotes: string;
  uploadingField: Record<string, boolean>;
  visibleCustomFields: CustomField[];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  return (
    <div className="mb-6 space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      {showSizeModeToggle && sizeMode === "custom" && (
        <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs font-medium text-primary flex items-center gap-2 mb-2">
          <Scissors className="h-4 w-4 shrink-0" />
          <span>
            {vocabulary.customization_options?.[lang] ||
              t(
                "يرجى إدخال تفاصيل وخيارات الطلب أدناه:",
                "Please enter your custom details and options below:",
              )}
          </span>
        </div>
      )}
      {visibleCustomFields.map((f) => {
        const label = cfLabel(f);
        const val = cfValues[f.key] ?? "";
        const set = (v: string) => {
          setCfValues((s) => ({ ...s, [f.key]: v }));
          setErrorMsg(null);
        };
        const isUploading = uploadingField[f.key];

        const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            setUploadingField((prev) => ({ ...prev, [f.key]: true }));
            const url = await uploadPublicMedia(brand.id, file, "product");
            set(url);
            toast.success(t("تم رفع الملف بنجاح", "File uploaded successfully"));
          } catch (err: any) {
            toast.error(err.message ?? t("فشل في رفع الملف", "File upload failed"));
          } finally {
            setUploadingField((prev) => ({ ...prev, [f.key]: false }));
          }
        };

        return (
          <div key={f.key} className="space-y-1">
            <label className="block text-sm font-semibold mb-1">
              {label}
              {f.required && <span className="text-destructive ms-1">*</span>}
            </label>
            {f.type === "select" ? (
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                className="w-full h-11 rounded-md border border-input bg-background px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{t("اختر...", "Select...")}</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "file" ? (
              <div className="space-y-2">
                {val ? (
                  <div className="flex items-center justify-between p-3 border rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(val) ? (
                        <img src={val} alt="" className="h-12 w-12 rounded object-cover border" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-primary/10 grid place-items-center text-primary text-xs font-bold uppercase">
                          FILE
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground truncate">
                          {t("الملف المرفوع", "Uploaded file")}
                        </div>
                        <a
                          href={val}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary font-medium hover:underline truncate block"
                        >
                          {val}
                        </a>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => set("")}
                      aria-label={t("إزالة", "Remove")}
                      title={t("إزالة", "Remove")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      id={`file-input-${f.key}`}
                      disabled={isUploading}
                    />
                    <label
                      htmlFor={`file-input-${f.key}`}
                      className={`flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-dashed border-muted-foreground/30 px-4 py-3 text-sm font-medium transition hover:bg-muted/40 ${
                        isUploading ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {t("جاري الرفع...", "Uploading...")}
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {t(
                              "انقر لرفع الشعار أو الملف الخاص بك",
                              "Click to upload your logo or file",
                            )}
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>
            ) : (
              <Input
                type={f.type === "number" ? "number" : "text"}
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder={(() => {
                  if (lang === "ar") {
                    if ((f as any).placeholder_ar) return (f as any).placeholder_ar;
                    if ((f as any).placeholder) return (f as any).placeholder;
                  } else {
                    if ((f as any).placeholder_en) return (f as any).placeholder_en;
                    if ((f as any).placeholder) return (f as any).placeholder;
                  }
                  const lStr = (
                    (lang === "ar" ? f.label_ar || f.label_en : f.label_en || f.label_ar) ||
                    f.key ||
                    ""
                  ).toLowerCase();
                  if (lStr.includes("length") || lStr.includes("طول")) {
                    return lang === "ar" ? "مثال: 56 (بالإنش)" : "e.g. 56 (in inches)";
                  }
                  if (lStr.includes("bust") || lStr.includes("صدر")) {
                    return lang === "ar" ? "مثال: 22 (بالإنش)" : "e.g. 22 (in inches)";
                  }
                  if (lStr.includes("sleeve") || lStr.includes("كم")) {
                    return lang === "ar" ? "مثال: 28 (بالإنش)" : "e.g. 28 (in inches)";
                  }
                  if (lStr.includes("shoulder") || lStr.includes("كتف")) {
                    return lang === "ar" ? "مثال: 15 (بالإنش)" : "e.g. 15 (in inches)";
                  }
                  if (/waist|hips|height|size|measurement|خصر|ورك|قياس|مقاس/.test(lStr)) {
                    return lang === "ar"
                      ? "أدخل القياس بالإنش (مثال: 56)"
                      : "Enter measurement in inches (e.g. 56)";
                  }
                  return lang === "ar"
                    ? "أدخل التفاصيل المطلوبة..."
                    : "Type required details here...";
                })()}
                className="w-full h-11 rounded-xl shadow-2xs"
              />
            )}
          </div>
        );
      })}

      {/* 📝 Customer Tailoring & Workshop Notes Box */}
      {modules.made_to_order && (
        <div className="space-y-2 pt-3 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span>
                {vocabulary.workshop_notes_label?.[lang] ||
                  t("ملاحظات وتفاصيل التجهيز (اختياري)", "Production & Workshop Notes (Optional)")}
              </span>
            </label>
            <span className="text-xs text-muted-foreground font-normal">
              {vocabulary.workshop_instructions?.[lang] || t("تعليمات للورشة", "Workshop notes")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {vocabulary.workshop_notes_placeholder?.[lang]
              ? `${t("ملاحظات خاصة:", "Special instructions:")} ${vocabulary.workshop_notes_placeholder[lang]}`
              : t(
                  "اكتب هنا أي تفاصيل خاصة للتجهيز ترغب بإبلاغ الورشة بها",
                  "Add any specific production instructions for the workshop",
                )}
          </p>
          <Textarea
            rows={3}
            value={tailoringNotes}
            onChange={(e) => setTailoringNotes(e.target.value)}
            placeholder={
              vocabulary.workshop_notes_placeholder?.[lang] ||
              (lang === "ar"
                ? "أدخل الملاحظات والتعليمات الخاصة هنا..."
                : "Type any special requests or notes here...")
            }
            className="text-xs bg-background resize-none leading-relaxed rounded-xl border border-input shadow-2xs focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  );
}
