import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { formatMoney } from "@/lib/format";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { catalogKeys, catalogQueries } from "@/lib/data/catalog";
import {
  createIncubator,
  incubatorsKeys,
  incubatorsQueries,
  invalidateIncubators,
  moveStockBetweenIncubators,
  recordIncubatorPayment,
  recordIncubatorSale,
  returnStockFromIncubator,
  reverseIncubatorSale,
  syncIncubatorPrices,
  updateIncubator,
  updateIncubatorItem,
  voidIncubatorPayment,
} from "@/lib/data/incubators";
import { incubatorErrorMessage } from "@/features/incubators/lib/errors";
import { movePayload, transferLabel, type MoveRow } from "@/features/incubators/lib/move-pieces";
import type { TransferRow } from "@/features/incubators/lib/transfer-sheet";
import {
  incubatorDetails,
  incubatorDetailsProblem,
  itemTerms,
  newIncubatorCurrency,
  returnDetails,
  saleDetails,
  saleProblem,
} from "@/features/incubators/lib/forms";
import {
  filterStock,
  calendarDay,
  incubatorChips,
  incubatorSummary,
  serverSummary,
  settlementsByPayment,
  type ServerSummary,
} from "@/features/incubators/lib/summary";
import type {
  Incubator,
  IncubatorDialog,
  Movement,
  Payment,
  PaymentAllocation,
  Sale,
  StockItem,
} from "@/features/incubators/types";

/** The page's own row types over the typed rows (JSON and joined columns narrowed). */
const asIncubators = (rows: unknown[]) => rows as Incubator[];
const asStock = (rows: unknown[]) => rows as StockItem[];
const asSales = (rows: unknown[]) => rows as Sale[];
const asPayments = (rows: unknown[]) => rows as Payment[];
const asAllocations = (rows: unknown[]) => rows as PaymentAllocation[];
const asTransfers = (rows: unknown[]) => rows as TransferRow[];
/** Each partner's figures from the database, by partner. */
const asSummaries = (rows: Array<Parameters<typeof serverSummary>[0] & { incubator_id: string }>) =>
  new Map<string, ServerSummary>(rows.map((row) => [row.incubator_id, serverSummary(row)]));
const asMovements = (page: { rows: unknown[]; total: number }) => ({
  rows: page.rows as Movement[],
  total: page.total,
});

type Paging = { page: number; size: number };
const FIRST: Paging = { page: 1, size: 10 };
const slice = <T>(rows: T[], paging: Paging) =>
  rows.slice((paging.page - 1) * paging.size, paging.page * paging.size);

/**
 * Everything the partners' page shows and does: the partners, the one that is open, its stock,
 * sales, payments and history, and the actions on them. The components only draw it.
 */
