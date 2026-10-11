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
  recordIncubatorPayment,
  recordIncubatorSale,
  returnStockFromIncubator,
  reverseIncubatorSale,
  syncIncubatorPrices,
  updateIncubator,
  updateIncubatorItem,
} from "@/lib/data/incubators";
import { incubatorErrorMessage } from "@/features/incubators/lib/errors";
import {
  incubatorDetails,
  incubatorDetailsProblem,
  itemTerms,
  newIncubatorCurrency,
  paymentDetails,
  returnDetails,
  saleDetails,
  saleProblem,
} from "@/features/incubators/lib/forms";
import {
  filterStock,
  incubatorChips,
  incubatorSummary,
  settlementsByPayment,
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
  const locale = isAr ? "ar-BH" : "en-BH";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<IncubatorDialog>(null);
  const [activeItem, setActiveItem] = useState<StockItem | null>(null);
  const [saleToReverse, setSaleToReverse] = useState<Sale | null>(null);
  const [includeZeroStock, setIncludeZeroStock] = useState(false);
  const [busy, setBusy] = useState(false);
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
      { table: "incubator_sales", brandId: brand.id, queryKey: incubatorsKeys.sales(brand.id) },
      {
        table: "incubator_payments",
        brandId: brand.id,
        queryKey: incubatorsKeys.payments(brand.id),
      },
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
  const summary = useMemo(
    () => incubatorSummary(ownStock, sales, payments),
    [ownStock, sales, payments],
  );
  const chips = useMemo(
    () => incubatorChips(incubators, allStock, allSales),
    [incubators, allStock, allSales],
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
        await returnStockFromIncubator(returnDetails(values, currentId, activeItem));
      } else if (dialog === "payment" && currentId) {
        setBusy(true);
        await recordIncubatorPayment(paymentDetails(values, currentId));
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
    invalidateData,
  };
}

export type IncubatorsPageState = ReturnType<typeof useIncubatorsPage>;
