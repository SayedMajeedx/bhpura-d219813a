import { incubatorAmountDue } from "@/features/incubators/lib/amount-due";
import type {
  Incubator,
  Payment,
  PaymentAllocation,
  Sale,
  StockItem,
} from "@/features/incubators/types";

/**
 * The numbers and labels of a partner's page: what it holds, what it sold, what it owes.
 * Money is counted to the fils (3 decimals), so sums of prices do not drift.
 */

const fils = (value: number) => Math.round(value * 1000) / 1000;
const sum = <T>(rows: readonly T[], of: (row: T) => number) =>
  fils(rows.reduce((total, row) => total + Number(of(row) || 0), 0));

export type IncubatorSummary = {
  /** Pieces still on the partner's shelf. */
  units: number;
  /** Those pieces at their consignment price. */
  stockValue: number;
  /** Pieces sold (reversed sales left out). */
  soldUnits: number;
  /** What customers paid the partner for them. */
  gross: number;
  /** The partner's share. */
  commission: number;
  /** The store's share: gross less the commission. */
  net: number;
  /** What the partner has paid so far. */
  paid: number;
  /** What it still owes. */
  due: number;
};

/** One partner's figures from its own stock lines, sales and payments. */
export function incubatorSummary(
  stock: readonly StockItem[],
  sales: readonly Sale[],
  payments: readonly Payment[],
): IncubatorSummary {
  const onShelf = stock.filter((item) => Number(item.quantity) > 0);
  const confirmed = sales.filter((sale) => sale.status === "confirmed");
  return {
    units: onShelf.reduce((total, item) => total + Number(item.quantity), 0),
    stockValue: sum(onShelf, (item) => Number(item.quantity) * Number(item.consignment_price)),
    soldUnits: confirmed.reduce((total, sale) => total + Number(sale.quantity), 0),
    gross: sum(confirmed, (sale) => sale.gross_amount),
    commission: sum(confirmed, (sale) => sale.commission_amount),
    net: sum(confirmed, (sale) => sale.net_due),
    paid: sum(
      payments.filter((payment) => !payment.voided_at),
      (payment) => payment.amount,
    ),
    due: incubatorAmountDue(sales),
  };
}

/** When a partner settles, and what is late: as the database works it out. */
export type Settlement = {
  /** `YYYY-MM-DD`; null for a partner with no settlement day. */
  last: string | null;
  next: string | null;
  /** Still unpaid for sales made before the last settlement day. */
  overdue: number;
};
export type ServerSummary = IncubatorSummary & { settlement: Settlement };

/** A row of `incubator_summaries`, as the page reads it. */
export function serverSummary(row: {
  units?: number | string | null;
  stock_value?: number | string | null;
  sold_units?: number | string | null;
  gross?: number | string | null;
  commission?: number | string | null;
  net?: number | string | null;
  paid?: number | string | null;
  due?: number | string | null;
  overdue?: number | string | null;
  last_settlement?: string | null;
  next_settlement?: string | null;
}): ServerSummary {
  const amount = (value: number | string | null | undefined) => fils(Number(value ?? 0));
  return {
    units: Number(row.units ?? 0),
    stockValue: amount(row.stock_value),
    soldUnits: Number(row.sold_units ?? 0),
    gross: amount(row.gross),
    commission: amount(row.commission),
    net: amount(row.net),
    paid: amount(row.paid),
    due: amount(row.due),
    settlement: {
      last: row.last_settlement ?? null,
      next: row.next_settlement ?? null,
      overdue: amount(row.overdue),
    },
  };
}

/** The reader's calendar day, `YYYY-MM-DD`: "today" is theirs, not the server's. */
export function calendarDay(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What a partner's page says about its settlement: when the next one is, and what is late.
 * Null for a partner with no settlement day.
 */
export function settlementNote(
  settlement: Settlement | null | undefined,
  options: { money: (amount: number) => string; date: (day: string) => string; lang: "ar" | "en" },
): { next: string; overdue: string | null } | null {
  if (!settlement?.next) return null;
  const { money, date, lang } = options;
  const since = settlement.last ? date(settlement.last) : null;
  const late = money(settlement.overdue);
  const overdue =
    settlement.overdue <= 0
      ? null
      : lang === "ar"
        ? since
          ? `متأخر منذ ${since}: ${late}`
          : `متأخر: ${late}`
        : since
          ? `Overdue since ${since}: ${late}`
          : `Overdue: ${late}`;
  return {
    next:
      lang === "ar"
        ? `التسوية القادمة: ${date(settlement.next)}`
        : `Next settlement: ${date(settlement.next)}`,
    overdue,
  };
}

export type IncubatorChip = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
  units: number;
  due: number;
  /** Late past its settlement day. */
  overdue: number;
};

