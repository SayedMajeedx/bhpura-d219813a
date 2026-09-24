import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef, lazy } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Printer, Receipt, Link as LinkIcon, MoreHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { useT, useI18n } from "@/lib/i18n";
import { getOrderCustomerPhone } from "@/lib/order-customer-snapshot";
import { cn } from "@/lib/utils";
import { resolvePaymentStatus, type PaymentBadge } from "@/lib/payment-status";
import { ManagePaymentModal } from "@/components/orders/ManagePaymentModal";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useProfile } from "@/lib/profile-context";
import { OrderUnifiedHeader } from "@/components/orders/OrderUnifiedHeader";
import { OrderStickyBottomBar } from "@/components/orders/OrderStickyBottomBar";
import { OrderSalesDocumentsCard } from "@/components/orders/OrderSalesDocumentsCard";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import type { Order, OrderItem as Item } from "@/features/orders/types";
import {
  filterCustomers,
  isOrderDirty,
  normalizeOrderMin,
  isUntouchedDraft,
  newDraftOrder,
  orderItemFromRow,
  orderTotals,
  promoSignature,
} from "@/features/orders/lib/order-editor";
import { useOrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { useBenefitReview } from "@/features/orders/hooks/use-benefit-review";
import { useCustomerFitPassport } from "@/features/orders/hooks/use-customer-fit-passport";
import { ProductSearchDialog } from "@/features/orders/components/ProductSearchDialog";
import { useCancelOrderEdit } from "@/features/orders/hooks/use-cancel-order-edit";
import { useOrderPromoCode } from "@/features/orders/hooks/use-order-promo-code";
import { useSaveOrder } from "@/features/orders/hooks/use-save-order";
import { useOrderPaymentDetails } from "@/features/orders/hooks/use-order-payment-details";
import { useOrderLineActions } from "@/features/orders/hooks/use-order-line-actions";
import { createOrderDocumentActions } from "@/features/orders/actions/order-document-actions";
import { createOrderStatusChange } from "@/features/orders/actions/order-status-change";
import { OrderMobileSectionNav } from "@/features/orders/components/OrderMobileSectionNav";
import { OrderDesktopSectionNav } from "@/features/orders/components/OrderDesktopSectionNav";
import { OrderInvoiceSection } from "@/features/orders/components/OrderInvoiceSection";
import { OrderActivitySection } from "@/features/orders/components/OrderActivitySection";
import { OutOfStockConfirmDialog } from "@/features/orders/components/OutOfStockConfirmDialog";
import { NewCustomerDialog } from "@/features/orders/components/NewCustomerDialog";
import { renderOrderPrimaryAction } from "@/features/orders/components/order-primary-action";
import { OrderCustomerCard } from "@/features/orders/components/OrderCustomerCard";
import { OrderItemsCard } from "@/features/orders/components/OrderItemsCard";
import { OrderFinancialCard } from "@/features/orders/components/OrderFinancialCard";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/$id")({
  component: OrderDetail,
  errorComponent: OrderErrorBoundary,
  notFoundComponent: () => <OrderErrorBoundary />,
});

function OrderErrorBoundary({ error }: { error?: Error }) {
  const { slug } = Route.useParams();
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-8 text-center space-y-3">
        <h2 className="text-xl font-display">Order</h2>
        <p className="text-muted-foreground">
          {error?.message || "This order could not be loaded. It may have been deleted."}
        </p>
        <Link to="/admin/b/$slug/orders" params={{ slug }} className="text-primary underline">
          ← Back to orders
        </Link>
      </Card>
    </div>
  );
}

// ItemTailoringCustomizer extracted to @/addons/made-to-order via <AddonSlot placement="admin.order.itemPanel" />

