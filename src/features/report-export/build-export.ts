import type { QueryClient } from "@tanstack/react-query";
import { readMonthPack } from "@/features/finance-reports/lib/month-pack";
import { marginRows } from "@/features/finance-reports/lib/margins";
import { localDay, readReceivables } from "@/features/finance-reports/lib/receivables";
import { reportingQueries } from "@/lib/data/reporting";
import {
  exportReportData,
  fetchIncubatorReporting,
  fetchReportingProductsAll,
} from "@/lib/reporting.functions";
import type { ComposedOverviewRow } from "@/lib/reporting-compose";
import { customersExport, productsExport } from "./lib/catalog-export";
import type { ExportContext, ExportFile, Rows } from "./lib/export-shared";
import { salesExport } from "./lib/sales-export";

export type ExportKind = "sales" | "products" | "customers";

const list = (value: unknown): Rows => (Array.isArray(value) ? (value as Rows) : []);

/**
 * Reads what a Reports export needs and puts the file together. The sales file (the owner's
 * report) asks, at once: the overview for the period and for the period of the same length just
 * before (its summary), the month pack's lists (orders, partner sales and payments, returns,
 * expenses, suppliers, stock), every order of the period (for those not counted as sold), the
 * margins by product, and what customers and partner shops owe today.
 */
export async function buildExport(input: {
  kind: ExportKind;
  qc: QueryClient;
  slug: string;
  range: { from: Date; to: Date };
  ctx: Omit<ExportContext, "from" | "to">;
}): Promise<ExportFile> {
  const { kind, qc, slug, range } = input;
  const ctx: ExportContext = { ...input.ctx, from: localDay(range.from), to: localDay(range.to) };
  const tz = ctx.timeZone;
  if (kind === "sales") {
    const before = previousRange(range);
    const today = localDay(new Date());
    const [overview, previous, pack, allOrders, margins, receivables] = await Promise.all([
      qc.fetchQuery(reportingQueries.overview(slug, range, tz, false)),
      qc.fetchQuery(reportingQueries.overview(slug, before, tz, false)),
      qc.fetchQuery(reportingQueries.monthPack(slug, range, tz)),
      exportReportData("sales", range, tz, slug),
      qc.fetchQuery(reportingQueries.margins(slug, range, false)),
      qc.fetchQuery(reportingQueries.receivables(slug, today, tz)),
    ]);
    const detail = readMonthPack(pack);
    const rows = (value: unknown) => (Array.isArray(value) ? value : []) as ComposedOverviewRow[];
    return salesExport({
      ctx,
      overview: rows(overview),
      previous: rows(previous),
      sales: detail.sales,
      partnerSales: detail.partner_sales,
      partnerPayments: detail.partner_payments,
      returns: detail.returns,
      expenses: detail.expenses,
      stock: detail.stock,
      supplierPayments: detail.supplier_payments,
      supplierOwed: detail.supplier_owed,
      allOrders: list(allOrders),
      margins: marginRows(margins),
      receivables: readReceivables(receivables),
      today,
    });
  }
  if (kind === "products") {
    const [store, partners] = await Promise.all([
      fetchReportingProductsAll(range, tz, slug),
      fetchIncubatorReporting(range, tz, slug),
    ]);
    return productsExport(ctx, store, list((partners as { products?: unknown }).products));
  }
  return customersExport(ctx, list(await exportReportData("customers", range, tz, slug)));
}

/** A file with nothing in its main table: nothing was sold or bought in the period. */
export function isEmptyExport(file: ExportFile) {
  return file.csv.length <= 1;
}

/** The period of the same length that ends just before this one starts. */
export function previousRange(range: { from: Date; to: Date }) {
  const length = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  return { from: new Date(to.getTime() - length), to };
}
