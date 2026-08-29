import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowUpRight, ArrowDownLeft, Clock, AlertCircle, RefreshCw } from "lucide-react";
import type { LoyaltyLedgerEntry } from "@/lib/loyalty.types";

interface LoyaltyLedgerTableProps {
  entries: (LoyaltyLedgerEntry & {
    customers?: { name: string; email: string; phone: string } | null;
  })[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function LoyaltyLedgerTable({
  entries,
  isLoading,
  onRefresh,
}: LoyaltyLedgerTableProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";

  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");

  const filteredEntries = entries.filter((item) => {
    const matchesSearch =
      search === "" ||
      item.reference_note_ar?.toLowerCase().includes(search.toLowerCase()) ||
      item.reference_note_en?.toLowerCase().includes(search.toLowerCase()) ||
      item.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.customers?.email?.toLowerCase().includes(search.toLowerCase()) ||
      item.customers?.phone?.includes(search);

    const matchesEvent = eventTypeFilter === "all" || item.event_type === eventTypeFilter;

    return matchesSearch && matchesEvent;
  });

  const getEventBadge = (type: string, points: number) => {
    const isPositive = points > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
          isPositive
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
        }`}
      >
        {isPositive ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
        <span>
          {isPositive ? "+" : ""}
          {points} {isAr ? "نقطة" : "pts"}
        </span>
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {isAr ? "نشط" : "Active"}
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            {isAr ? "معلق (انتظار)" : "Pending"}
          </span>
        );
      case "redeemed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            {isAr ? "مستخدم" : "Redeemed"}
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {isAr ? "ملغي" : "Cancelled"}
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
            {isAr ? "منتهي" : "Expired"}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isAr ? "بحث بالعميل أو الملاحظة أو الهاتف..." : "Search customer, note, phone..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 min-h-[44px] bg-background border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-[180px] min-h-[44px] border-border bg-background">
              <SelectValue placeholder={isAr ? "نوع الحركة" : "Event Type"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع الحركات" : "All Events"}</SelectItem>
              <SelectItem value="earn_order">{isAr ? "كسب من طلب" : "Order Earned"}</SelectItem>
              <SelectItem value="redeem_checkout">{isAr ? "استخدام عند الدفع" : "Redeemed"}</SelectItem>
              <SelectItem value="refund_return">{isAr ? "إعادة لمرتجع" : "Return Refund"}</SelectItem>
              <SelectItem value="revoke_cancelled">{isAr ? "إلغاء لطلب ملغي" : "Cancelled"}</SelectItem>
              <SelectItem value="earn_first_order">{isAr ? "مكافأة أول طلب" : "First Order Bonus"}</SelectItem>
              <SelectItem value="earn_manual">{isAr ? "تعديل يدوي" : "Manual Adjustment"}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            className="min-h-[44px] min-w-[44px] border-border"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Ledger Table */}
      <Card className="border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>{isAr ? "العميل" : "Customer"}</TableHead>
                <TableHead>{isAr ? "العملية والبيان" : "Description"}</TableHead>
                <TableHead>{isAr ? "مقدار النقاط" : "Points"}</TableHead>
                <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isAr ? "الرصيد بعد الحركة" : "Balance After"}</TableHead>
                <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    {isLoading
                      ? isAr
                        ? "جاري تحميل سجل الولاء..."
                        : "Loading loyalty ledger..."
                      : isAr
                      ? "لا توجد حركات ولاء مسجلة حتى الآن."
                      : "No loyalty transactions recorded yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <TableRow key={entry.id} className="border-border">
                    <TableCell className="font-medium">
                      <div>
                        <span className="text-foreground block">
                          {entry.customers?.name || (isAr ? "عميل مسجل" : "Customer")}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {entry.customers?.phone || entry.customers?.email || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-foreground block">
                        {isAr ? entry.reference_note_ar : entry.reference_note_en}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground block">
                        ID: {entry.idempotency_key}
                      </span>
                    </TableCell>
                    <TableCell>{getEventBadge(entry.event_type, entry.points)}</TableCell>
                    <TableCell>{getStatusBadge(entry.points_status)}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {entry.balance_after} {isAr ? "نقطة" : "pts"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleDateString(isAr ? "ar-BH" : "en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