function OrderDetail() {
  const t = useT();
  const { lang } = useI18n();
  const { id, slug } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const brand = useBrand();
  const { isAdmin, isCourier } = useProfile();
  const brandId = brand.id;
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const addonDefaults = variantAxisDefaultsFrom(storeProfile.addons, storeProfile.vertical);
  const { vocabulary } = useVocabulary();
  const {
    orderQ,
    productsQ,
    variantsQ,
    bomItemsQ,
    packagingMaterialsQ,
    customersQ,
    couriersQ,
    addressesQ,
    receiptViewQ,
    branchesQ,
    customQ,
    settingsQ,
  } = useOrderDetailData({ id, brandId, isCourier, isAdmin });
  const {
    approvingBenefit,
    rejectingBenefit,
    rejectReasonOpen,
    setRejectReasonOpen,
    rejectReason,
    setRejectReason,
    approveBenefitPayment,
    rejectBenefitPayment,
  } = useBenefitReview({ id, brandId, lang, orderQ });

  const [waModalOpen, setWaModalOpen] = useState(false);

  const assignCourier = async (courierId: string) => {
    const { error } = await (supabase.rpc as any)("assign_order_courier", {
      p_order_id: id,
      p_courier_id: courierId === "unassigned" ? null : courierId,
    });
    if (error) return toast.error(error.message);
    toast.success(lang === "ar" ? "تم تحديث مندوب التوصيل" : "Courier assignment updated");
    await orderQ.refetch();

    if (courierId !== "unassigned") {
      setWaModalOpen(true);
    }
  };

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const customerPassportQ = useCustomerFitPassport({
    brandId,
    customerId: order?.customer_id,
    enabled: Boolean(storeProfile.modules.fit_passport) && !isCourier,
  });
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const {
    addItem,
    cameraStreamPromise,
    filteredVariantsForSearch,
    handleScanned,
    handleSelectVariantFromModal,
    openBarcodeScanner,
    outOfStockConfirmVariant,
    pickVariant,
    productSearchOpen,
    productSearchQuery,
    scannerOpen,
    setOutOfStockConfirmVariant,
    setProductSearchOpen,
    setProductSearchQuery,
    setScannerOpen,
    toggleCustom,
    updateItem,
  } = useOrderLineActions({
    addonDefaults,
    items,
    lang,
    productsQ,
    setItems,
    variantsQ,
  });

  const filteredCustomers = useMemo(
    () => filterCustomers(customersQ.data ?? [], customerSearchQuery),
    [customersQ.data, customerSearchQuery],
  );
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => Promise<unknown>>(async () => undefined);
  useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [activeSection, setActiveSection] = useState<string>("sec-overview");

  useEffect(() => {
    if (!order?.id) return;
    const scrollContainer = document.querySelector(".os-scrollbar");
    const sectionIds = [
      "sec-overview",
      "sec-items",
      "sec-documents",
      "sec-invoice",
      "sec-activity",
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { root: scrollContainer, rootMargin: "-60px 0px -50% 0px", threshold: 0.1 },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [order?.id]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const initialSnapshotRef = useRef<{ order: any; items: Item[] } | null>(null);

  useEffect(() => {
    if (id !== "new" || order || !settingsQ.data) return;
    const draft = newDraftOrder(settingsQ.data, brandId, new Date().toISOString().slice(0, 10));
    setOrder(draft);
    initialSnapshotRef.current = { order: draft, items: [] };
  }, [brandId, id, order, settingsQ.data]);

  const isDirty = useMemo(
    () => isOrderDirty(initialSnapshotRef.current, order, items),
    [items, order],
  );

  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    id: string;
    amount: number;
  } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [discountMode, setDiscountMode] = useState<"fixed" | "percent">("fixed");
  const [discountPercentInput, setDiscountPercentInput] = useState<string>("");
  const [lastNonZeroTaxRate, setLastNonZeroTaxRate] = useState<number>(10);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const promoContextRef = useRef<string | null>(null);

  const serverOrder = orderQ.data as any;
  const isBlankDraft = id === "new" || isUntouchedDraft(serverOrder);

  useEffect(() => {
    if (orderQ.data) {
      // Prevent background query revalidations from overwriting unsaved local edits
      if (
        initialSnapshotRef.current &&
        (initialSnapshotRef.current.order as any)?.id === id &&
        isDirty
      )
        return;

      setOrder(orderQ.data);
      const loadedItems = (orderQ.data.order_items ?? []).map(orderItemFromRow);

      // Check localStorage for uncommitted draft backup
      const cacheKey = `boutq_draft_${brandId}_${id}`;
      try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr && (id === "new" || isBlankDraft)) {
          const cached = JSON.parse(cachedStr);
          if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
            setItems(cached.items);
            if (cached.order) setOrder((prev: any) => ({ ...prev, ...cached.order }));
            toast.info(
              lang === "ar"
                ? "تم استعادة مسودتك الأخيرة تلقائياً!"
                : "Restored your unsaved draft!",
            );
            return;
          }
        }
      } catch (_e) {
        // ignore cache read errors
      }

      setItems(loadedItems);

      initialSnapshotRef.current = {
        order: normalizeOrderMin(orderQ.data),
        items: loadedItems,
      };

      promoContextRef.current = promoSignature((orderQ.data as any).customer_id, loadedItems);
      setEditingUnlocked(false);
      const savedPromo = (orderQ.data as any).promo_code;
      setPromoInput(savedPromo ?? "");
      setAppliedPromo(
        savedPromo
          ? {
              code: savedPromo,
              id: (orderQ.data as any).promo_code_id ?? "",
              amount: Number((orderQ.data as any).discount ?? 0),
            }
          : null,
      );
    }
  }, [orderQ.data, brandId, id, isBlankDraft, isDirty, lang]);

  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      initialSnapshotRef.current = null;
      setOrder(null);
      setItems([]);
      setHasSavedDraft(false);
    }
  }, [id]);

  // Auto-save unsaved draft state to localStorage
  useEffect(() => {
    if (id === "new" || isBlankDraft) {
      const cacheKey = `boutq_draft_${brandId}_${id}`;
      if (items.length > 0 || order?.customer_id) {
        localStorage.setItem(cacheKey, JSON.stringify({ order, items, updatedAt: Date.now() }));
      }
    }
  }, [items, order, brandId, id, isBlankDraft]);

  // Backfill the tenant's flat delivery fee for untouched draft orders that
  // were created before the list-page initializer loaded the setting.
  useEffect(() => {
    if (
      !order ||
      !settingsQ.data ||
      order.fulfillment_method !== "delivery" ||
      Number(order.shipping ?? 0) !== 0
    )
      return;
    const source = orderQ.data as any;
    const untouchedDraft = isUntouchedDraft(source);
    const configuredFee = Number((settingsQ.data as any).delivery_fee ?? 0);
    if (untouchedDraft && configuredFee > 0)
      setOrder((current: any) => (current ? { ...current, shipping: configuredFee } : current));
  }, [order, orderQ.data, settingsQ.data]);

  const totals = useMemo(
    () =>
      orderTotals(
        items,
        {
          discount: order?.discount,
          shipping: order?.shipping,
          tax_rate: order?.tax_rate,
          advance_paid: order?.advance_paid,
        },
        Boolean((settingsQ.data as any)?.vat_inclusive),
      ),
    [items, order?.discount, order?.shipping, order?.tax_rate, order?.advance_paid, settingsQ.data],
  );

  useEffect(() => {
    const signature = promoSignature(order?.customer_id, items);
    if (promoContextRef.current === null) {
      promoContextRef.current = signature;
      return;
    }
    if (promoContextRef.current !== signature) {
      promoContextRef.current = signature;
      if (appliedPromo) {
        setAppliedPromo(null);
        setPromoInput("");
        setOrder((current: any) =>
          current ? { ...current, discount: 0, promo_code: null, promo_code_id: null } : current,
        );
        toast.info(
          lang === "ar"
            ? "تمت إزالة رمز الخصم بعد تغيير العميل أو المنتجات."
            : "Promo code removed after the customer or items changed.",
        );
      }
    }
  }, [items, order?.customer_id, appliedPromo, lang]);

  const { applyAdminPromo, removeAdminPromo } = useOrderPromoCode({
    brand,
    items,
    lang,
    order,
    promoInput,
    setAppliedPromo,
    setCheckingPromo,
    setOrder,
    setPromoInput,
    totals,
  });

  const paymentBadge: PaymentBadge = useMemo(
    () =>
      resolvePaymentStatus(order?.payment_status, order?.status, totals.total, totals.advancePaid),
    [order?.payment_status, order?.status, totals.total, totals.advancePaid],
  );

  const [managePaymentOpen, setManagePaymentOpen] = useState(false);
  const [isEditingFees, setIsEditingFees] = useState(false);
  const [editingItems] = useState<Record<number, boolean>>({});
  const [mobileTab, setMobileTab] = useState<"items" | "customer" | "activity">("items");
  const [editingItemSheetIdx, setEditingItemSheetIdx] = useState<number | null>(null);

  const { handleSavePaymentDetails } = useOrderPaymentDetails({
    brandId,
    initialSnapshotRef,
    order,
    orderQ,
    qc,
    setOrder,
  });

  const currency = order?.currency ?? "BHD";
  const isClosedOrder = serverOrder?.status === "completed" || serverOrder?.status === "paid";
  const isCreationMode = isBlankDraft && !hasSavedDraft;
  const isReadOnly = !isCreationMode && !editingUnlocked;
  const canUnlockEditing = !isCourier && (isAdmin || !isClosedOrder);

  const { cancelEditing } = useCancelOrderEdit({
    initialSnapshotRef,
    isDirty,
    lang,
    orderQ,
    setAppliedPromo,
    setEditingItemSheetIdx,
    setEditingUnlocked,
    setIsEditingFees,
    setItems,
    setOrder,
    setPromoInput,
  });

  const { save } = useSaveOrder({
    appliedPromo,
    brandId,
    currency,
    id,
    initialSnapshotRef,
    isReadOnly,
    items,
    lang,
    order,
    orderQ,
    qc,
    router,
    setEditingUnlocked,
    setHasSavedDraft,
    setItems,
    setOrder,
    setSaving,
    slug,
    t,
    totals,
  });
  saveRef.current = save;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!isReadOnly && !saving) {
          void saveRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isReadOnly,
    saving,
    order,
    items,
    totals,
    appliedPromo,
    currency,
    settingsQ.data,
    variantsQ.data,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !isReadOnly && !saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isReadOnly, saving]);

  if (orderQ.isError) {
    const rawErr =
      orderQ.error instanceof Error ? orderQ.error.message : String(orderQ.error ?? "");
    const localizedErr =
      rawErr.includes("Cannot read properties of null") || rawErr.includes("customer_id")
        ? lang === "ar"
          ? "جاري إعداد بيانات الطلب..."
          : "Loading order details..."
        : lang === "ar"
          ? "تأكد من وجود الطلب ثم حاول مرة أخرى."
          : "Please confirm this order exists and try again.";

    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-8">
        <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6 space-y-4">
          <h1 className="text-xl font-semibold">
            {lang === "ar" ? "تعذر فتح الطلب" : "Unable to open this order"}
          </h1>
          <p className="text-sm text-muted-foreground">{localizedErr}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void orderQ.refetch()}>
              {lang === "ar" ? "إعادة المحاولة" : "Try again"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/b/$slug/orders" params={{ slug }}>
                {lang === "ar" ? "العودة إلى الطلبات" : "Back to orders"}
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!order || settingsQ.isPending || !settingsQ.data)
    return (
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );

  const { copyLink, handlePrintA4, printReceipt } = createOrderDocumentActions({
    order,
    items,
    t,
    lang,
    settingsQ,
    productsQ,
    storeProfile,
    totals,
    currency,
  });

  const renderTopPrimaryAction = () =>
    renderOrderPrimaryAction({
      approveBenefitPayment,
      approvingBenefit,
      brandId,
      isCreationMode,
      isReadOnly,
      items,
      lang,
      order,
      orderQ,
      qc,
      storeProfile,
      vocabulary,
    });

  const handleDirectOrderStatusChange = createOrderStatusChange({
    order,
    lang,
    orderQ,
    qc,
    brandId,
  });

  return (
    <>
      <div
        className="mx-auto max-w-[1500px] space-y-3 p-1 pb-24 sm:space-y-4 sm:p-2 sm:pb-12 md:pb-12 lg:pb-8 animate-fade-in"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        {/* 1. Unified Status Header */}
        <OrderUnifiedHeader
          lang={lang}
          slug={slug}
          order={order}
          items={items}
          totals={totals}
          isCreationMode={isCreationMode}
          isReadOnly={isReadOnly}
          isEditing={editingUnlocked}
          canUnlockEditing={canUnlockEditing}
          isDirty={isDirty}
          saving={saving}
          paymentBadge={paymentBadge}
          onSave={save}
          onUnlock={() => setEditingUnlocked(true)}
          onCancelEditing={cancelEditing}
          onPrintReceipt={printReceipt}
          onPrintA4={handlePrintA4}
          onCopyLink={copyLink}
          onOpenPaymentModal={() => setManagePaymentOpen(true)}
          onUpdateOrderStatus={handleDirectOrderStatusChange}
          renderPrimaryAction={renderTopPrimaryAction}
        >
          {!isCreationMode && (
            <SendInvoiceDialog
              order={order}
              totals={totals}
              settings={settingsQ.data}
              currency={currency}
            />
          )}
        </OrderUnifiedHeader>

        {/* Payment Lifecycle Modal */}
        <ManagePaymentModal
          open={managePaymentOpen}
          onOpenChange={setManagePaymentOpen}
          lang={lang}
          currency={currency}
          order={order}
          totals={{
            total: totals.total,
            advancePaid: totals.advancePaid,
            balanceDue: totals.remaining,
          }}
          onSavePayment={handleSavePaymentDetails}
        />

        {/* Mobile workflow navigation. Creation mode must expose customer details too. */}
        <OrderMobileSectionNav
          isCreationMode={isCreationMode}
          lang={lang}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
        />

        {/* Desktop Section Navigation Bar (≥ 768px) */}
        {!isCreationMode && (
          <OrderDesktopSectionNav
            activeSection={activeSection}
            isDirty={isDirty}
            isReadOnly={isReadOnly}
            lang={lang}
            save={save}
            saving={saving}
            scrollToSection={scrollToSection}
          />
        )}

        {/* Editor - hidden on print */}
        <fieldset
          disabled={isReadOnly}
          className="no-print m-0 min-w-0 border-0 p-0 disabled:opacity-80"
        >
          <div className="mb-6 grid grid-cols-1 items-start gap-3 sm:gap-6 lg:grid-cols-3">
            {/* RIGHT COLUMN (35% width) - Customer, Address & Workflow Controls */}
            <div
              className={cn(
                "space-y-3 sm:space-y-6 lg:col-span-1",
                mobileTab !== "customer" && "hidden sm:block",
              )}
            >
              <OrderCustomerCard
                addressesQ={addressesQ}
                assignCourier={assignCourier}
                branchesQ={branchesQ}
                couriersQ={couriersQ}
                customerPickerOpen={customerPickerOpen}
                customerSearchQuery={customerSearchQuery}
                customersQ={customersQ}
                filteredCustomers={filteredCustomers}
                isAdmin={isAdmin}
                isCreationMode={isCreationMode}
                isReadOnly={isReadOnly}
                lang={lang}
                order={order}
                setCustomerPickerOpen={setCustomerPickerOpen}
                setCustomerSearchQuery={setCustomerSearchQuery}
                setNewCustomerOpen={setNewCustomerOpen}
                setOrder={setOrder}
                setWaModalOpen={setWaModalOpen}
                settingsQ={settingsQ}
                t={t}
              />
            </div>

            {/* LEFT COLUMN (65% width) - Products, Line Items & Notes */}
            <div className="space-y-3 sm:space-y-6 lg:col-span-2">
              <OrderItemsCard
                addItem={addItem}
                addonDefaults={addonDefaults}
                cameraStreamPromise={cameraStreamPromise}
                currency={currency}
                customQ={customQ}
                customerPassportQ={customerPassportQ}
                editingItemSheetIdx={editingItemSheetIdx}
                editingItems={editingItems}
                handleScanned={handleScanned}
                items={items}
                lang={lang}
                mobileTab={mobileTab}
                openBarcodeScanner={openBarcodeScanner}
                pickVariant={pickVariant}
                productsQ={productsQ}
                scannerOpen={scannerOpen}
                setEditingItemSheetIdx={setEditingItemSheetIdx}
                setItems={setItems}
                setProductSearchOpen={setProductSearchOpen}
                setScannerOpen={setScannerOpen}
                storeProfile={storeProfile}
                t={t}
                toggleCustom={toggleCustom}
                updateItem={updateItem}
                variantsQ={variantsQ}
                vocabulary={vocabulary}
              />

              <div className="lg:hidden">
                <Label>{t("orderDetail.notes")}</Label>
                <Textarea
                  value={order.notes ?? ""}
                  onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                  rows={5}
                />
              </div>
              <OrderFinancialCard
                appliedPromo={appliedPromo}
                applyAdminPromo={applyAdminPromo}
                approveBenefitPayment={approveBenefitPayment}
                approvingBenefit={approvingBenefit}
                bomItemsQ={bomItemsQ}
                checkingPromo={checkingPromo}
                currency={currency}
                discountMode={discountMode}
                discountPercentInput={discountPercentInput}
                isEditingFees={isEditingFees}
                isReadOnly={isReadOnly}
                items={items}
                lang={lang}
                lastNonZeroTaxRate={lastNonZeroTaxRate}
                mobileTab={mobileTab}
                order={order}
                packagingMaterialsQ={packagingMaterialsQ}
                paymentBadge={paymentBadge}
                productsQ={productsQ}
                promoInput={promoInput}
                receiptViewQ={receiptViewQ}
                rejectBenefitPayment={rejectBenefitPayment}
                rejectReason={rejectReason}
                rejectReasonOpen={rejectReasonOpen}
                rejectingBenefit={rejectingBenefit}
                removeAdminPromo={removeAdminPromo}
                setDiscountMode={setDiscountMode}
                setDiscountPercentInput={setDiscountPercentInput}
                setIsEditingFees={setIsEditingFees}
                setLastNonZeroTaxRate={setLastNonZeroTaxRate}
                setManagePaymentOpen={setManagePaymentOpen}
                setOrder={setOrder}
                setPromoInput={setPromoInput}
                setRejectReason={setRejectReason}
                setRejectReasonOpen={setRejectReasonOpen}
                t={t}
                totals={totals}
                variantsQ={variantsQ}
              />
            </div>
          </div>
        </fieldset>

        {/* Unified Sales Documents Chain */}
        {!isCreationMode && order && (
          <div className="no-print mb-6">
            <OrderSalesDocumentsCard
              order={order}
              items={items.map((it) => ({
                ...it,
                product: (productsQ.data ?? []).find((p: any) => p.id === it.product_id),
              }))}
              brand={brand}
              settings={settingsQ.data}
              currency={currency}
              lang={lang}
              slug={slug}
              onPrintThermalReceipt={printReceipt}
              onPrintInvoice={() => window.print()}
            />
          </div>
        )}

        {/* Invoice Preview Section Anchor */}
        <OrderInvoiceSection
          addressesQ={addressesQ}
          invoicePreviewOpen={invoicePreviewOpen}
          items={items}
          lang={lang}
          mobileTab={mobileTab}
          order={order}
          paymentBadge={paymentBadge}
          productsQ={productsQ}
          setInvoicePreviewOpen={setInvoicePreviewOpen}
          settingsQ={settingsQ}
          storeProfile={storeProfile}
          totals={totals}
        />

        {/* Activity Trail Section Anchor */}
        <OrderActivitySection brand={brand} lang={lang} mobileTab={mobileTab} order={order} />

        <Dialog open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
          <DialogContent
            closeLabel={lang === "ar" ? "إغلاق" : "Close"}
            className="top-auto bottom-0 w-full max-w-none translate-y-0 rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:hidden"
          >
            <DialogHeader>
              <DialogTitle>{lang === "ar" ? "إجراءات الطلب" : "Order actions"}</DialogTitle>
              <DialogDescription>
                {lang === "ar"
                  ? "أدوات الفاتورة والمشاركة والطباعة"
                  : "Invoice, sharing and printing tools"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              {order.public_invoice_token && (
                <Button
                  variant="outline"
                  className="min-h-12 justify-start rounded-xl"
                  onClick={() => {
                    copyLink();
                    setMobileActionsOpen(false);
                  }}
                >
                  <LinkIcon className="me-2 h-4 w-4" />
                  {t("orders.copyLink")}
                </Button>
              )}
              <Button
                variant="outline"
                className="min-h-12 justify-start rounded-xl"
                onClick={() => {
                  printReceipt();
                  setMobileActionsOpen(false);
                }}
              >
                <Receipt className="me-2 h-4 w-4" />
                {t("orders.printReceipt")}
              </Button>
              <Button
                variant="outline"
                className="min-h-12 justify-start rounded-xl"
                onClick={() => {
                  setMobileActionsOpen(false);
                  setInvoicePreviewOpen(true);
                  window.setTimeout(() => scrollToSection("sec-invoice"), 100);
                }}
              >
                <Printer className="me-2 h-4 w-4" />
                {lang === "ar" ? "معاينة وتنزيل الفاتورة" : "Preview and download invoice"}
              </Button>
              <Button
                variant="outline"
                className="min-h-12 justify-start rounded-xl"
                onClick={() => {
                  setMobileActionsOpen(false);
                  window.setTimeout(() => scrollToSection("sec-activity"), 100);
                }}
              >
                <MoreHorizontal className="me-2 h-4 w-4" />
                {lang === "ar" ? "عرض سجل النشاطات" : "View activity history"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <CourierWhatsAppModal
          isOpen={waModalOpen}
          onClose={() => setWaModalOpen(false)}
          order={orderQ.data || order}
          courier={
            (couriersQ.data ?? []).find((c: any) => c.id === order.assigned_to) ||
            (order.assigned_profile as any) ||
            null
          }
          brandSlug={slug}
          lang={lang}
          onNotified={() => orderQ.refetch()}
        />

        {/* Product Search & Autocomplete Modal */}
        <ProductSearchDialog
          open={productSearchOpen}
          onOpenChange={setProductSearchOpen}
          query={productSearchQuery}
          onQueryChange={setProductSearchQuery}
          results={filteredVariantsForSearch}
          products={productsQ.data ?? []}
          currency={currency}
          lang={lang}
          onSelect={(v) => handleSelectVariantFromModal(v)}
        />

        {/* Out-of-stock Variant Confirmation Dialog */}
        <OutOfStockConfirmDialog
          variant={outOfStockConfirmVariant}
          onClose={() => setOutOfStockConfirmVariant(null)}
          onConfirm={(variant) => handleSelectVariantFromModal(variant, true)}
          lang={lang}
        />

        {/* Inline New Customer Dialog */}
        <NewCustomerDialog
          open={newCustomerOpen}
          onOpenChange={setNewCustomerOpen}
          brandId={(settingsQ.data as any)?.brand_id || (brand as any)?.id}
          lang={lang}
          onCreated={(customerId, addressId) =>
            setOrder({
              ...order,
              customer_id: customerId,
              shipping_address_id: addressId,
            })
          }
        />
      </div>

      {/* 5. Mobile Thumb-Zone Sticky Bottom Bar (<768px) - OUTSIDE animated scroll view */}
      <OrderStickyBottomBar
        lang={lang}
        primaryAction={renderTopPrimaryAction()}
        isDirty={isDirty}
        isCreationMode={isCreationMode}
        isReadOnly={isReadOnly}
        canUnlockEditing={canUnlockEditing}
        saving={saving}
        customerPhone={getOrderCustomerPhone(order)}
        onSave={save}
        onUnlock={() => setEditingUnlocked(true)}
        onPrintReceipt={printReceipt}
        onPrintA4={handlePrintA4}
        onCopyLink={copyLink}
        sendInvoiceDialogTrigger={
          !isCreationMode ? (
            <SendInvoiceDialog
              order={order}
              totals={totals}
              settings={settingsQ.data}
              currency={currency}
            />
          ) : null
        }
      />
    </>
  );
}

const SendInvoiceDialog = lazy(() => import("@/components/orders/SendInvoiceDialog"));
