import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SheetLang } from "@/features/orders/lib/job-sheet";
import { SheetLanguageChoice } from "./SheetLanguageChoice";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";

/**
 * Printing a job sheet: in Arabic, English or both, chosen each time. It opens on the supplier's
 * language when the piece is with a supplier who chose one, else the screen's
 * (`sheetLanguageFor`).
 */
export function JobSheetPrintDialog({
  open,
  onOpenChange,
  defaultLang,
  onPrint,
  lang,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLang: SheetLang;
  onPrint: (sheetLang: SheetLang) => void;
  lang: "ar" | "en";
  title?: string;
}) {
  const isAr = lang === "ar";
  const [chosen, setChosen] = useState<SheetLang>(defaultLang);
  // Each opening starts on the default: the supplier's language may have been read since.
  useEffect(() => {
    if (open) setChosen(defaultLang);
  }, [open, defaultLang]);

  const print = () => {
    onPrint(chosen);
    onOpenChange(false);
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      kind="form"
      size="sm"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        title={<>{title ?? (isAr ? "طباعة أمر التشغيل" : "Print job sheet")}</>}
        description={
          <>
            {isAr
              ? "بأي لغة يقرأ الخيّاط الورقة؟ «الاثنتان معاً» تطبع العربية والإنجليزية جنباً إلى جنب."
              : "Which language does the tailor read? “Both” prints Arabic and English side by side."}
          </>
        }
      />

      <AppDialogBody>
        <SheetLanguageChoice
          value={chosen}
          onChange={setChosen}
          lang={lang}
          label={isAr ? "لغة الورقة" : "Sheet language"}
        />
      </AppDialogBody>
      <AppDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        <Button type="button" onClick={print} className="gap-1.5">
          <Printer className="h-4 w-4" aria-hidden="true" />
          {isAr ? "طباعة" : "Print"}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
