import {
  growth,
  statementLines,
  type StatementLine,
} from "@/features/finance-reports/lib/statement";
import {
  PERCENT_FORMAT,
  moneyFormat,
  type XCell,
  type XSheet,
} from "@/features/finance-reports/lib/workbook";
import { overviewProfit, salesBySource, type ComposedOverviewRow } from "@/lib/reporting-compose";
import { SALES_WORDS, type Words } from "@/lib/report-words";
import {
  countCell,
  num,
  roundTo,
  sheetHead,
  sheetWords,
  type ExportContext,
} from "./export-shared";

/**
 * The summary an owner reads first: where the period's sales came from, the profit and loss
 * down to the operating profit (the monthly statement's own lines, `statementLines`), the cost
 * of goods in detail, what each source earned, the money collected and still owed, and what
 * would make the profit read wrong. Each figure beside the period before it of the same length.
 * Every figure is the overview's own (`composeOverviewRows`), so the file agrees with the screens.
 */

export const SUMMARY_WORDS = {
  title: { en: "Summary", ar: "الملخص" },
  basis: {
    en: "Net sales are before VAT and delivery, after discounts and returns. A sale counts on the day its order was placed, a return on the day it was processed, a running cost on its own date.",
    ar: "صافي المبيعات قبل الضريبة والتوصيل وبعد الخصومات والمرتجعات. تُحسب المبيعة بيوم الطلب، والمرتجع بيوم معالجته، والمصروف بتاريخه.",
  },
  line: { en: "", ar: "" },
  period: { en: "This period", ar: "هذه الفترة" },
  share: { en: "Of net sales", ar: "من صافي المبيعات" },
  previous: { en: "Period before", ar: "الفترة السابقة" },
  change: { en: "Change", ar: "التغيّر" },
  sources: { en: "Sales by source", ar: "المبيعات حسب المصدر" },
  storeBeforeReturns: { en: "Store orders, before returns", ar: "طلبات المتجر قبل المرتجعات" },
  returns: { en: "Returns", ar: "المرتجعات" },
  storeNet: { en: "Store orders, net", ar: "صافي طلبات المتجر" },
  profitAndLoss: { en: "Profit and loss", ar: "الأرباح والخسائر" },
  netProfitNote: {
    en: "Operating profit is the store's net profit for the period: net sales less the cost of the pieces sold and every running cost, payment fee and partner commission. Paying a supplier is not a cost here: a piece's cost counts when it sells.",
    ar: "الربح التشغيلي هو صافي ربح المتجر في الفترة: صافي المبيعات ناقص تكلفة القطع المبيعة وكل المصاريف التشغيلية ورسوم الدفع وعمولات المحلات. الدفع للموردين ليس مصروفاً هنا: تُحسب تكلفة القطعة عند بيعها.",
  },
  costDetail: { en: "Cost of goods in detail", ar: "تكلفة البضاعة بالتفصيل" },
  costProducts: { en: "Pieces sold in store orders", ar: "قطع طلبات المتجر" },
  costPackaging: { en: "Packaging", ar: "التغليف" },
  costOther: { en: "Other order costs", ar: "تكاليف أخرى للطلبات" },
  costPartners: { en: "Pieces sold at partner shops", ar: "قطع المحلات الشريكة" },
  costReturned: { en: "Cost of returned pieces back", ar: "تكلفة القطع المرتجعة" },
  costTotal: { en: "Cost of goods", ar: "تكلفة البضاعة" },
  bySource: { en: "Gross profit by source", ar: "مجمل الربح حسب المصدر" },
  bySourceNote: {
    en: "Each source's net sales less the cost of its pieces; a partner shop's also less its commission",
    ar: "صافي مبيعات كل مصدر ناقص تكلفة قطعه، والمحلات الشريكة ناقص عمولتها أيضاً",
  },
  money: { en: "Money", ar: "المال" },
  billed: SALES_WORDS.billed,
  delivery: { en: "Delivery charged to customers", ar: "رسوم التوصيل المحصّلة من العملاء" },
  vat: {
    en: "VAT charged (owed to the tax authority)",
    ar: "الضريبة المحصّلة (مستحقة للجهة الضريبية)",
  },
  collected: { en: "Collected on these sales", ar: "المحصّل من هذه المبيعات" },
  owedCustomers: { en: "Still owed by customers", ar: "باقي على العملاء" },
  owedPartners: { en: "Still owed by partner shops", ar: "باقي على المحلات الشريكة" },
  counts: { en: "Counts", ar: "الأعداد" },
  storeOrders: { en: "Store orders", ar: "طلبات المتجر" },
  partnerSales: { en: "Partner shop sales", ar: "مبيعات المحلات الشريكة" },
  averageOrder: { en: "Average store order (net)", ar: "متوسط طلب المتجر (صافي)" },
  health: { en: "Check before relying on the profit", ar: "راجع قبل الاعتماد على الربح" },
  healthNote: {
    en: "A piece sold with no cost recorded counts as costing nothing, so the profit above reads higher than it is.",
    ar: "القطعة المبيعة بلا تكلفة مسجلة تُحسب بتكلفة صفر، فيظهر الربح أعلى من حقيقته.",
  },
  missingPieces: { en: "Pieces sold with no cost recorded", ar: "قطع مبيعة بلا تكلفة مسجلة" },
  missingValue: { en: "Their sales", ar: "مبيعاتها" },
  manualItems: { en: "Hand-written order lines (no product)", ar: "أسطر طلبات يدوية (بلا منتج)" },
  nothingToCheck: { en: "Nothing to check", ar: "لا شيء يحتاج مراجعة" },
} satisfies Record<string, Words>;

