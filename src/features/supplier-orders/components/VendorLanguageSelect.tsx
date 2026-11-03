import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateVendors, setVendorLanguage } from "@/lib/data/accounting";
import { isSheetLang, type SheetLang } from "@/features/orders/lib/job-sheet";
import { sheetLangName } from "@/features/orders/components/SheetLanguageChoice";

/**
 * The language a supplier's job sheets and WhatsApp messages open on, changed in place on the
 * suppliers list (saved at once). "Not chosen" keeps the screen's language, as before.
 */
export function VendorLanguageSelect({
  brandId,
  vendorId,
  value,
  lang,
}: {
  brandId: string;
  vendorId: string;
  value: string | null | undefined;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const id = useId();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const current = isSheetLang(value) ? value : "";

  const change = async (next: string) => {
    setSaving(true);
    try {
      await setVendorLanguage(brandId, vendorId, isSheetLang(next) ? next : null);
      await invalidateVendors(qc, brandId);
    } catch {
      toast.error(
        isAr ? "تعذر حفظ اللغة، حاول مرة أخرى." : "Could not save the language. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {isAr ? "أوامر التشغيل والرسائل بـ" : "Job sheets and messages in"}
      </label>
      <select
        id={id}
        value={current}
        disabled={saving}
        onChange={(e) => void change(e.target.value)}
        className="h-8 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-xs pointer-coarse:h-11"
      >
        <option value="">{isAr ? "لغة الشاشة" : "The screen's language"}</option>
        {(["ar", "en", "both"] as SheetLang[]).map((option) => (
          <option key={option} value={option}>
            {sheetLangName(option, lang)}
          </option>
        ))}
      </select>
    </div>
  );
}
