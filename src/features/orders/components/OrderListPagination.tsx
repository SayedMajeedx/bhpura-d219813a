import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

import type { Dispatch, SetStateAction } from "react";

import type { Order } from "@/features/orders/types";
/** Orders per page and page navigation. */
export function OrderListPagination({
  lang,
  page,
  pageSize,
  setPage,
  setPageSize,
  sortedOrders,
  totalPages,
}: {
  lang: ReturnType<typeof useI18n>["lang"];
  page: number;
  pageSize: number;
  setPage: Dispatch<SetStateAction<number>>;
  setPageSize: Dispatch<SetStateAction<number>>;
  sortedOrders: Order[];
  totalPages: number;
}) {
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border-strong bg-card p-3 text-sm shadow-sm select-none sm:flex-row sm:p-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs sm:text-sm">
          {lang === "ar" ? "الطلبات لكل صفحة:" : "Orders per page:"}
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs ms-2">
          {lang === "ar"
            ? `عرض ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} من ${sortedOrders.length} طلب`
            : `Showing ${Math.min((page - 1) * pageSize + 1, sortedOrders.length)}-${Math.min(page * pageSize, sortedOrders.length)} of ${sortedOrders.length} orders`}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-lg"
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page <= 1}
        >
          {lang === "ar" ? (
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
        <div className="text-xs px-2 font-medium text-foreground">
          {lang === "ar" ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-lg"
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          disabled={page >= totalPages}
        >
          {lang === "ar" ? (
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
