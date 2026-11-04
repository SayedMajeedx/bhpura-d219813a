import { useId } from "react";
import { FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { useStorefront } from "@/lib/storefront-context";
import type { useVocabulary } from "@/hooks/use-vocabulary";

/**
 * What the shopper writes for the workshop (full lining, a longer sleeve…), shown with every piece
 * being made for them. It sat inside the product's extra fields, so a store whose tailoring fields
 * are all measurements (taken by the fit passport) never showed it: Pura's report of 2026-11-04.
 * Kept as typed, spaces and new lines included; the cart line keeps it as the shopper wrote it.
 */
export function TailoringNotesField({
  value,
  onChange,
  lang,
  t,
  vocabulary,
}: {
  value: string;
  onChange: (value: string) => void;
  lang: ReturnType<typeof useStorefront>["lang"];
  t: ReturnType<typeof useStorefront>["t"];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  const id = useId();
  const hint = vocabulary.workshop_notes_placeholder?.[lang];
  return (
    <div className="mb-6 space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-bold text-foreground">
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {vocabulary.workshop_notes_label?.[lang]?.replace(/[:：]\s*$/, "") ||
            t("ملاحظات للتفصيل (اختياري)", "Notes for the workshop (optional)")}
        </span>
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "تفاصيل للمشغل إن وُجدت: البطانة، طول الكم، القصّة...",
          "Anything the workshop should know: the lining, the sleeve length, the cut...",
        )}
      </p>
      <Textarea
        id={id}
        rows={3}
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          hint || t("مثال: بطانة كاملة، الكم أطول 2 سم", "e.g. Full lining, sleeves 2 cm longer")
        }
        className="resize-none rounded-xl border border-input bg-background text-base leading-relaxed shadow-2xs focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
      />
    </div>
  );
}