const W = SUMMARY_WORDS;
type Row = Partial<ComposedOverviewRow> | undefined;
const field = (row: Row, key: string) => num((row as Record<string, unknown> | undefined)?.[key]);

/** The cost of goods in its parts; the parts add up to the statement's cost of goods. */
export function costParts(row: Row) {
  const partners = field(row, "incubator_cogs");
  const products = field(row, "product_cogs");
  const packaging = field(row, "packaging_cogs");
  const store = num(row?.known_cogs) - partners;
  const returned = num(row?.returned_cogs_reversal);
  const total = overviewProfit(row).costOfGoods;
  return {
    products,
    packaging,
    other: store - products - packaging,
    partners,
    returned,
    total,
  };
}

/** What each source earned before running costs. The three add up to gross profit less commissions. */
export function profitBySource(row: Row) {
  const sales = salesBySource(row);
  const cost = costParts(row);
  const commission = num(row?.incubator_commissions);
  const store = sales.store - (cost.total - cost.partners);
  const partners = sales.partners - cost.partners - commission;
  return {
    store: { profit: store, sales: sales.store },
    partners: { profit: partners, sales: sales.partners },
    services: { profit: sales.services, sales: sales.services },
  };
}

const tiny = (v: number) => Math.abs(v) < 0.0005;

