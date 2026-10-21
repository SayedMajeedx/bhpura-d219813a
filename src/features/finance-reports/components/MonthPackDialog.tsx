import { useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBrand } from "@/lib/brand-context";
import { moneyFractionDigits } from "@/lib/format";
import { reportingQueries } from "@/lib/data/reporting";
import { marginRows } from "../lib/margins";
import { PACK_SHEETS, monthPackSheets, readMonthPack } from "../lib/month-pack";
import { localDay, readReceivables } from "../lib/receivables";
import { monthLabel, monthsEnding, yearEarlier } from "../lib/statement";
import { downloadWorkbook, workbookFileName } from "../lib/workbook";

/**
 * The accountant's month pack: a month chosen (the last one by default, the month a store
 * closes), its workbook built from four requests at once and downloaded.
 */
export function MonthPackDialog({
  slug,
  currency,
  lang,
}: {
  slug: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const qc = useQueryClient();
  const brand = useBrand();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const months = useMemo(() => {
    const now = new Date();
    return monthsEnding(now.getFullYear(), now.getMonth() + 1, 13, now).reverse();
  }, []);
  // The month a store closes: the last whole one.
  const [chosen, setChosen] = useState(months[1]?.key ?? months[0].key);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const build = async () => {
    const month = months.find((m) => m.key === chosen);
    if (!month) return;
    const all = monthsEnding(month.year, month.month, 2);
    const previous = all[0];
    const [lastYear] = yearEarlier([month]);
    const range = { from: month.from, to: month.to };
    const today = localDay(new Date());
    setBusy(true);
    try {
      const [periods, margins, receivables, detail] = await Promise.all([
        qc.fetchQuery(
          reportingQueries.periods(
            slug,
            [month, previous, lastYear].map((m) => ({ from: m.from, to: m.to })),
            timeZone,
            false,
          ),
        ),
        qc.fetchQuery(reportingQueries.margins(slug, range, false)),
        qc.fetchQuery(reportingQueries.receivables(slug, today, timeZone)),
        qc.fetchQuery(reportingQueries.monthPack(slug, range, timeZone)),
      ]);
      const sheets = monthPackSheets({
        month,
        previous,
        lastYear,
        periods: [periods[0] ?? [], periods[1] ?? [], periods[2] ?? []],
        margins: marginRows(margins),
        receivables: readReceivables(receivables),
        detail: readMonthPack(detail),
        currency,
        digits: moneyFractionDigits(currency),
        lang,
        storeName: (isAr ? brand.name_ar : null) || brand.name_en,
        timeZone,
        today,
      });
      await downloadWorkbook(sheets, workbookFileName(slug, "month-pack", month.key));
      setOpen(false);
    } catch {
      toast.error(isAr ? "تعذر إعداد ملف الشهر" : "The month pack could not be prepared");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        {isAr ? "ملف الشهر للمحاسب" : "Month pack for the accountant"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isAr ? "ملف الشهر للمحاسب" : "Month pack for the accountant"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "ملف Excel واحد بكل ما يحتاجه المحاسب للشهر، بعملة المتجر."
                : `One Excel workbook with everything the accountant needs for the month, in ${currency}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-month`}>{isAr ? "الشهر" : "Month"}</Label>
            <select
              id={`${uid}-month`}
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
            >
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.toDate
                    ? `${monthLabel(m, lang)} (${isAr ? "حتى اليوم" : "to date"})`
                    : monthLabel(m, lang)}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">{isAr ? "الأوراق" : "Sheets"}</p>
            <p>
              {Object.values(PACK_SHEETS)
                .slice(1)
                .map((sheet) => sheet[lang])
                .join(" · ")}
            </p>
            <p className="mt-2">
              {isAr
                ? "أرصدة العملاء والمخزون كما هي اليوم، لا في نهاية الشهر."
                : "Customer balances and stock are as they stand today, not at the month's end."}
            </p>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={build} disabled={busy} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              {busy ? (isAr ? "جارٍ الإعداد…" : "Preparing…") : isAr ? "تنزيل" : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
