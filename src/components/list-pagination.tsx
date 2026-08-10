import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ListPaginationProps = {
  lang: "en" | "ar";
  entityAr: string;
  entityEn: string;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function ListPagination({
  lang,
  entityAr,
  entityEn,
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
    <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-sm select-none sm:flex-row sm:p-4">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <span className="text-xs text-muted-foreground sm:text-sm">
          {isAr ? `${entityAr} لكل صفحة:` : `${entityEn} per page:`}
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
            ? `عرض ${start}-${end} من ${totalItems} ${entityAr}`
            : `Showing ${start}-${end} of ${totalItems} ${entityEn.toLowerCase()}`}
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