export function useIncubatorsPage() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const language: "ar" | "en" = isAr ? "ar" : "en";
  const { canViewFinancials } = useProfile();
  const qc = useQueryClient();
  // Western digits in both languages, as the rest of the admin writes them (dates read ١٤/١١).
  const locale = isAr ? "ar-BH-u-nu-latn" : "en-BH";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<IncubatorDialog>(null);
  const [activeItem, setActiveItem] = useState<StockItem | null>(null);
  const [saleToReverse, setSaleToReverse] = useState<Sale | null>(null);
  const [paymentToVoid, setPaymentToVoid] = useState<Payment | null>(null);
  const [includeZeroStock, setIncludeZeroStock] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The transfer whose sheet is open (after a send or a move, or from the Transfers tab). */
  const [shownTransferId, setShownTransferId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [stockPaging, setStockPaging] = useState<Paging>(FIRST);
  const [salesPaging, setSalesPaging] = useState<Paging>(FIRST);
  const [paymentsPaging, setPaymentsPaging] = useState<Paging>(FIRST);
  const [movementsPaging, setMovementsPaging] = useState<Paging>({ page: 1, size: 20 });

  useRealtimeInvalidate(
    [
      { table: "incubators", brandId: brand.id, queryKey: incubatorsKeys.list(brand.id) },
      // A partner's count also moves with an order: refresh what orders hold along with it.
      { table: "incubator_inventory", brandId: brand.id, queryKey: incubatorsKeys.all(brand.id) },
      // A sale or a payment recorded elsewhere moves the figures and the settlements too.
      { table: "incubator_sales", brandId: brand.id, queryKey: incubatorsKeys.all(brand.id) },
      { table: "incubator_payments", brandId: brand.id, queryKey: incubatorsKeys.all(brand.id) },
    ],
    `incubators-${brand.id}`,
  );

  const incubatorsQ = useQuery({ ...incubatorsQueries.list(brand.id), select: asIncubators });
  const inventoryQ = useQuery({ ...incubatorsQueries.inventory(brand.id), select: asStock });
  const salesQ = useQuery({ ...incubatorsQueries.sales(brand.id), select: asSales });
  const paymentsQ = useQuery({ ...incubatorsQueries.payments(brand.id), select: asPayments });
  const allocationsQ = useQuery({
    ...incubatorsQueries.allocations(brand.id),
    select: asAllocations,
  });
  const transfersQ = useQuery({ ...incubatorsQueries.transfers(brand.id), select: asTransfers });
  const settingsQ = useQuery(businessSettingsQueries.detail(brand.id));
  // The batch transfer's product list comes from the shared catalog.
  const productsQ = useQuery(catalogQueries.products(brand.id));

  const incubators = useMemo(() => incubatorsQ.data ?? [], [incubatorsQ.data]);
  const currentId = selectedId ?? incubators[0]?.id ?? null;
  const current = incubators.find((item) => item.id === currentId) ?? null;
  const currency = current?.currency || "BHD";
  const money = (amount: number, inCurrency = currency) => formatMoney(amount, inCurrency, locale);

  const movementsQ = useQuery({
    ...incubatorsQueries.movements(
      brand.id,
      currentId ?? "",
      movementsPaging.page,
      movementsPaging.size,
    ),
    select: asMovements,
    // The history is read when its tab is opened, not with every visit to the page.
    enabled: Boolean(currentId) && tab === "history",
  });

  const allStock = useMemo(() => inventoryQ.data ?? [], [inventoryQ.data]);
  const allSales = useMemo(() => salesQ.data ?? [], [salesQ.data]);
  const allPayments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);

  const ownStock = useMemo(
    () => allStock.filter((item) => item.incubator_id === currentId),
    [allStock, currentId],
  );
  const sales = useMemo(
    () => allSales.filter((item) => item.incubator_id === currentId),
    [allSales, currentId],
  );
  const payments = useMemo(
    () => allPayments.filter((item) => item.incubator_id === currentId),
    [allPayments, currentId],
  );
  // The figures are added up by the database, so they do not depend on how many sales this
  // page has loaded; the loaded rows stand in until they arrive.
  const summariesQ = useQuery({
    ...incubatorsQueries.summaries(
      brand.id,
      calendarDay(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ),
    select: asSummaries,
  });
  const serverFigures = currentId ? summariesQ.data?.get(currentId) : undefined;
  const loadedFigures = useMemo(
    () => incubatorSummary(ownStock, sales, payments),
    [ownStock, sales, payments],
  );
  const summary = serverFigures ?? loadedFigures;
  const settlement = serverFigures?.settlement ?? null;
  const chips = useMemo(
    () => incubatorChips(incubators, allStock, allSales, summariesQ.data),
    [incubators, allStock, allSales, summariesQ.data],
  );
  const settlements = useMemo(
    () => settlementsByPayment(allocationsQ.data ?? [], sales),
    [allocationsQ.data, sales],
  );
  const filteredStock = useMemo(
    () =>
      filterStock(
        ownStock.filter((item) => includeZeroStock || Number(item.quantity) > 0),
        search,
      ),
    [ownStock, includeZeroStock, search],
  );

  useEffect(() => setStockPaging((paging) => ({ ...paging, page: 1 })), [currentId, search]);
  useEffect(() => {
    setSalesPaging((paging) => ({ ...paging, page: 1 }));
    setPaymentsPaging((paging) => ({ ...paging, page: 1 }));
    setMovementsPaging((paging) => ({ ...paging, page: 1 }));
  }, [currentId]);

  async function invalidateData() {
    await Promise.all([
      invalidateIncubators(qc, brand.id),
      qc.invalidateQueries({ queryKey: catalogKeys.products(brand.id) }),
      // Transfers, sales and returns change the variants' main stock.
      qc.invalidateQueries({ queryKey: catalogKeys.variants(brand.id) }),
    ]);
  }

  const openDialog = (next: IncubatorDialog, item: StockItem | null = null) => {
    setActiveItem(item);
    setDialog(next);
  };
  const closeDialog = () => {
    setDialog(null);
    setActiveItem(null);
  };

  async function refreshPrices() {
    if (!currentId) return;
    setSyncing(true);
    try {
      const count = await syncIncubatorPrices(currentId);
      await invalidateData();
      toast.success(
        isAr
          ? count > 0
            ? `تم تحديث أسعار ${count} من المنتجات`
            : "الأسعار محدثة مسبقًا"
          : count > 0
            ? `${count} product prices updated`
            : "Prices are already up to date",
      );
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
    } finally {
      setSyncing(false);
    }
  }

  /** Saves whichever form is open. A refusal is said in words and the form stays open. */
  async function submit(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form));
    try {
      if (dialog === "incubator" || dialog === "edit_incubator") {
        const details = incubatorDetails(values);
        const problem = incubatorDetailsProblem(details, language);
        if (problem) return void toast.error(problem);
        setBusy(true);
        if (dialog === "incubator") {
          await createIncubator(brand.id, {
            ...details,
            brand_id: brand.id,
            currency: newIncubatorCurrency(settingsQ.data?.currency, current),
          });
        } else if (currentId) {
          await updateIncubator(brand.id, currentId, {
            ...details,
            is_active: values.is_active === "true",
          });
        }
      } else if (dialog === "edit_item" && activeItem) {
        setBusy(true);
        await updateIncubatorItem(itemTerms(values, activeItem));
      } else if (dialog === "sale" && activeItem && currentId) {
        const sale = saleDetails(values, currentId, activeItem);
        const problem = saleProblem(sale, Number(activeItem.quantity), language);
        if (problem) return void toast.error(problem);
        setBusy(true);
        await recordIncubatorSale(sale);
      } else if (dialog === "return" && activeItem && currentId) {
        setBusy(true);
        const back = await returnStockFromIncubator(returnDetails(values, currentId, activeItem));
        toast.success(
          isAr
            ? `رجعت القطع إلى المحل · ${transferLabel(back.number)}`
            : `Pieces back in the store · ${transferLabel(back.number)}`,
        );
        closeDialog();
        await invalidateData();
        return;
      } else {
        return;
      }
      toast.success(isAr ? "تم حفظ العملية وتحديث المخزون" : "Saved and inventory updated");
      closeDialog();
      await invalidateData();
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Records money the open partner paid; the database spreads it on its oldest unpaid sales.
   * Answers whether it went; a refusal is said in words and the dialog stays open.
   */
  async function recordPayment(payment: {
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference: string | null;
    notes: string | null;
  }) {
    if (!currentId) return false;
    setBusy(true);
    try {
      await recordIncubatorPayment({ incubatorId: currentId, ...payment });
      toast.success(
        isAr
          ? `سُجّلت دفعة ${money(payment.amount)}`
          : `Payment of ${money(payment.amount)} recorded`,
      );
      closeDialog();
      await invalidateData();
      return true;
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reverseSale() {
    if (!saleToReverse) return;
    setBusy(true);
    try {
      await reverseIncubatorSale(saleToReverse.id, "Manual reversal from admin panel");
      toast.success(
        isAr
          ? "تم إلغاء عملية البيع وإعادة البضاعة للمخزون"
          : "Sale reversed and stock restored to incubator",
      );
      setSaleToReverse(null);
      await invalidateData();
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves the chosen pieces from the open partner to another, in one step (a numbered batch).
   * Answers whether it went; a refusal is said in words and the dialog stays open.
   */
  async function movePieces(toId: string, rows: readonly MoveRow[], notes: string) {
    if (!currentId) return false;
    setBusy(true);
    try {
      const moved = await moveStockBetweenIncubators({
        fromIncubatorId: currentId,
        toIncubatorId: toId,
        items: movePayload(rows),
        notes: notes.trim() || null,
      });
      const to = incubators.find((partner) => partner.id === toId)?.name ?? "";
      toast.success(
        isAr
          ? `نُقلت القطع إلى ${to} · ${transferLabel(moved.number)}`
          : `Pieces moved to ${to} · ${transferLabel(moved.number)}`,
      );
      closeDialog();
      await invalidateData();
      // The partner's sheet for the batch opens at once, ready to hand over.
      setShownTransferId(moved.transferId);
      return true;
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ends the partnership with the open partner: marked inactive and no pickups there. Its page,
   * sales, payments and statement stay; it can be turned back on in its settings.
   */
  async function endPartnership() {
    if (!currentId) return false;
    setBusy(true);
    try {
      await updateIncubator(brand.id, currentId, { is_active: false, pickup_enabled: false });
      toast.success(
        isAr
          ? "انتهت الشراكة: المحل موقوف، وسجلّه وحسابه باقيان"
          : "Partnership ended: the partner is inactive; its records and account stay",
      );
      closeDialog();
      await invalidateData();
      return true;
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Takes a payment back; the reason is kept with it. A refusal leaves the dialog open. */
  async function voidPayment(reason: string) {
    if (!paymentToVoid) return;
    setBusy(true);
    try {
      await voidIncubatorPayment(paymentToVoid.id, reason);
      toast.success(
        isAr
          ? "تم إلغاء الدفعة، وعادت مبيعاتها مستحقة"
          : "Payment voided; the sales it settled are due again",
      );
      setPaymentToVoid(null);
      await invalidateData();
    } catch (error) {
      toast.error(incubatorErrorMessage(error, language));
    } finally {
      setBusy(false);
    }
  }

  return {
    brand,
    lang: language,
    isAr,
    locale,
    canViewFinancials,
    storeName: (isAr ? brand.name_ar : null) || brand.name_en || "",
    money,
    currency,
    loading: incubatorsQ.isLoading || inventoryQ.isLoading || salesQ.isLoading,
    failed: incubatorsQ.isError || inventoryQ.isError || salesQ.isError || paymentsQ.isError,
    retry: () => void invalidateData(),

    incubators,
    chips,
    current,
    currentId,
    select: setSelectedId,
    tab,
    setTab,

    allStock,
    summary,
    settlement,
    search,
    setSearch,
    includeZeroStock,
    setIncludeZeroStock,
    filteredStock,
    pagedStock: slice(filteredStock, stockPaging),
    stockPaging,
    setStockPaging,

    sales,
    pagedSales: slice(sales, salesPaging),
    salesPaging,
    setSalesPaging,

    payments,
    pagedPayments: slice(payments, paymentsPaging),
    paymentsPaging,
    setPaymentsPaging,
    settlements,

    movements: movementsQ.data?.rows ?? [],
    movementsTotal: movementsQ.data?.total ?? 0,
    movementsLoading: movementsQ.isLoading,
    movementsPaging,
    setMovementsPaging,

    products: productsQ.data ?? [],
    dialog,
    activeItem,
    openDialog,
    closeDialog,
    busy,
    syncing,
    submit,
    refreshPrices,
    saleToReverse,
    setSaleToReverse,
    reverseSale,
    paymentToVoid,
    setPaymentToVoid,
    voidPayment,
    movePieces,
    recordPayment,
    endPartnership,
    transfers: transfersQ.data ?? [],
    transfersLoading: transfersQ.isLoading,
    shownTransferId,
    showTransfer: setShownTransferId,
    invalidateData,
  };
}

export type IncubatorsPageState = ReturnType<typeof useIncubatorsPage>;
