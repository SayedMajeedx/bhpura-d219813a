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
import {
  Check,
  Printer,
  Save,
  Receipt,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  UserRound,
  Package,
  CreditCard,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { formatOrderStatus } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { getOrderCustomerName, getOrderCustomerPhone } from "@/lib/order-customer-snapshot";
import { printThermalReceipt } from "@/lib/thermal-print";
import { cn, getFriendlyErrorMessage } from "@/lib/utils";
import { resolvePaymentStatus, type PaymentBadge } from "@/lib/payment-status";
import { logActivity, logActivityBatch } from "@/lib/activity-log";
import { ManagePaymentModal } from "@/components/orders/ManagePaymentModal";
import { ActivityLogList } from "@/components/activity-log-list";
import { useBrand } from "@/lib/brand-context";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useProfile } from "@/lib/profile-context";
import { getFulfillmentLabel } from "@/lib/status-labels";
import { OrderUnifiedHeader } from "@/components/orders/OrderUnifiedHeader";
import { OrderStickyBottomBar } from "@/components/orders/OrderStickyBottomBar";
import { OrderSalesDocumentsCard } from "@/components/orders/OrderSalesDocumentsCard";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import type { Order, OrderItem as Item, SavedAddress } from "@/features/orders/types";
import {
  blankOrderItem,
  filterCustomers,
  filterVariantsForSearch,
  isOrderDirty,
  normalizeOrderMin,
  isUntouchedDraft,
  newDraftOrder,
  orderItemFromRow,
  orderTotals,
  promoFailureMessage,
  promoSignature,
  recalcOrderItem,
} from "@/features/orders/lib/order-editor";
import {
  haveOrderItemsChanged,
  orderChangeLogs,
  orderItemRow,
  orderSaveBlocker,
  orderSavePayload,
} from "@/features/orders/lib/order-save";
import { useOrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { useBenefitReview } from "@/features/orders/hooks/use-benefit-review";
import { useCustomerFitPassport } from "@/features/orders/hooks/use-customer-fit-passport";
import { ProductSearchDialog } from "@/features/orders/components/ProductSearchDialog";
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
  const [outOfStockConfirmVariant, setOutOfStockConfirmVariant] = useState<any | null>(null);

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
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [discountMode, setDiscountMode] = useState<"fixed" | "percent">("fixed");
  const [discountPercentInput, setDiscountPercentInput] = useState<string>("");
  const [lastNonZeroTaxRate, setLastNonZeroTaxRate] = useState<number>(10);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const promoContextRef = useRef<string | null>(null);

  const filteredVariantsForSearch = useMemo(
    () => filterVariantsForSearch(variantsQ.data ?? [], productsQ.data ?? [], productSearchQuery),
    [productSearchQuery, variantsQ.data, productsQ.data],
  );

  const handleSelectVariantFromModal = (variant: any, force = false) => {
    const mainStock = Number(variant.stock_main ?? 0);
    const incStock = Number(variant.stock_incubator ?? 0);
    const fallbackStock = Number(variant.stock ?? variant.quantity ?? 0);
    const totalStock = mainStock + incStock > 0 ? mainStock + incStock : fallbackStock;

    if (!force && totalStock <= 0) {
      setOutOfStockConfirmVariant(variant);
      return;
    }

    const p = (productsQ.data ?? []).find((x: any) => x.id === variant.product_id);
    const isAr = lang === "ar";
    const axes = resolveAllVariantAxes({
      product: p,
      addonDefaults,
      lang: isAr ? "ar" : "en",
    });
    const variantTitle = [
      p ? (p as any).name : "",
      variant.size && axes.size.visible ? `${axes.size.label}: ${variant.size}` : "",
      variant.color && axes.color.visible ? `${axes.color.label}: ${variant.color}` : "",
      variant.fabric && axes.fabric.visible ? `${axes.fabric.label}: ${variant.fabric}` : "",
    ]
      .filter(Boolean)
      .join(" — ");
    const price = Number(
      variant.selling_price ??
        variant.price_override ??
        variant.price ??
        (p as any)?.selling_price ??
        (p as any)?.base_price ??
        (p as any)?.price ??
        0,
    );
    const preferredLoc: "main" | "incubator" = (variant.stock_main ?? 0) > 0 ? "main" : "incubator";

    setItems((prev) => [
      ...prev,
      {
        product_id: variant.product_id,
        variant_id: variant.id,
        description: variantTitle || "Custom Item",
        quantity: 1,
        unit_price: price,
        unit_cost: (variant as any).cost_price == null ? null : Number((variant as any).cost_price),
        original_price: price,
        customizations: [],
        customization_total: 0,
        line_total: price,
        location: preferredLoc,
        selected_variant: variant,
      },
    ]);
    toast.success(
      isAr ? `تمت إضافة "${variantTitle}" إلى الطلب!` : `Added "${variantTitle}" to order!`,
    );
    setProductSearchOpen(false);
    setProductSearchQuery("");
  };

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

  const applyAdminPromo = async () => {
    if (!order) return;
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(lang === "ar" ? "أدخل رمز الخصم." : "Enter a promo code.");
    if (!items.length || totals.subtotal <= 0)
      return toast.error(
        lang === "ar" ? "أضف منتجات إلى الطلب أولاً." : "Add products to the order first.",
      );
    setCheckingPromo(true);
    const { data, error } = await supabase.rpc("validate_promo_code" as any, {
      p_brand_slug: brand.slug,
      p_code: code,
      p_subtotal: totals.subtotal,
      p_items: items.map((item) => ({
        variant_id: item.variant_id,
        line_total: Number(item.line_total.toFixed(3)),
      })),
      p_customer_id: order.customer_id ?? null,
    });
    setCheckingPromo(false);
    if (error)
      return toast.error(
        error.message ||
          (lang === "ar" ? "تعذر التحقق من الرمز." : "Could not validate this promo code."),
      );
    const result = data as any;
    if (!result?.valid) return toast.error(promoFailureMessage(result, lang));
    const amount = Number(result.discount_amount ?? 0);
    const active = { code: String(result.code), id: String(result.promo_code_id), amount };
    setPromoInput(active.code);
    setAppliedPromo(active);
    setOrder({ ...order, discount: amount, promo_code: active.code, promo_code_id: active.id });
    toast.success(lang === "ar" ? "تم تطبيق رمز الخصم." : "Promo code applied.");
  };

  const removeAdminPromo = () => {
    if (!order) return;
    setAppliedPromo(null);
    setPromoInput("");
    setOrder({ ...order, discount: 0, promo_code: null, promo_code_id: null });
  };

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

  const handleSavePaymentDetails = async (updatedFields: {
    payment_status: PaymentBadge;
    payment_method: string;
    advance_paid: number;
    payment_reference?: string;
  }) => {
    if (!order) return;
    const oldStatus = order.payment_status;
    const oldMethod = order.payment_method;
    const oldAdvance = order.advance_paid;

    const finalMethod =
      !updatedFields.payment_method || updatedFields.payment_method === "unspecified"
        ? null
        : updatedFields.payment_method;

    const nextOrder = {
      ...order,
      payment_status: updatedFields.payment_status,
      payment_method: finalMethod,
      advance_paid: updatedFields.advance_paid,
      payment_reference: updatedFields.payment_reference || order.payment_reference,
    };
    setOrder(nextOrder);

    // If order is saved in DB, persist change immediately
    if (order.id && !order.id.startsWith("draft_")) {
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: updatedFields.payment_status,
          payment_method: finalMethod,
          advance_paid: updatedFields.advance_paid,
          payment_reference: updatedFields.payment_reference || order.payment_reference,
        } as any)
        .eq("id", order.id);

      if (error) {
        setOrder({ ...order });
        throw error;
      }

      // Keep initialSnapshot in sync so isDirty is computed accurately
      if (initialSnapshotRef.current) {
        initialSnapshotRef.current = {
          ...initialSnapshotRef.current,
          order: {
            ...initialSnapshotRef.current.order,
            payment_status: updatedFields.payment_status,
            payment_method: finalMethod,
            advance_paid: updatedFields.advance_paid,
            payment_reference: updatedFields.payment_reference || order.payment_reference,
          },
        };
      }

      // Log Activity Entry
      await logActivity({
        action: "payment_update",
        order_id: order.id,
        en: `Updated payment status to ${updatedFields.payment_status.toUpperCase()} (${(finalMethod || "unspecified").toUpperCase()}), Advance: BHD ${updatedFields.advance_paid.toFixed(3)}`,
        ar: `تحديث حالة الدفع إلى ${updatedFields.payment_status} (${finalMethod || "غير محدد"})، المبلغ المستلم: ${updatedFields.advance_paid.toFixed(3)} د.ب`,
        metadata: {
          oldStatus,
          oldMethod,
          oldAdvance,
          ...updatedFields,
          payment_method: finalMethod,
        },
      });

      qc.invalidateQueries({ queryKey: ["activity_logs"] });
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      await orderQ.refetch();
    }
  };

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStreamPromise, setCameraStreamPromise] = useState<Promise<MediaStream> | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const currency = order?.currency ?? "BHD";
  const isClosedOrder = serverOrder?.status === "completed" || serverOrder?.status === "paid";
  const isCreationMode = isBlankDraft && !hasSavedDraft;
  const isReadOnly = !isCreationMode && !editingUnlocked;
  const canUnlockEditing = !isCourier && (isAdmin || !isClosedOrder);

  const cancelEditing = () => {
    if (
      isDirty &&
      !window.confirm(
        lang === "ar"
          ? "هل تريد إلغاء التعديل وتجاهل جميع التغييرات غير المحفوظة؟"
          : "Cancel editing and discard all unsaved changes?",
      )
    ) {
      return;
    }

    const snapshot = initialSnapshotRef.current;
    if (snapshot) {
      setOrder((current: any) => ({ ...(current ?? {}), ...snapshot.order }));
      setItems(snapshot.items.map((item) => ({ ...item })));
    }
    const savedPromo = (orderQ.data as any)?.promo_code ?? null;
    setPromoInput(savedPromo ?? "");
    setAppliedPromo(
      savedPromo
        ? {
            code: savedPromo,
            id: (orderQ.data as any)?.promo_code_id ?? "",
            amount: Number((orderQ.data as any)?.discount ?? 0),
          }
        : null,
    );
    setEditingItemSheetIdx(null);
    setIsEditingFees(false);
    setEditingUnlocked(false);
  };

  const addItem = () => {
    setItems([...items, blankOrderItem()]);
  };

  const openBarcodeScanner = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    /* The scanner component owns camera acquisition. Avoid opening a competing
       warm-up stream here; it prevents autofocus on several mobile browsers. */
    setCameraStreamPromise(null);
    setScannerOpen(true);
  };

  const handleScanned = (code: string) => {
    const normalizeScan = (value: unknown) =>
      String(value ?? "")
        .replace(/\p{Cc}/gu, "")
        .trim()
        .toUpperCase();
    const trimmed = normalizeScan(code);
    if (!trimmed) return;
    const variants = variantsQ.data ?? [];
    const products = productsQ.data ?? [];
    const v =
      variants.find((x: any) => normalizeScan(x.barcode) === trimmed) ??
      variants.find((x: any) => normalizeScan(x.sku) === trimmed);
    if (!v) {
      toast.error(
        lang === "ar" ? `لم يتم العثور على الباركود: ${trimmed}` : `Barcode not found: ${trimmed}`,
      );
      return;
    }
    const p = products.find((x: any) => x.id === v.product_id);
    const isAr = lang === "ar";
    const axes = resolveAllVariantAxes({
      product: p,
      addonDefaults,
      lang: isAr ? "ar" : "en",
    });
    const lines = [p?.name || (v as any).title || "Product"];
    if (v.size && axes.size.visible) lines.push(`${axes.size.label}: ${v.size}`);
    if (v.color && axes.color.visible) lines.push(`${axes.color.label}: ${v.color}`);
    if (v.fabric && axes.fabric.visible) lines.push(`${axes.fabric.label}: ${v.fabric}`);
    setItems([
      ...items,
      {
        product_id: p?.id ?? null,
        variant_id: v.id,
        description: lines.join("\n"),
        quantity: 1,
        unit_price: Number(v.selling_price || 0),
        unit_cost: (v as any).cost_price == null ? null : Number((v as any).cost_price),
        original_price:
          (v as any).original_price == null ? null : Number((v as any).original_price),
        customizations: [],
        customization_total: 0,
        line_total: Number(v.selling_price || 0),
        location: "main",
        selected_variant: {
          size: v.size || null,
          color: v.color || null,
          fabric: v.fabric || null,
        },
        custom_field_values: [],
      },
    ]);
    toast.success(
      lang === "ar" ? `تمت إضافة ${p?.name || "المنتج"} بنجاح!` : `Added ${p?.name || "product"}!`,
    );
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems(items.map((it, i) => (i === idx ? recalcOrderItem({ ...it, ...patch }) : it)));
  };

  const pickVariant = (idx: number, variantId: string) => {
    const v = variantsQ.data?.find((x: any) => x.id === variantId);
    const p = productsQ.data?.find((x: any) => x.id === v?.product_id);
    if (!v || !p) return;
    const isAr = lang === "ar";
    const axes = resolveAllVariantAxes({
      product: p,
      addonDefaults,
      lang: isAr ? "ar" : "en",
    });
    const lines = [p.name];
    if (v.size && axes.size.visible) lines.push(`${axes.size.label}: ${v.size}`);
    if (v.color && axes.color.visible) lines.push(`${axes.color.label}: ${v.color}`);
    if (v.fabric && axes.fabric.visible) lines.push(`${axes.fabric.label}: ${v.fabric}`);
    updateItem(idx, {
      product_id: p.id,
      variant_id: v.id,
      description: lines.join("\n"),
      unit_price: Number(v.selling_price),
      unit_cost: (v as any).cost_price == null ? null : Number((v as any).cost_price),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
      selected_variant: {
        size: v.size || null,
        color: v.color || null,
        fabric: v.fabric || null,
      },
    });
  };

  const toggleCustom = (idx: number, c: { name: string; price_delta: number }) => {
    const it = items[idx];
    const exists = it.customizations.find((x) => x.name === c.name);
    const newCust = exists
      ? it.customizations.filter((x) => x.name !== c.name)
      : [...it.customizations, c];
    updateItem(idx, { customizations: newCust });
  };

  const save = async () => {
    if (isReadOnly) return;
    const saveBlocker = orderSaveBlocker(order, items, id, lang);
    if (saveBlocker) return toast.error(saveBlocker);
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const orderPayload = orderSavePayload(order, totals, appliedPromo, currency);

    if (id === "new") {
      const { data: created, error: createError } = await (supabase.from("orders") as any)
        .insert({
          ...orderPayload,
          user_id: user.id,
          brand_id: brandId,
          invoice_number: 0,
        })
        .select("id")
        .single();
      if (createError || !created) {
        setSaving(false);
        return toast.error(createError?.message || "ORDER_CREATE_FAILED");
      }
      if (items.length > 0) {
        for (const it of items) {
          const isCustom = it.location === "custom" || !it.variant_id;
          if (isCustom && !it.location) {
            it.location = "custom";
          }
        }
        const { error: itemError } = await (supabase.from("order_items") as any).insert(
          items.map((item) =>
            orderItemRow(item, { user_id: user.id, brand_id: brandId, order_id: created.id }),
          ),
        );
        if (itemError) {
          await supabase.from("orders").delete().eq("id", created.id);
          setSaving(false);
          return toast.error(itemError.message);
        }
      }
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
      toast.success(lang === "ar" ? "تم إنشاء الطلب بنجاح" : "Order created successfully");
      initialSnapshotRef.current = null;
      setOrder(null);
      setItems([]);
      router.navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: created.id } });
      return;
    }

    const { error: oe } = await supabase
      .from("orders")
      .update(orderPayload as any)
      .eq("id", order.id);
    if (oe) {
      setSaving(false);
      return toast.error(oe.message);
    }

    // ── Activity log: detect changes vs saved state
    const prev = (orderQ.data ?? {}) as any;
    const logs = orderChangeLogs(prev, order, totals.advancePaid, currency);

    // Only update order_items if they actually changed
    const originalItems = (orderQ.data?.order_items ?? []) as any[];
    const itemsModified = haveOrderItemsChanged(originalItems, items);

    if (itemsModified) {
      const itemsPayload = items.map((i) =>
        orderItemRow(i, { user_id: user.id, brand_id: brandId, order_id: order.id }),
      );

      const { error: repErr } = await (supabase.rpc as any)("replace_order_items", {
        p_order_id: order.id,
        p_items: itemsPayload,
      });

      if (repErr) {
        setSaving(false);
        if (repErr.message?.includes("INSUFFICIENT_STOCK")) {
          return toast.error(t("orderDetail.insufficientStock"));
        }
        return toast.error(repErr.message);
      }
    }

    if (logs.length > 0) await logActivityBatch(logs);

    // Refetch fresh order from Supabase to sync local state and snapshot
    const refetched = await orderQ.refetch();
    const freshOrder = (refetched.data ?? order) as any;
    setOrder(freshOrder);

    const loadedItems: Item[] = (freshOrder.order_items ?? []).map(orderItemFromRow);
    setItems(loadedItems);

    initialSnapshotRef.current = {
      order: normalizeOrderMin(freshOrder),
      items: loadedItems,
    };

    toast.success(lang === "ar" ? "تم الحفظ بنجاح" : "Saved successfully");
    try {
      localStorage.removeItem(`boutq_draft_${brandId}_${id}`);
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
    } catch {
      // ignore storage errors
    }
    setHasSavedDraft(true);
    setEditingUnlocked(false);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["orders", brandId] });
    qc.invalidateQueries({ queryKey: ["variants"] });
    qc.invalidateQueries({ queryKey: ["activity_logs"] });
  };
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

  const copyLink = async () => {
    const url = `${window.location.origin}/invoice/${order.public_invoice_token}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(t("orders.linkCopied"));
    } catch {
      toast.error(t("orders.linkFailed"));
    }
  };

  const handlePrintA4 = async () => {
    try {
      const el = document.querySelector<HTMLElement>(".printable-invoice");
      const { downloadInvoicePdf } = await import("@/lib/download-invoice-pdf");
      await downloadInvoicePdf(el, `invoice-${order.invoice_number ?? order.id}`);
    } catch (err) {
      console.error("PDF download failed", err);
      toast.error(
        (err as Error)?.message ?? (lang === "ar" ? "فشل تحميل ملف PDF" : "PDF download failed"),
      );
    }
  };

  const printReceipt = () => {
    const settings: any = settingsQ.data ?? {};
    const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
    const rawBrand = (settings.business_name ?? "").trim();
    const brand =
      !rawBrand || LEGACY_BRAND_NAMES.has(rawBrand)
        ? lang === "ar"
          ? "بوتيك"
          : "Boutq"
        : rawBrand;

    const paymentLabel = order.payment_method ? t(`payment.${order.payment_method}`) : "";
    const statusLabel = formatOrderStatus(order.status, order.fulfillment_method, lang);

    const ok = printThermalReceipt({
      brand,
      invoiceNumber: order.invoice_number,
      orderDate: order.order_date,
      status: statusLabel,
      customerName: getOrderCustomerName(order) || null,
      customerPhone: getOrderCustomerPhone(order) || null,
      paymentMethod: paymentLabel || null,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        customization_total: i.customization_total,
        line_total: i.line_total,
        customizations: i.customizations,
        selected_variant: i.selected_variant,
        custom_field_values: i.custom_field_values,
        product: (productsQ.data ?? []).find((p: any) => p.id === i.product_id),
      })),
      brandAddons: storeProfile.addons,
      storeVertical: storeProfile.vertical,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxRate: Number(order.tax_rate ?? 0),
      taxAmount: totals.taxAmount,
      shipping: totals.shipping,
      total: totals.total,
      currency,
      lang,
      labels: {
        receipt: t("orders.printReceipt"),
        invoiceNumber: t("orders.invoice") + " #",
        date: t("orders.date"),
        status: t("orders.status"),
        payment: t("orderDetail.paymentMethod"),
        customer: t("orderDetail.customer"),
        item: t("orderDetail.description"),
        qty: t("orderDetail.qty"),
        price: t("orderDetail.unitPrice"),
        total: t("orderDetail.total"),
        subtotal: t("orderDetail.subtotal"),
        discount: t("orderDetail.discount"),
        vat: t("orderDetail.vat"),
        shipping: t("orderDetail.shipping"),
        grandTotal: t("orderDetail.grandTotal"),
        thankYou:
          settings.footer_note?.trim() ||
          (lang === "ar" ? "شكراً لتسوّقكم معنا" : "Thank you for your order"),
      },
      footerNote: null,
    });
    if (!ok) toast.error(t("orders.popupBlocked"));
  };

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

  const handleDirectOrderStatusChange = async (newStatus: string, newFulfillmentStatus: string) => {
    if (!order) return;
    try {
      const updatePayload: any = {
        status: newStatus,
        fulfillment_status: newFulfillmentStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "completed") {
        updatePayload.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase.from("orders").update(updatePayload).eq("id", order.id);

      if (error) throw error;

      const labelAr = getFulfillmentLabel(newFulfillmentStatus, "ar");
      const labelEn = getFulfillmentLabel(newFulfillmentStatus, "en");

      toast.success(
        lang === "ar"
          ? `تم تحديث حالة الطلب إلى "${labelAr}"`
          : `Updated order status to "${labelEn}"`,
      );

      await logActivity({
        action: "status_change",
        order_id: order.id,
        en: `Updated order status to "${labelEn}"`,
        ar: `تحديث حالة الطلب إلى "${labelAr}"`,
      });

      await orderQ.refetch();
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
      qc.invalidateQueries({ queryKey: ["activity_logs"] });
    } catch (err: unknown) {
      toast.error(
        getFriendlyErrorMessage(err) ||
          (lang === "ar" ? "تعذر تحديث حالة الطلب" : "Unable to update order status"),
      );
      throw err;
    }
  };

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
        <div
          className={cn(
            "no-print my-3 grid gap-1 rounded-2xl border border-border-strong bg-muted/60 p-1.5 shadow-2xs select-none sm:hidden",
            isCreationMode ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          <button
            type="button"
            onClick={() => setMobileTab("items")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
              mobileTab === "items"
                ? "bg-card text-foreground shadow-xs border border-border-strong font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Package className="h-4 w-4 shrink-0" />
            <span>{lang === "ar" ? "المنتجات" : "Items"}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("customer")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
              mobileTab === "customer"
                ? "bg-card text-foreground shadow-xs border border-border-strong font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <UserRound className="h-4 w-4 shrink-0" />
            <span>{lang === "ar" ? "العميل والتوصيل" : "Customer"}</span>
          </button>
          {!isCreationMode && (
            <button
              type="button"
              onClick={() => setMobileTab("activity")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
                mobileTab === "activity"
                  ? "bg-card text-foreground shadow-xs border border-border-strong font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span>{lang === "ar" ? "النشاط" : "Activity"}</span>
            </button>
          )}
        </div>

        {/* Desktop Section Navigation Bar (≥ 768px) */}
        {!isCreationMode && (
          <div className="no-print mb-3 hidden sm:flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-strong bg-card/90 p-1.5 shadow-sm select-none sm:mb-6 sm:rounded-xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollToSection("sec-overview")}
                className={cn(
                  "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
                  activeSection === "sec-overview"
                    ? "bg-foreground text-background font-bold shadow-2xs"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                <UserRound className="h-3.5 w-3.5" />
                <span>{lang === "ar" ? "نظرة عامة" : "Overview"}</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("sec-items")}
                className={cn(
                  "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
                  activeSection === "sec-items"
                    ? "bg-foreground text-background font-bold shadow-2xs"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                <Package className="h-3.5 w-3.5" />
                <span>{lang === "ar" ? "المنتجات" : "Items"}</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("sec-documents")}
                className={cn(
                  "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
                  activeSection === "sec-documents"
                    ? "bg-foreground text-background font-bold shadow-2xs"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{lang === "ar" ? "المستندات" : "Documents"}</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("sec-invoice")}
                className={cn(
                  "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
                  activeSection === "sec-invoice"
                    ? "bg-foreground text-background font-bold shadow-2xs"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>{lang === "ar" ? "الفاتورة" : "Invoice"}</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("sec-activity")}
                className={cn(
                  "min-h-11 justify-center rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation",
                  activeSection === "sec-activity"
                    ? "bg-foreground text-background font-bold shadow-2xs"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span>{lang === "ar" ? "المزيد" : "More"}</span>
              </button>
            </div>

            {/* Left Side: Dynamic Save Button & Unsaved Notation */}
            {!isReadOnly && (
              <div className="flex items-center gap-2.5 px-1 py-0.5">
                {isDirty ? (
                  <>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 animate-fade-in inline">
                      {lang === "ar" ? "توجد تغييرات غير محفوظة" : "Unsaved changes"}
                    </span>
                    <Button
                      onClick={save}
                      disabled={saving}
                      size="sm"
                      className="shadow-xs font-bold h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-500/30"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 me-1.5" />
                      )}
                      {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 px-2 py-1 bg-muted/40 rounded-lg">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    {lang === "ar" ? "محفوظ" : "Saved"}
                  </span>
                )}
              </div>
            )}
          </div>
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
        <div
          id="sec-invoice"
          className={cn("scroll-mt-24", mobileTab !== "activity" && "hidden sm:block")}
        >
          <div className="no-print mb-4 rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setInvoicePreviewOpen((open) => !open)}
              className="flex w-full items-center justify-between px-4 py-3 text-start font-medium hover:bg-muted/40"
              aria-expanded={invoicePreviewOpen}
            >
              <span>{lang === "ar" ? "معاينة الفاتورة" : "Preview Invoice"}</span>
              <span className="text-sm text-muted-foreground">
                {invoicePreviewOpen ? "−" : "+"}
              </span>
            </button>
          </div>
          <div className={invoicePreviewOpen ? "block" : "hidden print:block"}>
            {/* Printable invoice */}
            {(() => {
              const addrs = (addressesQ.data ?? []).filter(
                (a) => a.customer_id === order.customer_id,
              );
              const chosen =
                ((order as any).delivery_address_snapshot as SavedAddress | null) ??
                addrs.find((a) => a.id === order.shipping_address_id) ??
                addrs.find((a) => a.is_default) ??
                null;
              return (
                <InvoicePreview
                  order={{
                    ...order,
                    subtotal: totals.subtotal,
                    tax_amount: totals.taxAmount,
                    total: totals.total,
                    advance_paid: totals.advancePaid,
                  }}
                  items={items.map((it) => ({
                    ...it,
                    product: (productsQ.data ?? []).find((p: any) => p.id === it.product_id),
                  }))}
                  settings={settingsQ.data}
                  shippingAddress={chosen}
                  paymentBadge={paymentBadge}
                  brandAddons={storeProfile.addons}
                  storeVertical={storeProfile.vertical}
                />
              );
            })()}
          </div>
        </div>

        {/* Activity Trail Section Anchor */}
        <div
          id="sec-activity"
          className={cn(
            "no-print mx-auto max-w-6xl scroll-mt-24 px-1 pb-4 sm:p-6 lg:p-8",
            mobileTab !== "activity" && "hidden sm:block",
          )}
        >
          <details className="group overflow-hidden rounded-2xl border border-border-subtle bg-card/60 shadow-sm sm:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold marker:content-none">
              <span>{lang === "ar" ? "سجل النشاطات" : "Activity history"}</span>
              <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-border-subtle p-4">
              <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
            </div>
          </details>
          <div className="hidden sm:block">
            <ActivityLogList orderId={order.id} scope="order" brandId={brand.id} />
          </div>
        </div>

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

const InvoicePreview = lazy(() => import("@/components/orders/InvoicePreview"));
const SendInvoiceDialog = lazy(() => import("@/components/orders/SendInvoiceDialog"));