/**
 * The partner picker: each partner with the pieces it holds and what it owes. The database's
 * figures are used when they have arrived (`summaries`); until then, the loaded rows.
 */
export function incubatorChips(
  incubators: readonly Incubator[],
  stock: readonly StockItem[],
  sales: readonly Sale[],
  summaries?: ReadonlyMap<string, ServerSummary>,
): IncubatorChip[] {
  return incubators.map((incubator) => {
    const server = summaries?.get(incubator.id);
    return {
      id: incubator.id,
      name: incubator.name,
      currency: incubator.currency,
      isActive: incubator.is_active !== false,
      units:
        server?.units ??
        stock
          .filter((row) => row.incubator_id === incubator.id)
          .reduce((total, row) => total + Number(row.quantity), 0),
      due:
        server?.due ??
        incubatorAmountDue(sales.filter((sale) => sale.incubator_id === incubator.id)),
      overdue: server?.settlement.overdue ?? 0,
    };
  });
}

export type SaleState = "reversed" | "paid" | "part_paid" | "due";

/** Where a sale stands with the partner's payments. */
export function saleState(sale: Pick<Sale, "status" | "net_due" | "paid_amount">): SaleState {
  if (sale.status === "reversed") return "reversed";
  const due = fils(Number(sale.net_due) - Number(sale.paid_amount || 0));
  if (due <= 0) return "paid";
  return Number(sale.paid_amount || 0) > 0 ? "part_paid" : "due";
}

const SALE_STATE_LABELS: Record<SaleState, { en: string; ar: string }> = {
  reversed: { en: "Reversed", ar: "ملغاة" },
  paid: { en: "Paid", ar: "مسددة" },
  part_paid: { en: "Part paid", ar: "مسددة جزئياً" },
  due: { en: "Due", ar: "مستحقة" },
};
export const saleStateLabel = (state: SaleState, lang: "ar" | "en") =>
  SALE_STATE_LABELS[state][lang];

/** A sale can be undone only while it is confirmed and nothing was paid against it. */
export function saleCanBeReversed(sale: Pick<Sale, "status" | "paid_amount">): boolean {
  return sale.status === "confirmed" && Number(sale.paid_amount || 0) === 0;
}

/**
 * What the store keeps from a sale after the pieces' cost and their packaging, or null when
 * the sale carries no cost (an older sale, or a reader who may not see costs).
 */
export function saleProfit(sale: Sale): number | null {
  if (sale.product_cost_snapshot == null) return null;
  return fils(
    Number(sale.net_due) -
      Number(sale.product_cost_snapshot || 0) -
      Number(sale.packaging_cost_snapshot || 0),
  );
}

/** The commission terms of a stock line in words: "10%" or "2.000 each". */
export function commissionTerms(
  item: Pick<StockItem, "commission_type" | "commission_value">,
  money: (amount: number) => string,
  lang: "ar" | "en",
): string {
  if (item.commission_type === "fixed") {
    return lang === "ar"
      ? `${money(Number(item.commission_value))} للقطعة`
      : `${money(Number(item.commission_value))} each`;
  }
  return `${Number(item.commission_value)}%`;
}

/** Stock lines matching a search by product name, our code or the partner's code. */
export function filterStock(stock: readonly StockItem[], search: string): StockItem[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [...stock];
  return stock.filter((item) => {
    const variant = item.product_variants;
    return [
      item.external_code,
      variant?.sku,
      variant?.barcode,
      variant?.products?.name,
      variant?.products?.name_ar,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(needle),
    );
  });
}

export type PaymentSettlement = { saleId: string; amount: number; sale: Sale | null };

/** The sales each payment settled, largest part first. */
export function settlementsByPayment(
  allocations: readonly PaymentAllocation[],
  sales: readonly Sale[],
): Map<string, PaymentSettlement[]> {
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const byPayment = new Map<string, PaymentSettlement[]>();
  for (const allocation of allocations) {
    const list = byPayment.get(allocation.payment_id) ?? [];
    list.push({
      saleId: allocation.sale_id,
      amount: Number(allocation.amount),
      sale: saleById.get(allocation.sale_id) ?? null,
    });
    byPayment.set(allocation.payment_id, list);
  }
  for (const list of byPayment.values()) list.sort((a, b) => b.amount - a.amount);
  return byPayment;
}
