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
    paid: sum(payments, (payment) => payment.amount),
    due: incubatorAmountDue(sales),
  };
}

export type IncubatorChip = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
  units: number;
  due: number;
};

/** The partner picker: each partner with the pieces it holds and what it owes. */
export function incubatorChips(
  incubators: readonly Incubator[],
  stock: readonly StockItem[],
  sales: readonly Sale[],
): IncubatorChip[] {
  return incubators.map((incubator) => ({
    id: incubator.id,
    name: incubator.name,
    currency: incubator.currency,
    isActive: incubator.is_active !== false,
    units: stock
      .filter((row) => row.incubator_id === incubator.id)
      .reduce((total, row) => total + Number(row.quantity), 0),
    due: incubatorAmountDue(sales.filter((sale) => sale.incubator_id === incubator.id)),
  }));
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
