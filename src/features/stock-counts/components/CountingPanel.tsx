import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, ScanLine, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useBrand } from "@/lib/brand-context";
import { countOf } from "@/lib/arabic-count";
import {
  cancelStockCount,
  invalidateStockCounts,
  recordStockCount,
  stockCountKeys,
  stockCountQueries,
  type StockCount,
  type StockCountLine,
} from "@/lib/data/stock-counts";
import {
  countProgress,
  findByCode,
  lineName,
  linesToShow,
  stockCountError,
  stockCountLabel,
} from "../lib/stock-count";
import { CountReviewDialog } from "./CountReviewDialog";

type Lang = "ar" | "en";

/** How many sizes are drawn at once (a search finds the rest). */
const SHOWN = 120;

/**
 * The open count: how far it has come, a field a scanner types into (each scan adds one piece of
 * that size), and each size to count by hand. Several staff count at once: a scan adds, so two
 * phones never overwrite each other; a typed number sets the size. Then review and apply.
 */
export function CountingPanel({
  count,
  scope,
  lang,
}: {
  count: StockCount;
  scope: string | null;
  lang: Lang;
}) {
  const brand = useBrand();
  const qc = useQueryClient();
  const isAr = lang === "ar";
  const linesQ = useQuery({
    ...stockCountQueries.lines(brand.id, count.id),
    // Others count on their phones too.
    refetchInterval: 15_000,
  });
  const lines = linesQ.data ?? [];
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [onlyUncounted, setOnlyUncounted] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const progress = countProgress(lines);
  const shown = linesToShow(lines, lang, search, onlyUncounted);

  /** Writes a size's count and shows the database's answer in place. */
  const save = async (variantId: string, mode: "add" | "set" | "clear", value?: number) => {
    try {
      const saved = await recordStockCount(count.id, variantId, mode, value);
      qc.setQueryData<StockCountLine[]>(stockCountKeys.lines(brand.id, count.id), (old) =>
        (old ?? []).map((l) =>
          l.variant_id === variantId
            ? { ...l, counted: saved.counted, counted_at: new Date().toISOString() }
            : l,
        ),
      );
      return saved;
    } catch (error) {
      toast.error(stockCountError(error, lang));
      return null;
    }
  };

  const scanned = async (event: React.FormEvent) => {
    event.preventDefault();
    const line = findByCode(lines, scan);
    setScan("");
    scanRef.current?.focus();
    if (!line) {
      toast.error(isAr ? `لا توجد قطعة بالرمز ${scan}` : `No piece with the code ${scan}`);
      return;
    }
    const saved = await save(line.variant_id, "add", 1);
    if (saved) setLast(`${lineName(line, lang)}: ${saved.counted}`);
  };

  const cancel = async () => {
    const sure = await confirmDialog({
      title: isAr ? "إلغاء الجرد؟" : "Cancel the count?",
      description: isAr
        ? "لا يتغير شيء في المخزون، ويُحفظ الجرد ملغى."
        : "Nothing in the stock changes, and the count is kept as cancelled.",
      confirmLabel: isAr ? "إلغاء الجرد" : "Cancel the count",
      destructive: true,
    });
    if (!sure) return;
    try {
      await cancelStockCount(count.id);
      await invalidateStockCounts(qc, brand.id);
    } catch (error) {
      toast.error(stockCountError(error, lang));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-lg font-bold" dir="ltr">
            {stockCountLabel(count.number)}
          </span>
          <span className="min-w-0 flex-1 text-sm text-muted-foreground">
            {scope ?? (isAr ? "كل المنتجات" : "Every product")}
            {" · "}
            {isAr
              ? `عُدّ ${progress.counted} من ${countOf(progress.total, "size", "ar")}`
              : `${progress.counted} of ${countOf(progress.total, "size", "en")} counted`}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={cancel}>
              {isAr ? "إلغاء الجرد" : "Cancel"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setReviewing(true)}>
              <ClipboardList className="size-4" aria-hidden />
              {isAr ? "مراجعة وتطبيق" : "Review and apply"}
            </Button>
          </div>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.counted}
          aria-label={isAr ? "تقدم الجرد" : "Count progress"}
        >
          <div
            className="h-full bg-primary transition-[width] duration-(--motion-fast)"
            style={{ width: `${progress.total ? (progress.counted / progress.total) * 100 : 0}%` }}
          />
        </div>
        <form onSubmit={scanned} className="space-y-1.5">
          <Label htmlFor="count-scan" className="flex items-center gap-1.5">
            <ScanLine className="size-4" aria-hidden />
            {isAr ? "امسح الباركود أو اكتب الرمز" : "Scan a barcode or type a code"}
          </Label>
          <div className="flex gap-2">
            <Input
              id="count-scan"
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              dir="ltr"
              autoComplete="off"
              enterKeyHint="done"
            />
            <Button type="submit" disabled={!scan.trim()}>
              {isAr ? "أضف قطعة" : "Add a piece"}
            </Button>
          </div>
          {last && (
            <p className="text-sm text-success" role="status">
              {last}
            </p>
          )}
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "ابحث بالاسم أو الرمز" : "Search by name or code"}
            aria-label={isAr ? "ابحث في المقاسات" : "Search the sizes"}
            className="ps-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyUncounted} onCheckedChange={setOnlyUncounted} />
          {isAr ? "ما لم يُعدّ فقط" : "Not counted yet only"}
        </label>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {shown.slice(0, SHOWN).map((line) => (
          <CountRow key={line.variant_id} line={line} lang={lang} onSave={save} />
        ))}
        {shown.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {onlyUncounted && !search
              ? isAr
                ? "عُدّت كل المقاسات. راجع الفروقات وطبّقها."
                : "Every size is counted. Review the differences and apply them."
              : isAr
                ? "لا شيء يطابق البحث."
                : "Nothing matches the search."}
          </li>
        )}
      </ul>

      <CountReviewDialog
        count={count}
        scope={scope}
        open={reviewing}
        onOpenChange={setReviewing}
        lang={lang}
      />
    </div>
  );
}

function CountRow({
  line,
  lang,
  onSave,
}: {
  line: StockCountLine;
  lang: Lang;
  onSave: (variantId: string, mode: "add" | "set" | "clear", value?: number) => Promise<unknown>;
}) {
  const isAr = lang === "ar";
  const name = lineName(line, lang);
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? (line.counted === null ? "" : String(line.counted));
  const commit = async () => {
    if (typed === null) return;
    const text = typed.trim();
    setTyped(null);
    if (text === "") {
      if (line.counted !== null) await onSave(line.variant_id, "clear");
      return;
    }
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0) return;
    if (n !== line.counted) await onSave(line.variant_id, "set", n);
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium break-words" dir="auto">
          {name}
        </p>
        {line.product_variants?.sku && (
          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
            {line.product_variants.sku}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-label={isAr ? `المعدود من ${name}` : `Counted of ${name}`}
          className="w-20 text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onSave(line.variant_id, "add", 1)}
          aria-label={isAr ? `أضف قطعة من ${name}` : `Add one ${name}`}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
        {line.counted !== null && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onSave(line.variant_id, "clear")}
            aria-label={isAr ? `امسح عدّ ${name}` : `Clear the count of ${name}`}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}
