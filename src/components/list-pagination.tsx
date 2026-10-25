import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AR_NOUNS, arNounOblique, countOf, type CountedNoun } from "@/lib/arabic-count";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ListPaginationProps = {
  lang: "en" | "ar";
  /** What the list holds, counted in the reader's language ("عرض 1-6 من 6 منتجات"). */
  noun: CountedNoun;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

/** "Products" for "Products per page". */
const perPageNoun = (noun: CountedNoun) => {
  const plural = countOf(2, noun, "en").slice(2);
  return plural.charAt(0).toUpperCase() + plural.slice(1);
};

export function ListPagination({
  lang,
  noun,
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ListPaginationProps) {
  const isAr = lang === "ar";
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border-strong bg-card p-3 text-sm shadow-sm select-none sm:flex-row sm:p-4">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <span className="text-xs text-muted-foreground sm:text-sm">
          {isAr ? `${AR_NOUNS[noun].few} لكل صفحة:` : `${perPageNoun(noun)} per page:`}
        </span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger
            className="h-8 w-20 text-xs"
            aria-label={isAr ? "عدد العناصر لكل صفحة" : "Items per page"}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {isAr
            ? `عرض ${start}-${end} من ${arNounOblique(totalItems, noun)}`
            : `Showing ${start}-${end} of ${countOf(totalItems, noun, "en")}`}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-lg px-2.5 text-xs font-semibold"
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
        >
          {isAr ? (
            <>
              <span>السابق</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </>
          )}
        </Button>
        <span className="px-2 text-xs font-medium text-foreground">
          {isAr ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-lg px-2.5 text-xs font-semibold"
          onClick={() => onPageChange(Math.min(page + 1, totalPages))}
          disabled={page >= totalPages}
        >
          {isAr ? (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>التالي</span>
            </>
          ) : (
            <>
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
