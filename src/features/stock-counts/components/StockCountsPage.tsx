import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { categoriesQueries } from "@/lib/data/categories";
import { assignableCategories } from "@/lib/smart-categories";
import {
  invalidateStockCounts,
  startStockCount,
  stockCountQueries,
  type StockCount,
} from "@/lib/data/stock-counts";
import { stockCountError, stockCountLabel } from "../lib/stock-count";
import { CountingPanel } from "./CountingPanel";
import { CountReviewDialog } from "./CountReviewDialog";

type Lang = "ar" | "en";

const STATUS_WORDS: Record<StockCount["status"], { ar: string; en: string }> = {
  counting: { ar: "قيد الجرد", en: "Counting" },
  applied: { ar: "طُبّق", en: "Applied" },
  cancelled: { ar: "أُلغي", en: "Cancelled" },
};

const when = (at: string, lang: Lang) =>
  new Date(at).toLocaleDateString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * The store's full stock counts (migration 20261231100000): the open count to count, with its
 * review and apply, or a way to start one (the whole store or one category); and the counts
 * before it, each with its report.
 */
export function StockCountsPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const counts = useQuery(stockCountQueries.list(brand.id));
  const [starting, setStarting] = useState(false);
  const [report, setReport] = useState<StockCount | null>(null);
  const list = counts.data ?? [];
  const open = list.find((c) => c.status === "counting") ?? null;
  const categoryName = useCategoryName(brand.id, lang);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <AdminPageHeader
        icon={ClipboardCheck}
        title={isAr ? "جرد المخزون" : "Stock count"}
        description={
          isAr
            ? "اعدد قطع المتجر كلها أو قسمًا منها، وطبّق الفروقات دفعة واحدة."
            : "Count every piece in the store, or one category, and apply the differences in one step."
        }
        actions={
          !open && (
            <AdminPageAction
              icon={Plus}
              label={isAr ? "بدء جرد" : "Start a count"}
              short={isAr ? "جرد" : "Start"}
              onClick={() => setStarting(true)}
            />
          )
        }
      />

      {open ? (
        <CountingPanel count={open} scope={categoryName(open.category)} lang={lang} />
      ) : (
        !counts.isLoading && (
          <Card className="p-4 text-sm text-muted-foreground">
            {isAr
              ? "لا يوجد جرد مفتوح. ابدأ جردًا لتعدّ القطع على الرف بالماسح أو بالكتابة، مع زملائك في الوقت نفسه."
              : "No count is open. Start one to count the pieces on the shelf with a scanner or by typing, with your colleagues at the same time."}
          </Card>
        )
      )}

      {list.some((c) => c.status !== "counting") && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{isAr ? "الجرد السابق" : "Earlier counts"}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {list
              .filter((c) => c.status !== "counting")
              .map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="font-mono text-sm font-bold" dir="ltr">
                    {stockCountLabel(c.number)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {categoryName(c.category) ?? (isAr ? "كل المنتجات" : "Every product")}
                    <span className="text-muted-foreground">
                      {" · "}
                      {when(c.finished_at ?? c.started_at, lang)}
                      {" · "}
                      {STATUS_WORDS[c.status][lang]}
                    </span>
                  </span>
                  {c.status === "applied" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setReport(c)}
                    >
                      <FileSpreadsheet className="size-4" aria-hidden />
                      {isAr ? "التقرير" : "Report"}
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      <StartCountDialog open={starting} onOpenChange={setStarting} lang={lang} />
      {report && (
        <CountReviewDialog
          count={report}
          scope={categoryName(report.category)}
          open
          onOpenChange={(next) => !next && setReport(null)}
          lang={lang}
        />
      )}
    </div>
  );
}

/** A category's name in the reader's words, from its slug (null: every product). */
function useCategoryName(brandId: string, lang: Lang) {
  const categories = useQuery(categoriesQueries.list(brandId)).data ?? [];
  return (slug: string | null) => {
    if (!slug) return null;
    const cat = categories.find((c) => c.slug === slug);
    return (lang === "ar" ? cat?.name_ar || cat?.name_en : cat?.name_en || cat?.name_ar) || slug;
  };
}

function StartCountDialog({
  open,
  onOpenChange,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}) {
  const brand = useBrand();
  const qc = useQueryClient();
  const isAr = lang === "ar";
  const categories = assignableCategories(useQuery(categoriesQueries.list(brand.id)).data ?? []);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const started = await startStockCount(brand.id, category || null, note);
      await invalidateStockCounts(qc, brand.id);
      toast.success(
        isAr
          ? `بدأ الجرد ${stockCountLabel(started.number)}`
          : `Count ${stockCountLabel(started.number)} started`,
      );
      onOpenChange(false);
      setNote("");
    } catch (error) {
      toast.error(stockCountError(error, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      kind="form"
      size="sm"
      busy={busy}
      onSubmit={submit}
    >
      <AppDialogHeader
        title={isAr ? "بدء جرد" : "Start a count"}
        description={
          isAr
            ? "يُحفظ مخزون كل مقاس الآن، ثم يُقارن بما يُعدّ. البيع أثناء الجرد لا يُحسب نقصًا."
            : "Each size's stock is kept now and compared with what is counted. A sale during the count is never read as a loss."
        }
      />
      <AppDialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="count-category">{isAr ? "ماذا تعدّ؟" : "What to count"}</Label>
          <select
            id="count-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{isAr ? "كل المنتجات" : "Every product"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug ?? ""}>
                {(isAr ? c.name_ar || c.name_en : c.name_en || c.name_ar) ?? c.slug}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="count-note">{isAr ? "ملاحظة (اختياري)" : "Note (optional)"}</Label>
          <Textarea
            id="count-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </AppDialogBody>
      <AppDialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        <Button type="submit" disabled={busy}>
          {isAr ? "ابدأ الجرد" : "Start counting"}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
