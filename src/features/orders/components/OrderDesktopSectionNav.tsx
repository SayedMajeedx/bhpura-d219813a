import { Button } from "@/components/ui/button";
import {
  Check,
  Save,
  Loader2,
  MoreHorizontal,
  UserRound,
  Package,
  CreditCard,
  FileText,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Desktop section bar: jump to overview, items, documents, invoice or activity, and the save button. */
export function OrderDesktopSectionNav({
  activeSection,
  isDirty,
  isReadOnly,
  lang,
  save,
  saving,
  scrollToSection,
}: {
  activeSection: string;
  isDirty: boolean;
  isReadOnly: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  save: () => Promise<unknown>;
  saving: boolean;
  scrollToSection: (id: string) => void;
}) {
  return (
    <div className="no-print mb-3 hidden sm:flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-strong bg-card/90 p-1.5 shadow-sm select-none sm:mb-6 sm:rounded-xl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollToSection("sec-overview")}
          className={cn(
            "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
            activeSection === "sec-overview"
              ? "bg-foreground text-background font-bold shadow-2xs"
              : "hover:bg-muted text-muted-foreground",
          )}
        >
          <UserRound className="h-3.5 w-3.5" />
          <span>{lang === "ar" ? "نظرة عامة" : "Overview"}</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection("sec-items")}
          className={cn(
            "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
            activeSection === "sec-items"
              ? "bg-foreground text-background font-bold shadow-2xs"
              : "hover:bg-muted text-muted-foreground",
          )}
        >
          <Package className="h-3.5 w-3.5" />
          <span>{lang === "ar" ? "المنتجات" : "Items"}</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection("sec-documents")}
          className={cn(
            "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
            activeSection === "sec-documents"
              ? "bg-foreground text-background font-bold shadow-2xs"
              : "hover:bg-muted text-muted-foreground",
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{lang === "ar" ? "المستندات" : "Documents"}</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection("sec-invoice")}
          className={cn(
            "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
            activeSection === "sec-invoice"
              ? "bg-foreground text-background font-bold shadow-2xs"
              : "hover:bg-muted text-muted-foreground",
          )}
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span>{lang === "ar" ? "الفاتورة" : "Invoice"}</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection("sec-activity")}
          className={cn(
            "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
            activeSection === "sec-activity"
              ? "bg-foreground text-background font-bold shadow-2xs"
              : "hover:bg-muted text-muted-foreground",
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
          <span>{lang === "ar" ? "المزيد" : "More"}</span>
        </button>
      </div>

      {/* Left Side: Dynamic Save Button & Unsaved Notation */}
      {!isReadOnly && (
        <div className="flex items-center gap-2.5 px-1 py-0.5">
          {isDirty ? (
            <>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 animate-fade-in inline">
                {lang === "ar" ? "توجد تغييرات غير محفوظة" : "Unsaved changes"}
              </span>
              <Button
                onClick={save}
                disabled={saving}
                size="sm"
                className="shadow-xs font-bold h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-500/30"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 me-1.5" />
                )}
                {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 px-2 py-1 bg-muted/40 rounded-lg">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {lang === "ar" ? "محفوظ" : "Saved"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