export function ownerSummarySheet(input: {
  ctx: ExportContext;
  row: Row;
  previous: Row;
  hasPartners: boolean;
}): XSheet {
  const { ctx, row, previous } = input;
  const w = sheetWords(ctx);
  const money = moneyFormat(ctx.digits);
  const netSales = overviewProfit(row).netSales;

  const pct = (value: number | null): XCell =>
    value === null || !Number.isFinite(value) ? null : { value, format: PERCENT_FORMAT };
  const changeCell = (
    now: number,
    before: number | null,
    points = false,
    keepSign = false,
  ): XCell => {
    if (before === null) return null;
    if (points) {
      const pts = ctx.lang === "ar" ? "نقطة" : "pts";
      return { value: (now - before) * 100, format: `+0.0" ${pts}";-0.0" ${pts}";"–"` };
    }
    if (tiny(before)) return null;
    // A deduction (a cost, the returns) is negative: compared by its size, so a rising cost reads
    // "+". A profit keeps its sign: a loss that deepens fell.
    const grew = growth(now, before, !keepSign);
    return grew === null ? null : { value: grew, format: '+0.0%;-0.0%;"–"' };
  };
  type Style = {
    indent?: number;
    bold?: boolean;
    total?: boolean;
    share?: boolean;
    /** A profit: its change keeps its sign. */
    profit?: boolean;
  };
  const moneyLine = (label: Words, now: number, before: number | null, s: Style = {}): XCell[] => [
    { value: w(label), indent: s.indent, bold: s.bold, total: s.total },
    { value: roundTo(now, ctx.digits), format: money, bold: s.bold, total: s.total },
    s.share && netSales > 0 ? pct(now / netSales) : null,
    before === null ? null : { value: roundTo(before, ctx.digits), format: money },
    changeCell(now, before, false, s.profit),
  ];
  const countLine = (label: Words, now: number, before: number | null): XCell[] => [
    { value: w(label), indent: 1 },
    countCell(now),
    null,
    before === null ? null : countCell(before),
    changeCell(now, before),
  ];
  const section = (title: Words, note?: Words): XCell[][] => [
    [],
    [{ value: w(title), heading: true }, null, null, null, null],
    ...(note ? [[{ value: w(note) }] as XCell[]] : []),
  ];
  const prev = previous ?? null;

  // 1. Sales by source
  const sales = salesBySource(row);
  const salesBefore = prev ? salesBySource(prev) : null;
  const returns = num(row?.net_merch_sales) - netSales;
  const returnsBefore = prev ? num(prev.net_merch_sales) - overviewProfit(prev).netSales : null;
  const hasServices = !tiny(sales.services) || (salesBefore ? !tiny(salesBefore.services) : false);
  const sourceRows: XCell[][] = [
    ...(tiny(returns)
      ? []
      : [
          moneyLine(
            W.storeBeforeReturns,
            sales.store + returns,
            salesBefore && returnsBefore !== null ? salesBefore.store + returnsBefore : null,
            { indent: 1 },
          ),
          moneyLine(W.returns, -returns, returnsBefore === null ? null : -returnsBefore, {
            indent: 1,
          }),
        ]),
    moneyLine(
      tiny(returns) ? SALES_WORDS.store : W.storeNet,
      sales.store,
      salesBefore?.store ?? null,
      { indent: 1, share: true },
    ),
    ...(input.hasPartners
      ? [
          moneyLine(SALES_WORDS.partners, sales.partners, salesBefore?.partners ?? null, {
            indent: 1,
            share: true,
          }),
        ]
      : []),
    ...(hasServices
      ? [
          moneyLine(SALES_WORDS.services, sales.services, salesBefore?.services ?? null, {
            indent: 1,
            share: true,
          }),
        ]
      : []),
    moneyLine(SALES_WORDS.total, sales.total, salesBefore?.total ?? null, {
      bold: true,
      total: true,
      share: true,
    }),
  ];

  // 2. Profit and loss: the statement's own lines (not its reference lines or its source parts).
  const statement = statementLines([row], prev ? [prev] : null).filter(
    (l) => !l.reference && l.kind !== "part",
  );
  const statementRow = (line: StatementLine): XCell[] => {
    const now = line.values[0] ?? 0;
    if (line.kind === "ratio") {
      return [
        { value: w(line.label), indent: 1 },
        pct(now / 100),
        null,
        line.prior === null ? null : pct(line.prior / 100),
        changeCell(now / 100, line.prior === null ? null : line.prior / 100, true),
      ];
    }
    const strong = line.kind === "subtotal" || line.kind === "total";
    return moneyLine(line.label, now, line.prior, {
      indent: line.kind === "item" ? 1 : 0,
      bold: strong,
      total: line.kind === "total",
      share: true,
      profit: line.key === "gross_profit" || line.key === "operating_profit",
    });
  };

  // 3. Cost of goods in detail
  const cost = costParts(row);
  const costBefore = prev ? costParts(prev) : null;
  const costRows: XCell[][] = [
    moneyLine(W.costProducts, -cost.products, costBefore ? -costBefore.products : null, {
      indent: 1,
      share: true,
    }),
    ...(tiny(cost.packaging) && !(costBefore && !tiny(costBefore.packaging))
      ? []
      : [
          moneyLine(W.costPackaging, -cost.packaging, costBefore ? -costBefore.packaging : null, {
            indent: 1,
            share: true,
          }),
        ]),
    ...(tiny(cost.other)
      ? []
      : [
          moneyLine(W.costOther, -cost.other, costBefore ? -costBefore.other : null, {
            indent: 1,
            share: true,
          }),
        ]),
    ...(input.hasPartners
      ? [
          moneyLine(W.costPartners, -cost.partners, costBefore ? -costBefore.partners : null, {
            indent: 1,
            share: true,
          }),
        ]
      : []),
    ...(tiny(cost.returned)
      ? []
      : [
          moneyLine(W.costReturned, cost.returned, costBefore ? costBefore.returned : null, {
            indent: 1,
            share: true,
          }),
        ]),
    moneyLine(W.costTotal, -cost.total, costBefore ? -costBefore.total : null, {
      bold: true,
      total: true,
      share: true,
    }),
  ];

  // 4. Gross profit by source, with each source's own margin.
  const bySource = profitBySource(row);
  const bySourceBefore = prev ? profitBySource(prev) : null;
  const sourceProfit = (label: Words, key: "store" | "partners" | "services"): XCell[] => {
    const now = bySource[key];
    const before = bySourceBefore?.[key];
    return [
      { value: w(label), indent: 1 },
      { value: roundTo(now.profit, ctx.digits), format: money },
      now.sales > 0 ? pct(now.profit / now.sales) : null,
      before ? { value: roundTo(before.profit, ctx.digits), format: money } : null,
      changeCell(now.profit, before ? before.profit : null, false, true),
    ];
  };

  // 5. Money and counts
  const storeCount = Math.max(0, num(row?.paid_order_count) - num(row?.incubator_sale_count));
  const storeCountBefore = prev
    ? Math.max(0, num(prev.paid_order_count) - num(prev.incubator_sale_count))
    : null;
  const average = (r: Row, count: number) => (count > 0 ? salesBySource(r).store / count : 0);

  // 6. What would make the profit read wrong
  const missingPieces = num(row?.missing_cost_item_count);
  const missingValue = num(row?.missing_cost_exposure);
  const manual = field(row, "missing_product_link_count");

  const headings: XCell[] = [
    { value: "", heading: true },
    { value: w(W.period), heading: true },
    { value: w(W.share), heading: true },
    { value: w(W.previous), heading: true },
    { value: w(W.change), heading: true },
  ];
  const before = (key: keyof ComposedOverviewRow) => (prev ? num(prev[key]) : null);

  return {
    name: w(W.title),
    rtl: ctx.lang === "ar",
    stickyRows: 5,
    widths: [44, 16, 14, 16, 12],
    rows: [
      ...sheetHead(ctx, W.title, W.basis),
      headings,
      ...section(W.sources),
      ...sourceRows,
      ...section(W.profitAndLoss, W.netProfitNote),
      ...statement.map(statementRow),
      ...section(W.costDetail),
      ...costRows,
      ...section(W.bySource, W.bySourceNote),
      sourceProfit(SALES_WORDS.store, "store"),
      ...(input.hasPartners ? [sourceProfit(SALES_WORDS.partners, "partners")] : []),
      ...(hasServices ? [sourceProfit(SALES_WORDS.services, "services")] : []),
      ...section(W.money),
      moneyLine(W.billed, num(row?.paid_order_value), before("paid_order_value"), { indent: 1 }),
      moneyLine(W.delivery, num(row?.shipping_collected), before("shipping_collected"), {
        indent: 1,
      }),
      moneyLine(W.vat, num(row?.vat_collected), before("vat_collected"), { indent: 1 }),
      moneyLine(W.collected, num(row?.collected), before("collected"), { indent: 1 }),
      moneyLine(W.owedCustomers, num(row?.owed_by_customers), before("owed_by_customers"), {
        indent: 1,
      }),
      ...(input.hasPartners
        ? [
            moneyLine(
              W.owedPartners,
              num(row?.incubator_receivables),
              before("incubator_receivables"),
              { indent: 1 },
            ),
          ]
        : []),
      ...section(W.counts),
      countLine(W.storeOrders, storeCount, storeCountBefore),
      ...(input.hasPartners
        ? [
            countLine(
              W.partnerSales,
              num(row?.incubator_sale_count),
              before("incubator_sale_count"),
            ),
          ]
        : []),
      moneyLine(
        W.averageOrder,
        average(row, storeCount),
        prev && storeCountBefore !== null ? average(prev, storeCountBefore) : null,
        { indent: 1 },
      ),
      ...section(W.health, missingPieces || manual ? W.healthNote : undefined),
      ...(missingPieces || manual || !tiny(missingValue)
        ? [
            [{ value: w(W.missingPieces), indent: 1 }, countCell(missingPieces)],
            [
              { value: w(W.missingValue), indent: 1 },
              { value: roundTo(missingValue, ctx.digits), format: money },
            ],
            ...(manual
              ? [[{ value: w(W.manualItems), indent: 1 }, countCell(manual)] as XCell[]]
              : []),
          ]
        : [[{ value: w(W.nothingToCheck), indent: 1 }] as XCell[]]),
    ],
  };
}
