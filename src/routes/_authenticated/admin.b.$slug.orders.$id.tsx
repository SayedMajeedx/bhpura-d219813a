import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef, lazy } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentGatewayReference } from "@/lib/payment-reference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Minus,
  Check,
  Pencil,
  Trash2,
  Copy,
  Printer,
  Save,
  Send,
  Search,
  Receipt,
  Link as LinkIcon,
  ScanLine,
  Mail,
  Loader2,
  Lock,
  Unlock,
  X,
  Tag,
  CheckCircle2,
  ImageIcon,
  Truck,
  UserPlus,
  MoreHorizontal,
  UserRound,
  Package,
  CreditCard,
  MapPin,
  Scissors,
  PackageCheck,
  Box,
  Store,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  generateCourierWhatsAppUrl,
  formatNotifiedTimeAgo,
  recordCourierNotified,
} from "@/lib/courier-whatsapp";
import { CourierWhatsAppModal } from "@/components/courier/CourierWhatsAppModal";
import { formatDate, formatMoney, formatOrderStatus } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import {
  getOrderCustomerEmail,
  getOrderCustomerName,
  getOrderCustomerPhone,
} from "@/lib/order-customer-snapshot";
import {
  regionLabel,
  formatAddressLine,
  formatAddressDetailed,
  type StructuredAddress,
} from "@/lib/bahrain-regions";
import { printThermalReceipt } from "@/lib/thermal-print";
import { cn } from "@/lib/utils";
import {
  resolvePaymentStatus,
  PAYMENT_BADGE_CLASSES,
  PAYMENT_BADGE_LABEL,
  PAYMENT_BADGE_VALUES,
  type PaymentBadge,
} from "@/lib/payment-status";
import { logActivity, logActivityBatch } from "@/lib/activity-log";
import { ManagePaymentModal } from "@/components/orders/ManagePaymentModal";
import { ActivityLogList } from "@/components/activity-log-list";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { PhoneInput } from "@/components/phone-input";
import { useBrand } from "@/lib/brand-context";
import { useProfile } from "@/lib/profile-context";
import { getBenefitReceiptViewUrl, rejectBenefitReceipt } from "@/lib/benefit-receipt.functions";
import { DeliveryAddressCard } from "@/components/delivery-address-card";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { detectOrderType, getOrderTypeLabel } from "@/lib/order-type-detector";
import {
  getFulfillmentLabel,
  getOrderStatusLabel,
  getFulfillmentMethodLabel,
  FULFILLMENT_STATUS_MAP,
} from "@/lib/status-labels";
import { OrderUnifiedHeader } from "@/components/orders/OrderUnifiedHeader";
import { OrderMobileQuickActions } from "@/components/orders/OrderMobileQuickActions";
import { OrderStickyBottomBar } from "@/components/orders/OrderStickyBottomBar";
import { OrderItemsWorkflowCard } from "@/components/orders/OrderItemsWorkflowCard";
import { OrderFinancialLedgerCard } from "@/components/orders/OrderFinancialLedgerCard";
import { OrderMetaSidePanel } from "@/components/orders/OrderMetaSidePanel";

function formatDeliveryAddress(
  c:
    | {
        region?: string | null;
        road?: string | null;
        house?: string | null;
        flat?: string | null;
        address?: string | null;
        city?: string | null;
      }
    | null
    | undefined,
  lang: "en" | "ar",
): string[] {
  if (!c) return [];
  const region = regionLabel(c.region, lang) || c.city || "";
  const road = c.road?.trim() || "";
  const house = c.house?.trim() || "";
  const flat = c.flat?.trim() || "";
  const parts =
    lang === "ar"
      ? [region, road, house, flat] // المنطقة، طريق، منزل، شقة
      : [flat, house, road, region]; // Flat, House, Road, Region
  const filtered = parts.filter((p) => p && p.length > 0);
  if (filtered.length === 0 && c.address) return c.address.split(/\r?\n/).filter(Boolean);
  const sep = lang === "ar" ? "، " : ", ";
  return filtered.length ? [filtered.join(sep)] : [];
}

type SavedAddress = {
  id: string;
  customer_id: string;
  label: string | null;
  region: string | null;
  block: string | null;
  road: string | null;
  house: string | null;
  flat: string | null;
  floor: string | null;
  landmark: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  delivery_notes: string | null;
  is_default: boolean;
};

export const Route = createFileRoute("/_authenticated/admin/b/$slug/orders/$id")({
  component: OrderDetail,
  errorComponent: OrderErrorBoundary,
  notFoundComponent: () => <OrderErrorBoundary />,
});

function OrderErrorBoundary({ error }: { error?: Error }) {
  const { slug } = Route.useParams();
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-8 text-center space-y-3">
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

type Order = any;
type Item = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;
  original_price?: number | null;
  customizations: { name: string; price_delta: number }[];
  customization_total: number;
  line_total: number;
  location: "main" | "incubator";
  selected_variant?: { size?: string | null; color?: string | null; fabric?: string | null } | null;
  custom_field_values?: Array<{
    key: string;
    label_ar: string | null;
    label_en: string | null;
    value: string;
  }>;
};

function BhdFeeInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [display, setDisplay] = useState(Number(value || 0).toFixed(3));
  useEffect(() => setDisplay(Number(value || 0).toFixed(3)), [value]);
  const commit = () => {
    const parsed = Math.max(0, Number(display) || 0);
    setDisplay(parsed.toFixed(3));
    onChange(parsed);
  };
  return (
    <Input
      inputMode="decimal"
      value={display}
      disabled={disabled}
      onChange={(event) => setDisplay(event.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function normalizeCustomFieldValues(value: unknown): Item["custom_field_values"] {
  if (Array.isArray(value)) return value as Item["custom_field_values"];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => ({
      key,
      label_ar: null,
      label_en: key,
      value: String(fieldValue ?? ""),
    }));
  }
  return [];
}

function normalizeWhatsAppNumber(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("973") ? digits : `973${digits.replace(/^0+/, "")}`;
}

function fillCourierMessage(template: string, order: any, brandName: string) {
  return template
    .replaceAll("{{customer_name}}", getOrderCustomerName(order) || "Customer")
    .replaceAll("{{invoice_number}}", String(order.invoice_number ?? ""))
    .replaceAll("{{brand_name}}", brandName)
    .replaceAll("{{total}}", formatMoney(Number(order.total ?? 0), order.currency || "BHD"))
    .replaceAll("{{customer_phone}}", getOrderCustomerPhone(order));
}

const CourierOrderView = lazy(() => import("@/components/orders/CourierOrderView"));

function OrderDetail() {
  const t = useT();
  const { lang } = useI18n();
  const { id, slug } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const brand = useBrand();
  const { isAdmin, isCourier } = useProfile();
  const brandId = brand.id;
  const [approvingBenefit, setApprovingBenefit] = useState(false);
  const [rejectingBenefit, setRejectingBenefit] = useState(false);
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const orderQ = useQuery({
    queryKey: ["order", id, isCourier ? "assigned-courier" : "office"],
    // A courier can be working from a phone with an intermittent realtime
    // socket. Keep both courier and office views synchronized regardless.
    refetchInterval: isCourier ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
    enabled: id !== "new",
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "*, customers(*), order_items(*), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*)",
        )
        .eq("id", id);
      if (isCourier) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        query = (query as any).eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Order not found. It may have been deleted.");
      return data as Order;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["order", id] });
          void qc.invalidateQueries({ queryKey: ["orders"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `order_id=eq.${id}` },
        () => void qc.invalidateQueries({ queryKey: ["activity_logs"] }),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Handled gracefully, Supabase will auto-reconnect
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const productsQ = useQuery({
    queryKey: ["products", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("products").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const variantsQ = useQuery({
    queryKey: ["variants", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("product_variants").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const customersQ = useQuery({
    queryKey: ["customers", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("customers").select("*").eq("brand_id", brandId).order("name")).data ??
      [],
  });
  const couriersQ = useQuery({
    queryKey: ["couriers", brandId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .eq("role", "courier")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
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
  const addressesQ = useQuery({
    queryKey: ["customer_addresses", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as SavedAddress[];
    },
  });

  const receiptViewQ = useQuery({
    queryKey: ["benefit-receipt-view", id, orderQ.data?.benefit_receipt_key],
    enabled:
      !isCourier &&
      Boolean(orderQ.data?.payment_method === "benefit" && orderQ.data?.benefit_receipt_key),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    queryFn: async () => getBenefitReceiptViewUrl({ data: { orderId: id } }),
    retry: false,
  });

  const approveBenefitPayment = async () => {
    setApprovingBenefit(true);
    try {
      const { error } = await supabase.rpc("approve_benefit_payment" as any, { p_order_id: id });
      if (error) throw error;

      await orderQ.refetch();
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(
        lang === "ar" ? "تم التحقق من الدفع واعتماده" : "Payment verified and approved",
      );
    } catch (error: any) {
      toast.error(
        error?.message ?? (lang === "ar" ? "تعذر اعتماد الدفع" : "Could not approve payment"),
      );
    } finally {
      setApprovingBenefit(false);
    }
  };

  const rejectBenefitPayment = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error(
        lang === "ar"
          ? "يرجى إدخال سبب الرفض ليظهر للعميل"
          : "Enter a rejection reason for the customer",
      );
      return;
    }
    setRejectingBenefit(true);
    try {
      await rejectBenefitReceipt({ data: { orderId: id, reason } });
      toast.success(
        lang === "ar" ? "تم رفض الإيصال وحذف الصورة" : "Receipt rejected and image deleted",
      );
      await orderQ.refetch();
      qc.removeQueries({ queryKey: ["benefit-receipt-view", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setRejectReasonOpen(false);
      setRejectReason("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "تعذر رفض الإيصال"
            : "Unable to reject receipt",
      );
    } finally {
      setRejectingBenefit(false);
    }
  };
  const branchesQ = useQuery({
    queryKey: ["branches", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name_ar, name_en, location_ar, location_en")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const customQ = useQuery({
    queryKey: ["customizations", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (
        await supabase
          .from("customization_options")
          .select("*")
          .eq("brand_id", brandId)
          .order("name")
      ).data ?? [],
  });
  const settingsQ = useQuery({
    queryKey: ["business-settings", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data;
    },
  });

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => Promise<unknown>>(async () => undefined);
  const [adminOverrideChecked, setAdminOverrideChecked] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [activeSection, setActiveSection] = useState<string>("sec-overview");

  useEffect(() => {
    if (!order?.id) return;
    const scrollContainer = document.querySelector(".os-scrollbar");
    const sectionIds = ["sec-overview", "sec-items", "sec-invoice", "sec-activity"];
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
    const settings = settingsQ.data as any;
    const fulfillmentMethod = settings.delivery_enabled
      ? "delivery"
      : settings.pickup_enabled
        ? "pickup"
        : settings.digital_delivery_enabled
          ? "digital"
          : "delivery";
    const shipping = fulfillmentMethod === "delivery" ? Number(settings.delivery_fee ?? 0) : 0;
    const draft = {
      id: "new",
      brand_id: brandId,
      invoice_number: 0,
      currency: settings.currency ?? "BHD",
      tax_rate: settings.default_tax_rate ?? 15,
      fulfillment_method: fulfillmentMethod,
      shipping,
      subtotal: 0,
      total: shipping,
      discount: 0,
      advance_paid: 0,
      status: "draft",
      payment_status: "unpaid",
      fulfillment_status: "ON_HOLD",
      payment_method: null,
      customer_id: null,
      shipping_address_id: null,
      branch_id: null,
      notes: "",
      delivery_notes: "",
      order_date: new Date().toISOString().slice(0, 10),
    };
    setOrder(draft);
    initialSnapshotRef.current = { order: draft, items: [] };
  }, [brandId, id, order, settingsQ.data]);

  const isDirty = useMemo(() => {
    if (!initialSnapshotRef.current || !order) return false;
    const snap = initialSnapshotRef.current;

    const normalizeOrderMin = (o: any) => ({
      id: o?.id ?? null,
      notes: o?.notes ?? "",
      delivery_notes: o?.delivery_notes ?? "",
      customer_id: o?.customer_id ?? null,
      shipping_address_id: o?.shipping_address_id ?? null,
      payment_status: o?.payment_status ?? "unpaid",
      fulfillment_status: o?.fulfillment_status ?? "ON_HOLD",
      status: o?.status ?? "draft",
      payment_method: o?.payment_method ?? null,
      discount: Number(o?.discount ?? 0),
      shipping: Number(o?.shipping ?? 0),
      tax_rate: Number(o?.tax_rate ?? 0),
      advance_paid: Number(o?.advance_paid ?? 0),
      order_date: o?.order_date ?? "",
    });

    const currentOrderMin = normalizeOrderMin(order);
    const snapOrderMin = normalizeOrderMin(snap.order);

    const orderChanged = JSON.stringify(currentOrderMin) !== JSON.stringify(snapOrderMin);

    const simplifyItem = (it: Item) => ({
      id: it.id,
      product_id: it.product_id ?? null,
      variant_id: it.variant_id ?? null,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      unit_cost: it.unit_cost == null ? null : Number(it.unit_cost),
      line_total: Number(it.line_total),
      customizations: it.customizations ?? [],
    });

    const itemsChanged =
      JSON.stringify(items.map(simplifyItem)) !== JSON.stringify(snap.items.map(simplifyItem));

    return orderChanged || itemsChanged;
  }, [items, order]);

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
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustRegion, setNewCustRegion] = useState("");
  const [newCustBlock, setNewCustBlock] = useState("");
  const [newCustRoad, setNewCustRoad] = useState("");
  const [newCustHouse, setNewCustHouse] = useState("");
  const [newCustFlat, setNewCustFlat] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const promoContextRef = useRef<string | null>(null);

  const handleCreateInlineCustomer = async () => {
    if (!newCustName.trim()) {
      return toast.error(lang === "ar" ? "أدخل اسم العميل" : "Customer name is required");
    }
    setCreatingCustomer(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const brandId = (settingsQ.data as any)?.brand_id || (brand as any)?.id;

      // 1. Insert customer
      const { data: cust, error: custErr } = await (supabase.from("customers") as any)
        .insert({
          user_id: user.id,
          brand_id: brandId,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim().toLowerCase() || null,
          region: newCustRegion.trim() || null,
          block: newCustBlock.trim() || null,
          road: newCustRoad.trim() || null,
          house: newCustHouse.trim() || null,
          flat: newCustFlat.trim() || null,
        })
        .select()
        .single();

      if (custErr) throw custErr;

      // 2. Insert default address if address details provided
      let addressId: string | null = null;
      if (newCustRegion || newCustBlock || newCustRoad || newCustHouse) {
        const { data: addr, error: addrErr } = await (supabase.from("customer_addresses") as any)
          .insert({
            user_id: user.id,
            brand_id: brandId,
            customer_id: cust.id,
            label: "Home",
            region: newCustRegion.trim() || null,
            block: newCustBlock.trim() || null,
            road: newCustRoad.trim() || null,
            house: newCustHouse.trim() || null,
            flat: newCustFlat.trim() || null,
            is_default: true,
          })
          .select()
          .single();

        if (!addrErr && addr) {
          addressId = addr.id;
        }
      }

      toast.success(
        lang === "ar"
          ? `تم إضافة العميل "${cust.name}" بنجاح!`
          : `Customer "${cust.name}" created successfully!`,
      );

      // Auto-assign to current order!
      setOrder({
        ...order,
        customer_id: cust.id,
        shipping_address_id: addressId,
      });

      // Refetch queries
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer_addresses"] });

      // Reset form & close modal
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewCustRegion("");
      setNewCustBlock("");
      setNewCustRoad("");
      setNewCustHouse("");
      setNewCustFlat("");
      setNewCustomerOpen(false);
    } catch (err: any) {
      toast.error(
        err.message || (lang === "ar" ? "تعذر إنشاء العميل" : "Failed to create customer"),
      );
    } finally {
      setCreatingCustomer(false);
    }
  };

  const filteredVariantsForSearch = useMemo(() => {
    if (!productSearchQuery.trim()) return (variantsQ.data ?? []).slice(0, 25);
    const tokens = productSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const products = productsQ.data ?? [];
    return (variantsQ.data ?? [])
      .filter((v: any) => {
        const p = products.find((x: any) => x.id === v.product_id);
        const title = String((p as any)?.name ?? "").toLowerCase();
        const titleAr = String((p as any)?.name_ar ?? "").toLowerCase();
        const titleEn = String((p as any)?.name_en ?? "").toLowerCase();
        const sku = String(v.sku ?? (p as any)?.sku ?? "").toLowerCase();
        const barcode = String(v.barcode ?? "").toLowerCase();
        const size = String(v.size ?? "").toLowerCase();
        const color = String(v.color ?? "").toLowerCase();
        const fabric = String(v.fabric ?? "").toLowerCase();

        const fullSearchableBlob = `${title} ${titleAr} ${titleEn} ${sku} ${barcode} ${size} ${color} ${fabric}`;
        return tokens.every((token) => fullSearchableBlob.includes(token));
      })
      .slice(0, 35);
  }, [productSearchQuery, variantsQ.data, productsQ.data]);

  const handleSelectVariantFromModal = (variant: any) => {
    const p = (productsQ.data ?? []).find((x: any) => x.id === variant.product_id);
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const variantTitle = [
      p ? (p as any).name : "",
      variant.size ? `${sizeLabel}: ${variant.size}` : "",
      variant.color ? `${colorLabel}: ${variant.color}` : "",
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
  const isBlankDraft =
    id === "new" ||
    (serverOrder?.status === "draft" &&
      !serverOrder?.customer_id &&
      !serverOrder?.payment_method &&
      (serverOrder?.order_items?.length ?? 0) === 0);

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
      const loadedItems = (orderQ.data.order_items ?? []).map((i: any) => ({
        id: i.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        description: i.description,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        unit_cost: i.unit_cost == null ? null : Number(i.unit_cost),
        original_price: i.original_price == null ? null : Number(i.original_price),
        customizations: i.customizations ?? [],
        customization_total: Number(i.customization_total),
        line_total: Number(i.line_total),
        location: (i.location === "incubator" ? "incubator" : "main") as "main" | "incubator",
        selected_variant: i.selected_variant ?? null,
        custom_field_values: normalizeCustomFieldValues(i.custom_field_values),
      }));

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
      } catch (e) {
        // ignore cache read errors
      }

      setItems(loadedItems);

      initialSnapshotRef.current = {
        order: {
          id: orderQ.data.id,
          notes: orderQ.data.notes ?? "",
          delivery_notes: orderQ.data.delivery_notes ?? "",
          customer_id: orderQ.data.customer_id ?? null,
          shipping_address_id: orderQ.data.shipping_address_id ?? null,
          payment_status: orderQ.data.payment_status,
          fulfillment_status: orderQ.data.fulfillment_status,
          status: orderQ.data.status,
          payment_method: orderQ.data.payment_method ?? null,
          discount: Number(orderQ.data.discount ?? 0),
          shipping: Number(orderQ.data.shipping ?? 0),
          tax_rate: Number(orderQ.data.tax_rate ?? 0),
          advance_paid: Number(orderQ.data.advance_paid ?? 0),
          order_date: orderQ.data.order_date,
        },
        items: loadedItems,
      };

      promoContextRef.current = JSON.stringify({
        customer: (orderQ.data as any).customer_id ?? null,
        items: loadedItems.map((item: Item) => [
          item.variant_id ?? null,
          item.quantity,
          Number(item.line_total).toFixed(3),
        ]),
      });
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
    const untouchedDraft =
      source?.status === "draft" &&
      !source?.customer_id &&
      !source?.payment_method &&
      (source?.order_items?.length ?? 0) === 0;
    const configuredFee = Number((settingsQ.data as any).delivery_fee ?? 0);
    if (untouchedDraft && configuredFee > 0)
      setOrder((current: any) => (current ? { ...current, shipping: configuredFee } : current));
  }, [order, orderQ.data, settingsQ.data]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + i.line_total, 0);
    const discount = Number(order?.discount ?? 0);
    const shipping = Number(order?.shipping ?? 0);
    const taxable = Math.max(0, subtotal - discount);
    const isInclusive = Boolean((settingsQ.data as any)?.vat_inclusive);
    const taxRate = Number(order?.tax_rate ?? 0);
    let taxAmount = 0;
    let total = 0;
    if (isInclusive) {
      taxAmount = taxable - taxable / (1 + taxRate / 100);
      total = taxable + shipping;
    } else {
      taxAmount = (taxable * taxRate) / 100;
      total = taxable + taxAmount + shipping;
    }
    const advancePaid = Math.max(0, Number(order?.advance_paid ?? 0));
    const remaining = Math.max(0, total - advancePaid);
    return { subtotal, discount, shipping, taxAmount, total, advancePaid, remaining };
  }, [
    items,
    order?.discount,
    order?.shipping,
    order?.tax_rate,
    order?.advance_paid,
    settingsQ.data,
  ]);

  useEffect(() => {
    const signature = JSON.stringify({
      customer: order?.customer_id ?? null,
      items: items.map((item) => [
        item.variant_id ?? null,
        item.quantity,
        Number(item.line_total).toFixed(3),
      ]),
    });
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

  const promoFailureMessage = (result: any) => {
    switch (result?.reason) {
      case "FIRST_ORDER_ONLY":
        return lang === "ar"
          ? "رمز الخصم هذا مخصص للعملاء الجدد فقط."
          : "This promo code is restricted to first-time customers only.";
      case "MINIMUM_NOT_MET":
        return lang === "ar"
          ? `يتطلب رمز الخصم هذا حداً أدنى للشراء بقيمة ${formatMoney(Number(result.minimum_order_amount), "BHD")}.`
          : `This promo code requires a minimum purchase value of ${formatMoney(Number(result.minimum_order_amount), "BHD")}.`;
      case "NO_ELIGIBLE_ITEMS":
        return lang === "ar"
          ? "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً."
          : "This promo code cannot be applied to items already on discount/sale.";
      case "CODE_INACTIVE":
        return lang === "ar"
          ? "رمز الخصم هذا لم يعد نشطاً."
          : "This promotional code is no longer active.";
      case "USAGE_LIMIT_REACHED":
        return lang === "ar"
          ? "وصل هذا العميل إلى الحد المسموح لاستخدام الرمز."
          : "This customer has reached the usage limit for this promo code.";
      case "CUSTOMER_REQUIRED":
        return lang === "ar"
          ? "اختر عميلاً قبل تطبيق رمز الخصم."
          : "Select a customer before applying this promo code.";
      case "CODE_NOT_FOUND":
        return lang === "ar"
          ? "رمز الخصم غير موجود لهذا المتجر."
          : "This promo code does not exist for this brand.";
      default:
        return lang === "ar"
          ? "تعذر تطبيق رمز الخصم. تحقق من شروط الرمز."
          : "This promo code could not be applied. Check its eligibility rules.";
    }
  };

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
    if (!result?.valid) return toast.error(promoFailureMessage(result));
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
  const [editingItems, setEditingItems] = useState<Record<number, boolean>>({});
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

    const nextOrder = {
      ...order,
      payment_status: updatedFields.payment_status,
      payment_method: updatedFields.payment_method,
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
          payment_method: updatedFields.payment_method,
          advance_paid: updatedFields.advance_paid,
          payment_reference: updatedFields.payment_reference || order.payment_reference,
        } as any)
        .eq("id", order.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      // Log Activity Entry
      await logActivity({
        action: "payment_update",
        order_id: order.id,
        en: `Updated payment status to ${updatedFields.payment_status.toUpperCase()} (${updatedFields.payment_method.toUpperCase()}), Advance: BHD ${updatedFields.advance_paid.toFixed(3)}`,
        ar: `تحديث حالة الدفع إلى ${updatedFields.payment_status} (${updatedFields.payment_method})، المبلغ المستلم: ${updatedFields.advance_paid.toFixed(3)} د.ب`,
        metadata: { oldStatus, oldMethod, oldAdvance, ...updatedFields },
      });

      qc.invalidateQueries({ queryKey: ["activity_logs"] });
    }
  };

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStreamPromise, setCameraStreamPromise] = useState<Promise<MediaStream> | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const currency = order?.currency ?? "BHD";
  const isClosedOrder = serverOrder?.status === "completed" || serverOrder?.status === "paid";
  const isReadOnly = isClosedOrder && !editingUnlocked;
  const isCreationMode = isBlankDraft && !hasSavedDraft;

  const addItem = () => {
    setItems([
      ...items,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        unit_cost: null,
        original_price: null,
        customizations: [],
        customization_total: 0,
        line_total: 0,
        location: "main",
      },
    ]);
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
        .replace(/[\u0000-\u001f\u007f]/g, "")
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
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const fabricLabel = isAr ? "القماش" : "Fabric";
    const lines = [p?.name ?? ""];
    if (v.size) lines.push(`${sizeLabel}: ${v.size}`);
    if (v.color) lines.push(`${colorLabel}: ${v.color}`);
    if (v.fabric) lines.push(`${fabricLabel}: ${v.fabric}`);
    // Default to whichever location has stock; prefer main.
    const preferred: "main" | "incubator" =
      (v.stock_main ?? 0) > 0 ? "main" : (v.stock_incubator ?? 0) > 0 ? "incubator" : "main";
    const newItem: Item = {
      product_id: v.product_id,
      variant_id: v.id,
      description: lines.filter(Boolean).join("\n"),
      quantity: 1,
      unit_price: Number(v.selling_price ?? 0),
      unit_cost: (v as any).cost_price == null ? null : Number((v as any).cost_price),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
      customizations: [],
      customization_total: 0,
      line_total: Number(v.selling_price ?? 0),
      location: preferred,
    };
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.variant_id === v.id && item.location === preferred && !item.customizations?.length,
      );
      if (existingIndex < 0) return [...prev, newItem];
      return prev.map((item, index) =>
        index === existingIndex ? recalc({ ...item, quantity: Number(item.quantity) + 1 }) : item,
      );
    });
    toast.success(isAr ? "تمت إضافة القطعة" : "Item added");
  };

  const recalc = (i: Item): Item => {
    const custTotal = i.customizations.reduce((s, c) => s + Number(c.price_delta), 0);
    const line = (Number(i.unit_price) + custTotal) * Number(i.quantity);
    return { ...i, customization_total: custTotal, line_total: line };
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems(items.map((it, i) => (i === idx ? recalc({ ...it, ...patch }) : it)));
  };

  const pickVariant = (idx: number, variantId: string) => {
    const v = variantsQ.data?.find((x: any) => x.id === variantId);
    const p = productsQ.data?.find((x: any) => x.id === v?.product_id);
    if (!v || !p) return;
    const isAr = lang === "ar";
    const sizeLabel = isAr ? "المقاس" : "Size";
    const colorLabel = isAr ? "اللون" : "Color";
    const fabricLabel = isAr ? "القماش" : "Fabric";
    const lines = [p.name];
    if (v.size) lines.push(`${sizeLabel}: ${v.size}`);
    if (v.color) lines.push(`${colorLabel}: ${v.color}`);
    if (v.fabric) lines.push(`${fabricLabel}: ${v.fabric}`);
    updateItem(idx, {
      product_id: p.id,
      variant_id: v.id,
      description: lines.join("\n"),
      unit_price: Number(v.selling_price),
      unit_cost: (v as any).cost_price == null ? null : Number((v as any).cost_price),
      original_price: (v as any).original_price == null ? null : Number((v as any).original_price),
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

  const DEDUCTING = new Set([
    "confirmed",
    "paid",
    "shipped",
    "completed",
    "packing",
    "ready_for_pickup",
  ]);

  const save = async () => {
    if (isReadOnly) return;
    if (id === "new" && !order.customer_id && items.length === 0) {
      return toast.error(
        lang === "ar"
          ? "أضف عميلاً أو منتجاً واحداً على الأقل قبل حفظ الطلب."
          : "Add at least one customer or product before saving the order.",
      );
    }
    const fulfillmentMethod = order.fulfillment_method ?? "delivery";
    if (fulfillmentMethod === "pickup" && !order.branch_id) {
      return toast.error(lang === "ar" ? "اختر فرع الاستلام" : "Select a pickup branch");
    }
    if (fulfillmentMethod === "delivery" && !order.shipping_address_id) {
      return toast.error(lang === "ar" ? "اختر عنوان التوصيل" : "Select a delivery address");
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    // Stock precheck when order will be in a deducting state.
    if (DEDUCTING.has(order.status)) {
      const variants = variantsQ.data ?? [];
      const wasDeducted = !!(orderQ.data as any)?.stock_deducted;
      const priorItems = wasDeducted ? ((orderQ.data as any)?.order_items ?? []) : [];
      const prevByVariant = new Map<string, number>();
      for (const p of priorItems as any[]) {
        if (!p.variant_id) continue;
        prevByVariant.set(
          p.variant_id,
          (prevByVariant.get(p.variant_id) ?? 0) + Number(p.quantity),
        );
      }
      const wantByVariant = new Map<string, number>();
      for (const it of items) {
        if (!it.variant_id) continue;
        wantByVariant.set(
          it.variant_id,
          (wantByVariant.get(it.variant_id) ?? 0) + Number(it.quantity),
        );
      }
      for (const [vid, want] of wantByVariant) {
        const v = variants.find((x: any) => x.id === vid);
        if (!v) continue;
        const available = Number(v.stock) + (prevByVariant.get(vid) ?? 0);
        if (want > available) {
          setSaving(false);
          return toast.error(t("orderDetail.insufficientStock"));
        }
      }
    }

    const orderPayload = {
      customer_id: order.customer_id,
      status: order.status,
      notes: order.notes,
      fulfillment_method: fulfillmentMethod,
      branch_id: fulfillmentMethod === "pickup" ? (order.branch_id ?? null) : null,
      shipping_address_id:
        fulfillmentMethod === "delivery" ? (order.shipping_address_id ?? null) : null,
      digital_delivery_channel:
        fulfillmentMethod === "digital" ? order.digital_delivery_channel : null,
      digital_delivery_contact:
        fulfillmentMethod === "digital" ? order.digital_delivery_contact : null,
      payment_method: order.payment_method ?? null,
      payment_status: order.payment_status ?? "unpaid",
      fulfillment_status: order.fulfillment_status ?? "ON_HOLD",
      discount: totals.discount,
      tax_rate: order.tax_rate,
      tax_amount: totals.taxAmount,
      promo_code: appliedPromo?.code ?? null,
      promo_code_id: appliedPromo?.id || null,
      shipping: totals.shipping,
      subtotal: totals.subtotal,
      total: totals.total,
      advance_paid: totals.advancePaid,
      currency,
      order_date: order.order_date,
    };

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
        const { error: itemError } = await (supabase.from("order_items") as any).insert(
          items.map((item) => ({
            user_id: user.id,
            order_id: created.id,
            product_id: item.product_id ?? null,
            variant_id: item.variant_id ?? null,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit_cost: item.unit_cost == null ? null : Number(item.unit_cost),
            original_price: item.original_price ?? null,
            customizations: item.customizations,
            customization_total: item.customization_total,
            line_total: item.line_total,
            location: item.location ?? "main",
          })),
        );
        if (itemError) {
          await supabase.from("orders").delete().eq("id", created.id);
          setSaving(false);
          return toast.error(itemError.message);
        }
      }
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
      await supabase.rpc("sync_order_stock", { p_order_id: created.id });
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
    const prevStatus = prev.status;
    const newStatus = order.status;
    const statusChanged = prevStatus !== newStatus;

    const logs: Array<{ action: string; en: string; ar: string; order_id: string }> = [];
    if (statusChanged) {
      logs.push({
        action: "status_change",
        order_id: order.id,
        en: `Order status changed from "${prev.status ?? "—"}" to "${order.status}"`,
        ar: `تم تغيير حالة الطلب من "${prev.status ?? "—"}" إلى "${order.status}"`,
      });
    }
    const prevPay = prev.payment_status ?? "unpaid";
    const nextPay = order.payment_status ?? "unpaid";
    if (prevPay !== nextPay) {
      logs.push({
        action: "payment_change",
        order_id: order.id,
        en: `Payment status manually changed from "${prevPay}" to "${nextPay}"`,
        ar: `تم تغيير حالة الدفع يدوياً من "${prevPay}" إلى "${nextPay}"`,
      });
    }
    const prevAdvance = Number(prev.advance_paid ?? 0);
    const nextAdvance = totals.advancePaid;
    if (prevAdvance !== nextAdvance) {
      logs.push({
        action: "advance_change",
        order_id: order.id,
        en: `Advance payment updated from ${prevAdvance} to ${nextAdvance} ${currency}`,
        ar: `تم تحديث المبلغ المقدم من ${prevAdvance} إلى ${nextAdvance} ${currency}`,
      });
    }

    // Only update order_items if they actually changed
    const originalItems = (orderQ.data?.order_items ?? []) as any[];
    let itemsModified = originalItems.length !== items.length;
    if (!itemsModified) {
      for (const item of items) {
        const orig = originalItems.find((o) => o.id === item.id);
        if (
          !orig ||
          orig.product_id !== item.product_id ||
          orig.variant_id !== item.variant_id ||
          Number(orig.quantity) !== Number(item.quantity) ||
          Number(orig.unit_price) !== Number(item.unit_price) ||
          (orig.unit_cost == null ? null : Number(orig.unit_cost)) !==
            (item.unit_cost == null ? null : Number(item.unit_cost)) ||
          orig.description !== item.description ||
          (orig.location === "incubator" ? "incubator" : "main") !== item.location ||
          JSON.stringify(orig.customizations ?? []) !== JSON.stringify(item.customizations ?? [])
        ) {
          itemsModified = true;
          break;
        }
      }
    }

    if (itemsModified) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
      if (items.length > 0) {
        const { error: ie } = await (supabase.from("order_items") as any).insert(
          items.map((i) => ({
            user_id: user.id,
            order_id: order.id,
            product_id: i.product_id ?? null,
            variant_id: i.variant_id ?? null,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            unit_cost: i.unit_cost == null ? null : Number(i.unit_cost),
            original_price: i.original_price ?? null,
            customizations: i.customizations,
            customization_total: i.customization_total,
            line_total: i.line_total,
            location: i.location ?? "main",
          })),
        );
        if (ie) {
          setSaving(false);
          return toast.error(ie.message);
        }
      }
    }

    // Sync inventory (deduct or restore based on status).
    const { error: se } = await supabase.rpc("sync_order_stock", { p_order_id: order.id });
    if (se) {
      if (se.message?.includes("INSUFFICIENT_STOCK")) {
        toast.error(t("orderDetail.insufficientStock"));
      } else {
        console.warn("[sync_order_stock]", se.message);
        toast.error(se.message);
      }
    }

    // Stock deltas: compare prior deducted items vs current, log per-variant changes
    if (!se) {
      const variants = variantsQ.data ?? [];
      const wasDeducted = !!(orderQ.data as any)?.stock_deducted;
      const priorItems = wasDeducted ? ((orderQ.data as any)?.order_items ?? []) : [];
      const nowDeducting = DEDUCTING.has(order.status);
      const prevByV = new Map<string, number>();
      for (const p of priorItems as any[]) {
        if (!p.variant_id) continue;
        prevByV.set(p.variant_id, (prevByV.get(p.variant_id) ?? 0) + Number(p.quantity));
      }
      const wantByV = new Map<string, number>();
      if (nowDeducting) {
        for (const it of items) {
          if (!it.variant_id) continue;
          const isCustom =
            (it.custom_field_values && it.custom_field_values.length > 0) ||
            (it.selected_variant?.size && String(it.selected_variant.size).includes("تفصيل"));
          if (isCustom) continue;
          wantByV.set(it.variant_id, (wantByV.get(it.variant_id) ?? 0) + Number(it.quantity));
        }
      }
      const vids = new Set<string>([...prevByV.keys(), ...wantByV.keys()]);
      for (const vid of vids) {
        const delta = (wantByV.get(vid) ?? 0) - (prevByV.get(vid) ?? 0);
        if (delta === 0) continue;
        const v = variants.find((x: any) => x.id === vid) as any;
        const p = v ? (productsQ.data ?? []).find((x: any) => x.id === v.product_id) : null;
        const vLabel = v
          ? `${(p as any)?.name ?? ""}${v.size ? ` · ${v.size}` : ""}${v.color ? ` · ${v.color}` : ""}`
          : vid;
        const before = Number(v?.stock ?? 0) + (prevByV.get(vid) ?? 0);
        const after = before - (wantByV.get(vid) ?? 0);
        const inv = order.invoice_number ?? "";
        if (delta > 0) {
          logs.push({
            action: "stock_change",
            order_id: order.id,
            en: `Stock decreased from ${before} to ${after} for ${vLabel} due to Order #${inv}`,
            ar: `انخفض المخزون من ${before} إلى ${after} لـ ${vLabel} بسبب الطلب رقم ${inv}`,
          } as any);
        } else {
          logs.push({
            action: "stock_change",
            order_id: order.id,
            en: `Stock restored from ${before} to ${after} for ${vLabel} due to Order #${inv}`,
            ar: `استُعيد المخزون من ${before} إلى ${after} لـ ${vLabel} بسبب الطلب رقم ${inv}`,
          } as any);
        }
      }
    }

    if (logs.length > 0) await logActivityBatch(logs);

    // Refetch fresh order from Supabase to sync local state and snapshot
    const refetched = await orderQ.refetch();
    const freshOrder = (refetched.data ?? order) as any;
    setOrder(freshOrder);

    const loadedItems: Item[] = (freshOrder.order_items ?? []).map((i: any) => ({
      id: i.id,
      product_id: i.product_id,
      variant_id: i.variant_id,
      description: i.description,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      unit_cost: i.unit_cost == null ? null : Number(i.unit_cost),
      original_price: i.original_price == null ? null : Number(i.original_price),
      customizations: i.customizations ?? [],
      customization_total: Number(i.customization_total),
      line_total: Number(i.line_total),
      location: (i.location === "incubator" ? "incubator" : "main") as "main" | "incubator",
      selected_variant: i.selected_variant ?? null,
      custom_field_values: normalizeCustomFieldValues(i.custom_field_values),
    }));
    setItems(loadedItems);

    initialSnapshotRef.current = {
      order: {
        id: freshOrder.id,
        notes: freshOrder.notes ?? "",
        delivery_notes: freshOrder.delivery_notes ?? "",
        customer_id: freshOrder.customer_id ?? null,
        shipping_address_id: freshOrder.shipping_address_id ?? null,
        payment_status: freshOrder.payment_status,
        fulfillment_status: freshOrder.fulfillment_status,
        status: freshOrder.status,
        payment_method: freshOrder.payment_method ?? null,
        discount: Number(freshOrder.discount ?? 0),
        shipping: Number(freshOrder.shipping ?? 0),
        tax_rate: Number(freshOrder.tax_rate ?? 0),
        advance_paid: Number(freshOrder.advance_paid ?? 0),
        order_date: freshOrder.order_date,
      },
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
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["variants"] });
    qc.invalidateQueries({ queryKey: ["activity_logs"] });
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
      if (isDirty && !hasSavedDraft && !isReadOnly && !saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, hasSavedDraft, isReadOnly, saving]);

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
        <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm p-6 space-y-4">
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
    const LEGACY = new Set(["Abaya Atelier", "أباية أتيليه"]);
    const rawBrand = (settings.business_name ?? "").trim();
    const brand =
      !rawBrand || LEGACY.has(rawBrand) ? (lang === "ar" ? "بوتيك" : "Boutq") : rawBrand;

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
      })),
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

  const method = String(order?.payment_method || "").toLowerCase();
  const isCod = ["cash", "cod"].includes(method);
  const isUnpaid = (order?.payment_status ?? "unpaid") === "unpaid";
  const isPickup = String(order?.fulfillment_method || "").toLowerCase() === "pickup";

  const renderTopPrimaryAction = () => {
    if (isCreationMode || !order) return null;
    const computedOrderType = detectOrderType(items, order?.order_type);
    const workflow = getOrderWorkflow({ ...order, order_type: computedOrderType });

    if (workflow.nextAction === "send_to_tailor") {
      return (
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  status: "sent_to_tailor",
                  fulfillment_status: "SENT_TO_TAILOR",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم تحويل الطلب للخياط وتحديث الحالة" : "Sent to tailor",
              );
              await logActivity({
                action: "status_change",
                order_id: order.id,
                en: "Sent order to tailor for customization/stitching",
                ar: "تحويل الطلب إلى الخياط للتفصيل والتفصيل الخياطي",
              });
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
              qc.invalidateQueries({ queryKey: ["activity_logs"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Scissors className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "إرسال للخياط" : "Send to Tailor"}
        </Button>
      );
    }

    if (workflow.nextAction === "receive_from_tailor") {
      return (
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  status: "received_from_tailor",
                  fulfillment_status: "RECEIVED_FROM_TAILOR",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم استلام الطلب من الخياط وتجهيزه" : "Received from tailor",
              );
              await logActivity({
                action: "status_change",
                order_id: order.id,
                en: "Received customized order from tailor",
                ar: "تم استلام الطلب الجاهز من الخياط",
              });
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
              qc.invalidateQueries({ queryKey: ["activity_logs"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <PackageCheck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "استلام من الخياط" : "Receive from Tailor"}
        </Button>
      );
    }

    if (workflow.nextAction === "start_packing") {
      return (
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  status: "packing",
                  fulfillment_status: "PACKING",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "بدء تعبئة وتغليف الطلب الجاهز" : "Start packing order",
              );
              await logActivity({
                action: "status_change",
                order_id: order.id,
                en: "Started packing order items",
                ar: "بدء تعبئة وتغليف منتجات الطلب",
              });
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
              qc.invalidateQueries({ queryKey: ["activity_logs"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Box className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "بدء التعبئة والتغليف" : "Start Packing"}
        </Button>
      );
    }

    if (workflow.nextAction === "mark_ready_pickup") {
      return (
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  status: "ready_for_pickup",
                  fulfillment_status: "READY_FOR_PICKUP",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم تجهيز الطلب للاستلام في المحل" : "Marked ready for pickup",
              );
              await logActivity({
                action: "status_change",
                order_id: order.id,
                en: "Marked order ready for in-store pickup",
                ar: "تجهيز الطلب للاستلام من الفرع/المحل",
              });
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
              qc.invalidateQueries({ queryKey: ["activity_logs"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Store className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "جاهز للاستلام" : "Mark Ready for Pickup"}
        </Button>
      );
    }

    if (workflow.nextAction === "mark_shipped") {
      return (
        <Button
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  status: "shipped",
                  fulfillment_status: "SHIPPED",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم شحن الطلب وتسليمه للمندوب" : "Marked shipped / in transit",
              );
              await logActivity({
                action: "status_change",
                order_id: order.id,
                en: "Marked order shipped / handed to courier",
                ar: "تم تسليم الطلب لشركة الشحن/المندوب",
              });
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
              qc.invalidateQueries({ queryKey: ["activity_logs"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تم الشحن" : "Mark Shipped"}
        </Button>
      );
    }

    if (workflow.nextAction === "mark_completed") {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  status: "completed",
                  fulfillment_status: "COMPLETED",
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم تسليم الطلب وإتمامه بنجاح" : "Order completed successfully",
              );
              await logActivity({
                action: "status_change",
                order_id: order.id,
                en: "Completed order delivery",
                ar: "تم إكمال وتسليم الطلب بنجاح",
              });
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
              qc.invalidateQueries({ queryKey: ["activity_logs"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete order"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "إكمال التسليم" : "Complete Order"}
        </Button>
      );
    }

    if (workflow.nextAction === "pack_and_ship") {
      return (
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "ASSIGNED",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم جاهزية الطلب وتعيينه للمندوب" : "Packed & Assigned to Courier",
              );
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تجهيز وتعيين المندوب" : "Pack & Assign"}
        </Button>
      );
    }

    if (workflow.nextAction === "confirm_pickup") {
      return (
        <Button
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "SHIPPED",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar"
                  ? "تم استلام الشحنة من المندوب وخرجت للتوصيل"
                  : "Courier picked up parcel - Out for Delivery",
              );
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <Truck className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تأكيد استلام المندوب (خرج للتوصيل)" : "Confirm Pickup (Start Transit)"}
        </Button>
      );
    }

    if (workflow.nextAction === "validate_payment") {
      return (
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          disabled={approvingBenefit}
          onClick={approveBenefitPayment}
        >
          {approvingBenefit ? (
            <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
          ) : (
            <Receipt className="h-4 w-4 me-1.5" />
          )}
          {lang === "ar" ? "اعتماد دفع البنفت" : "Approve Benefit Payment"}
        </Button>
      );
    }

    if (workflow.nextAction === "mark_delivered" || workflow.nextAction === "collect_and_deliver") {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const updatePayload: Record<string, any> = {
                fulfillment_status: "COMPLETED",
                status: "completed",
                delivered_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              if (
                workflow.nextAction === "collect_and_deliver" ||
                workflow.nextAction === "collect_and_hand_over" ||
                order.payment_method === "cod"
              ) {
                updatePayload.payment_status = "paid";
              }
              const { error } = await supabase
                .from("orders")
                .update(updatePayload as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(
                lang === "ar" ? "تم تسجيل تسليم الطلب وإتمامه" : "Order delivered & completed",
              );
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message ||
                  (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete delivery"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تسليم الطلب" : "Mark Delivered"}
        </Button>
      );
    }

    if (workflow.nextAction === "prepare_pickup") {
      return (
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "READY_FOR_PICKUP",
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تجهيز الطلب للاستلام" : "Ready for pickup");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message || (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تجهيز للاستلام" : "Prepare for Pickup"}
        </Button>
      );
    }

    if (
      workflow.nextAction === "hand_over_pickup" ||
      workflow.nextAction === "collect_and_hand_over"
    ) {
      return (
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
          onClick={async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  fulfillment_status: "COMPLETED",
                  status: "completed",
                  delivered_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as any)
                .eq("id", order.id);
              if (error) throw error;
              toast.success(lang === "ar" ? "تم تسليم الطلب للعميل" : "Handed over to customer");
              await orderQ.refetch();
              qc.invalidateQueries({ queryKey: ["orders"] });
            } catch (err: any) {
              toast.error(
                err?.message ||
                  (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete handover"),
              );
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4 me-1.5" />
          {lang === "ar" ? "تسليم العميل" : "Hand Over"}
        </Button>
      );
    }

    return null;
  };

  const renderMobileActionBar = () => (
    <div
      className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3"
      aria-label={lang === "ar" ? "إجراءات الطلب" : "Order actions"}
    >
      {!isReadOnly && (isDirty || isCreationMode) ? (
        <Button
          onClick={save}
          disabled={saving}
          className="min-h-11 flex-1 rounded-xl font-bold shadow-md"
        >
          {saving ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="me-2 h-4 w-4" />
          )}
          {isCreationMode
            ? lang === "ar"
              ? "إنشاء وحفظ"
              : "Create & save"
            : lang === "ar"
              ? "حفظ التغييرات"
              : "Save changes"}
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:rounded-xl">
          {renderTopPrimaryAction() || (
            <Button
              variant="outline"
              onClick={() => scrollToSection("sec-overview")}
              className="font-bold"
            >
              {lang === "ar" ? "عرض تفاصيل الطلب" : "Review order details"}
            </Button>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-xl bg-card"
        onClick={() => setMobileActionsOpen(true)}
        aria-label={lang === "ar" ? "المزيد من إجراءات الطلب" : "More order actions"}
      >
        <MoreHorizontal className="h-5 w-5" />
      </Button>
    </div>
  );

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
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["activity_logs"] });
    } catch (err: any) {
      toast.error(
        err?.message || (lang === "ar" ? "تعذر تحديث حالة الطلب" : "Unable to update order status"),
      );
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
          isCreationMode={isCreationMode}
          isReadOnly={isReadOnly}
          isAdmin={isAdmin}
          isDirty={isDirty}
          saving={saving}
          paymentBadge={paymentBadge}
          onSave={save}
          onUnlock={() => setEditingUnlocked(true)}
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

        {/* Mobile Segmented Control Tab Bar (< 768px) */}
        {!isCreationMode && (
          <div className="no-print sm:hidden my-3 grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1.5 border border-border/70 select-none shadow-2xs">
            <button
              type="button"
              onClick={() => setMobileTab("items")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
                mobileTab === "items"
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
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
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <UserRound className="h-4 w-4 shrink-0" />
              <span>{lang === "ar" ? "العميل والتوصيل" : "Customer"}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("activity")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-extrabold transition-all touch-manipulation min-h-10",
                mobileTab === "activity"
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span>{lang === "ar" ? "النشاط" : "Activity"}</span>
            </button>
          </div>
        )}

        {/* Desktop Section Navigation Bar (≥ 768px) */}
        {!isCreationMode && (
          <div className="no-print mb-3 hidden sm:flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card/90 p-1.5 shadow-sm select-none sm:mb-6 sm:rounded-xl">
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
              <Card
                id="sec-overview"
                className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:bg-card/40 sm:p-6 sm:shadow-lg"
              >
                <div className="mb-4">
                  <Label className="flex items-center gap-2">
                    <Search className="h-3 w-3" /> {t("customers.searchByPhone")}
                  </Label>
                  <Input
                    className="text-start"
                    placeholder={t("customers.searchByPhonePh")}
                    value={phoneSearch}
                    onChange={(e) => {
                      const q = e.target.value;
                      setPhoneSearch(q);
                      const digits = q.replace(/\D/g, "");
                      if (digits.length < 3) return;
                      const match = (customersQ.data ?? []).find((c: any) =>
                        (c.phone ?? "").replace(/\D/g, "").includes(digits),
                      );
                      if (match) {
                        const def =
                          (addressesQ.data ?? []).find(
                            (a) => a.customer_id === match.id && a.is_default,
                          ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === match.id);
                        setOrder({
                          ...order,
                          customer_id: match.id,
                          shipping_address_id: def?.id ?? null,
                        });
                      }
                    }}
                  />
                  {phoneSearch.replace(/\D/g, "").length >= 3 &&
                    !(customersQ.data ?? []).some((c: any) =>
                      (c.phone ?? "").replace(/\D/g, "").includes(phoneSearch.replace(/\D/g, "")),
                    ) && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        {t("customers.noMatch")}
                      </p>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>{t("orderDetail.customer")}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px] font-semibold text-primary"
                        onClick={() => setNewCustomerOpen(true)}
                      >
                        <Plus className="h-3 w-3 me-1" />
                        {lang === "ar" ? "زبون جديد" : "New Customer"}
                      </Button>
                    </div>
                    <Select
                      value={order.customer_id ?? "none"}
                      onValueChange={(v) => {
                        const cid = v === "none" ? null : v;
                        const def = cid
                          ? ((addressesQ.data ?? []).find(
                              (a) => a.customer_id === cid && a.is_default,
                            ) ?? (addressesQ.data ?? []).find((a) => a.customer_id === cid))
                          : null;
                        setOrder({
                          ...order,
                          customer_id: cid,
                          shipping_address_id: def?.id ?? null,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("orderDetail.noCustomerOption")}</SelectItem>
                        {(customersQ.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.phone ? ` — ${c.phone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {order.customer_id &&
                  (() => {
                    const selected = (customersQ.data ?? []).find(
                      (c: any) => c.id === order.customer_id,
                    );
                    if (!selected) return null;
                    const customerAddrs = (addressesQ.data ?? []).filter(
                      (a) => a.customer_id === order.customer_id,
                    );
                    const legacyLines = formatDeliveryAddress(selected, lang);
                    return (
                      <div className="mt-4 pt-4 border-t border-border text-start">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                          {order.fulfillment_method === "digital"
                            ? lang === "ar"
                              ? "بيانات العميل"
                              : "Customer details"
                            : t("orderDetail.deliveryAddress")}
                        </p>
                        <p className="font-medium">{selected.name}</p>
                        {selected.email && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5 break-all">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <a href={`mailto:${selected.email}`} className="hover:underline">
                              {selected.email}
                            </a>
                          </p>
                        )}
                        {selected.phone && (
                          <p className="text-sm text-muted-foreground">{selected.phone}</p>
                        )}
                        {order.fulfillment_method === "delivery" &&
                        legacyLines.length > 0 &&
                        customerAddrs.length === 0
                          ? legacyLines.map((line, index) => (
                              <p key={index} className="text-sm text-muted-foreground">
                                {line}
                              </p>
                            ))
                          : null}
                      </div>
                    );
                  })()}
                {(() => {
                  const method = order.fulfillment_method ?? "delivery";
                  const deliveryEnabled = Boolean((settingsQ.data as any).delivery_enabled);
                  const pickupEnabled = Boolean((settingsQ.data as any).pickup_enabled);
                  const digitalEnabled = Boolean((settingsQ.data as any).digital_delivery_enabled);
                  const defaultDeliveryFee = Number((settingsQ.data as any).delivery_fee ?? 0);
                  const selectedCustomer = (customersQ.data ?? []).find(
                    (c: any) => c.id === order.customer_id,
                  );
                  const selectedAddress = (addressesQ.data ?? []).find(
                    (a) => a.id === order.shipping_address_id,
                  );
                  const storedAddressSnapshot = (order as any)
                    .delivery_address_snapshot as StructuredAddress | null;
                  const snapshotMatchesSavedSelection =
                    storedAddressSnapshot &&
                    (!order.shipping_address_id ||
                      !storedAddressSnapshot.id ||
                      storedAddressSnapshot.id === order.shipping_address_id);
                  const addressSnapshot =
                    (snapshotMatchesSavedSelection ? storedAddressSnapshot : null) ??
                    selectedAddress ??
                    storedAddressSnapshot ??
                    (selectedCustomer as StructuredAddress | null);
                  const selectedBranch = (branchesQ.data ?? []).find(
                    (b: any) => b.id === order.branch_id,
                  );
                  const address = selectedAddress
                    ? formatAddressLine(selectedAddress as StructuredAddress, lang)
                    : formatDeliveryAddress(selectedCustomer, lang).join("، ");
                  const branchName = selectedBranch
                    ? lang === "ar"
                      ? selectedBranch.name_ar || selectedBranch.name_en
                      : selectedBranch.name_en || selectedBranch.name_ar
                    : null;
                  const branchLocation = selectedBranch
                    ? lang === "ar"
                      ? selectedBranch.location_ar || selectedBranch.location_en
                      : selectedBranch.location_en || selectedBranch.location_ar
                    : null;
                  const customerAddresses = (addressesQ.data ?? []).filter(
                    (item) => item.customer_id === order.customer_id,
                  );
                  const defaultAddress =
                    customerAddresses.find((item) => item.is_default) ??
                    customerAddresses[0] ??
                    null;
                  const title =
                    method === "digital"
                      ? lang === "ar"
                        ? "تسليم رقمي"
                        : "Digital delivery"
                      : method === "pickup"
                        ? lang === "ar"
                          ? "استلام"
                          : "Pickup"
                        : lang === "ar"
                          ? "توصيل"
                          : "Delivery";
                  return (
                    <div className="mt-5 overflow-hidden rounded-xl border bg-muted/20 text-start shadow-sm">
                      <div className="flex flex-col gap-2.5 border-b bg-muted/50 px-4 py-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {lang === "ar" ? "طريقة التسليم" : "FULFILLMENT"}
                          </p>
                          <p className="text-base font-semibold leading-tight text-foreground mt-0.5">
                            {title}
                          </p>
                        </div>
                        <div className="w-full">
                          <Label className="sr-only">
                            {lang === "ar" ? "طريقة التسليم" : "Fulfillment method"}
                          </Label>
                          <Select
                            value={method}
                            onValueChange={(value) =>
                              setOrder({
                                ...order,
                                fulfillment_method: value,
                                branch_id: value === "pickup" ? (order.branch_id ?? null) : null,
                                shipping_address_id:
                                  value === "delivery"
                                    ? (order.shipping_address_id ?? defaultAddress?.id ?? null)
                                    : null,
                                shipping:
                                  value === "delivery"
                                    ? isCreationMode
                                      ? defaultDeliveryFee
                                      : Number(order.shipping ?? defaultDeliveryFee)
                                    : 0,
                              })
                            }
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(pickupEnabled || method === "pickup") && (
                                <SelectItem value="pickup">
                                  {lang === "ar" ? "استلام" : "Pickup"}
                                </SelectItem>
                              )}
                              {(deliveryEnabled || method === "delivery") && (
                                <SelectItem value="delivery">
                                  {lang === "ar" ? "توصيل للمنزل" : "Home Delivery"}
                                </SelectItem>
                              )}
                              {(digitalEnabled || method === "digital") && (
                                <SelectItem value="digital">
                                  {lang === "ar" ? "تسليم رقمي" : "Digital Delivery"}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="p-4">
                        {method === "delivery" && isAdmin && (
                          <div className="mb-4 space-y-3 rounded-lg border bg-background p-3">
                            <Label>
                              {lang === "ar" ? "مندوب التوصيل المسند" : "Assigned courier"}
                            </Label>
                            <Select
                              value={order.assigned_to ?? "unassigned"}
                              onValueChange={assignCourier}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">
                                  {lang === "ar" ? "غير مسند" : "Unassigned"}
                                </SelectItem>
                                {(couriersQ.data ?? []).map((courier: any) => (
                                  <SelectItem key={courier.id} value={courier.id}>
                                    {courier.name || courier.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {(() => {
                              if (!order.assigned_to) return null;
                              const assignedCourierObj = (couriersQ.data ?? []).find(
                                (c: any) => c.id === order.assigned_to,
                              );
                              const notifiedAgo = formatNotifiedTimeAgo(
                                (order as any).courier_notified_at,
                                lang,
                              );
                              return (
                                <div className="space-y-2 pt-2 border-t">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    {notifiedAgo ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-bold px-2.5 py-1">
                                        🔔{" "}
                                        {lang === "ar"
                                          ? `تم الإشعار (${notifiedAgo})`
                                          : `Notified ${notifiedAgo}`}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-[11px] font-bold px-2.5 py-1">
                                        ⏳{" "}
                                        {lang === "ar"
                                          ? "لم يتم الإشعار عبر واتساب بعد"
                                          : "WhatsApp notification pending"}
                                      </span>
                                    )}

                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 shadow-sm flex items-center gap-1.5"
                                      onClick={() => setWaModalOpen(true)}
                                    >
                                      📱{" "}
                                      {lang === "ar"
                                        ? `إشعار ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "المندوب"} عبر واتساب`
                                        : `Notify ${assignedCourierObj?.name ? assignedCourierObj.name.split(" ")[0] : "Courier"} on WhatsApp`}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                              <span className="text-muted-foreground">
                                {lang === "ar" ? "حالة التوصيل:" : "Delivery status:"}
                              </span>
                              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                                {getFulfillmentLabel(order.fulfillment_status, lang)}
                              </span>
                              {order.payment_method === "cod" && (
                                <span
                                  className={`rounded-full px-2.5 py-1 font-medium ${order.cod_collected_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                                >
                                  {order.cod_collected_at
                                    ? `${lang === "ar" ? "تم استلام النقد" : "Cash received"}: ${formatMoney(Number(order.cod_collected_amount || 0), order.currency || "BHD")}`
                                    : lang === "ar"
                                      ? "النقد بانتظار التحصيل"
                                      : "Cash collection pending"}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {method === "digital" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label>{lang === "ar" ? "قناة التسليم" : "Delivery channel"}</Label>
                              <Select
                                value={order.digital_delivery_channel ?? "email"}
                                onValueChange={(value) =>
                                  setOrder({ ...order, digital_delivery_channel: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="email">
                                    {lang === "ar" ? "البريد الإلكتروني" : "Email"}
                                  </SelectItem>
                                  <SelectItem value="whatsapp">
                                    {lang === "ar" ? "واتساب" : "WhatsApp"}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>
                                {order.digital_delivery_channel === "whatsapp"
                                  ? lang === "ar"
                                    ? "رقم أو معرّف واتساب"
                                    : "WhatsApp number or user ID"
                                  : lang === "ar"
                                    ? "البريد الإلكتروني"
                                    : "Email address"}
                              </Label>
                              <Input
                                dir="ltr"
                                value={order.digital_delivery_contact ?? ""}
                                onChange={(e) =>
                                  setOrder({ ...order, digital_delivery_contact: e.target.value })
                                }
                              />
                            </div>
                          </div>
                        ) : method === "pickup" ? (
                          <div className="space-y-2">
                            <Label>{lang === "ar" ? "فرع الاستلام" : "Pickup location"}</Label>
                            <Select
                              value={order.branch_id ?? ""}
                              onValueChange={(branchId) =>
                                setOrder({ ...order, branch_id: branchId })
                              }
                            >
                              <SelectTrigger className="text-start">
                                <SelectValue
                                  placeholder={lang === "ar" ? "اختر الفرع" : "Select a branch"}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {(branchesQ.data ?? []).map((branch: any) => {
                                  const name =
                                    lang === "ar"
                                      ? branch.name_ar || branch.name_en
                                      : branch.name_en || branch.name_ar;
                                  const location =
                                    lang === "ar"
                                      ? branch.location_ar || branch.location_en
                                      : branch.location_en || branch.location_ar;
                                  return (
                                    <SelectItem key={branch.id} value={branch.id}>
                                      {name}
                                      {location ? ` — ${location}` : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {selectedBranch && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{branchName}</span>
                                {branchLocation ? ` — ${branchLocation}` : ""}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="grid gap-4 grid-cols-1">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label>
                                  {lang === "ar" ? "عنوان التوصيل" : "Delivery address"}
                                </Label>
                                {defaultAddress && (
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-primary hover:underline"
                                    onClick={() =>
                                      setOrder({ ...order, shipping_address_id: defaultAddress.id })
                                    }
                                  >
                                    {lang === "ar"
                                      ? "استخدام عنوان ملف العميل"
                                      : "Use Customer Profile Address"}
                                  </button>
                                )}
                              </div>
                              <Select
                                value={order.shipping_address_id ?? ""}
                                onValueChange={(addressId) =>
                                  setOrder({ ...order, shipping_address_id: addressId })
                                }
                              >
                                <SelectTrigger className="text-start">
                                  <SelectValue
                                    placeholder={
                                      lang === "ar" ? "اختر عنواناً" : "Select an address"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {customerAddresses.map((savedAddress) => (
                                    <SelectItem key={savedAddress.id} value={savedAddress.id}>
                                      {savedAddress.label || t("customers.address")}
                                      {savedAddress.is_default ? " ★" : ""} —{" "}
                                      {formatAddressLine(savedAddress as StructuredAddress, lang) ||
                                        "—"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {addressSnapshot && (
                                <DeliveryAddressCard
                                  address={addressSnapshot}
                                  lang={lang}
                                  compact
                                  showLabel={false}
                                />
                              )}
                              <p className="hidden text-sm text-muted-foreground">
                                {address ||
                                  (lang === "ar"
                                    ? "لا يوجد عنوان توصيل محفوظ لهذا العميل"
                                    : "No saved delivery address for this customer")}
                              </p>
                            </div>
                            <div>
                              <Label>{lang === "ar" ? "رسوم التوصيل" : "Delivery fee"}</Label>
                              <BhdFeeInput
                                value={Number(order.shipping ?? 0)}
                                disabled={isReadOnly}
                                onChange={(shipping) => setOrder({ ...order, shipping })}
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatMoney(Number(order.shipping ?? 0), order.currency ?? "BHD")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <Label>{t("orderDetail.notes")}</Label>
                    <Textarea
                      value={order.notes ?? ""}
                      onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                      rows={3}
                      placeholder={lang === "ar" ? "ملاحظات داخلية للطلب" : "Internal order notes"}
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-bold mb-1.5">
                      <Truck className="h-4 w-4" />
                      {lang === "ar"
                        ? "ملاحظات التوصيل وسجل السائق"
                        : "Courier Delivery Notes & Trace"}
                    </Label>
                    <Textarea
                      value={order.delivery_notes ?? ""}
                      onChange={(e) => setOrder({ ...order, delivery_notes: e.target.value })}
                      rows={3}
                      placeholder={
                        lang === "ar"
                          ? "ملاحظات السائق وسجل التوصيل"
                          : "Driver notes and courier logs"
                      }
                      className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 font-mono text-xs"
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* LEFT COLUMN (65% width) - Products, Line Items & Notes */}
            <div className="space-y-3 sm:space-y-6 lg:col-span-2">
              <Card
                id="sec-items"
                className={cn(
                  "scroll-mt-24 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:bg-card/40 sm:p-6 sm:shadow-lg",
                  mobileTab !== "items" && "hidden sm:block",
                )}
              >
                <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                  <h3 className="font-display text-lg">{t("orderDetail.lineItems")}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="bg-primary text-primary-foreground font-semibold"
                      onClick={() => setProductSearchOpen(true)}
                    >
                      <Search className="h-3.5 w-3.5 me-1.5" />
                      {lang === "ar" ? "بحث المنتجات والـ SKU" : "Search Products & SKUs"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={openBarcodeScanner}>
                      <ScanLine className="h-3.5 w-3.5 me-1.5" />
                      {lang === "ar" ? "مسح الباركود" : "Scan Barcode"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={addItem}>
                      <Plus className="h-3.5 w-3.5 me-1.5" /> {t("orderDetail.addLine")}
                    </Button>
                  </div>
                </div>
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("orderDetail.noLines")}</p>
                )}
                <div className="space-y-3">
                  {items.map((it, idx) => {
                    const variant = it.variant_id
                      ? (variantsQ.data ?? []).find((x: any) => x.id === it.variant_id)
                      : null;
                    const product =
                      (variant
                        ? productsQ.data?.find((x: any) => x.id === (variant as any).product_id)
                        : null) ??
                      (it.product_id
                        ? (productsQ.data ?? []).find((x: any) => x.id === it.product_id)
                        : null) ??
                      (productsQ.data ?? []).find((x: any) =>
                        it.description && x.name
                          ? String(it.description)
                              .trim()
                              .toLowerCase()
                              .includes(String(x.name).trim().toLowerCase()) ||
                            String(x.name)
                              .trim()
                              .toLowerCase()
                              .includes(String(it.description).trim().toLowerCase())
                          : false,
                      );

                    const getMediaUrl = (obj: any) => {
                      if (!obj) return null;
                      if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                      if (typeof obj.image === "string" && obj.image) return obj.image;
                      if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                      if (Array.isArray(obj.media) && obj.media[0]) {
                        const m = obj.media[0];
                        return typeof m === "string" ? m : m.url || m.poster_url || null;
                      }
                      return null;
                    };

                    const imageUrl = getMediaUrl(variant) || getMediaUrl(product);
                    const sku = (variant as any)?.sku || (product as any)?.sku;
                    const mainStock = Number((variant as any)?.stock_main ?? 0);
                    const incStock = Number((variant as any)?.stock_incubator ?? 0);
                    const isAr = lang === "ar";
                    return (
                      <div
                        key={idx}
                        className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs transition-all"
                      >
                        {/* Item Thumbnail & SKU Header */}
                        <div className="flex items-center gap-3 pb-2.5 border-b border-border/60">
                          <div className="h-12 w-12 rounded-lg border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={it.description || ""}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate text-foreground">
                              {it.description ||
                                (product?.name ?? (isAr ? "منتج مخصص" : "Custom Item"))}
                            </p>
                            {sku ? (
                              <span className="inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/60 mt-1">
                                SKU: {sku}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                {(it.custom_field_values && it.custom_field_values.length > 0) ||
                                String(it.selected_variant?.size ?? "").includes("تفصيل")
                                  ? isAr
                                    ? "تفصيل خاص"
                                    : "Custom Tailoring"
                                  : variant
                                    ? `${variant.size || ""} ${variant.color || ""}`.trim() ||
                                      (isAr ? "خيار" : "Variant")
                                    : isAr
                                      ? "بند مخصص"
                                      : "Custom Line"}
                              </span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-semibold gap-1.5 shrink-0 rounded-lg border border-border/80 touch-manipulation"
                            onClick={() => setEditingItemSheetIdx(idx)}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{isAr ? "تعديل المنتج" : "Product / Edit"}</span>
                          </Button>
                        </div>

                        {/* Mobile Read-Only Compact Summary Row (< 640px) */}
                        <div className="flex sm:hidden items-center justify-between gap-2 pt-1 pb-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <span className="bg-muted/80 text-foreground px-2.5 py-1 rounded-md border border-border/60">
                              {it.quantity} × {formatMoney(it.unit_price, currency)}
                            </span>
                          </div>
                          <div className="text-end">
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                              {isAr ? "المجموع" : "Total"}
                            </span>
                            <span className="font-extrabold text-sm text-foreground">
                              {formatMoney(it.line_total, currency)}
                            </span>
                          </div>
                        </div>

                        {/* Desktop Full Inline Input Grid (>= 640px) */}
                        <div className="hidden sm:grid sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-3">
                            <Label>{t("orderDetail.fromInventory")}</Label>
                            <Select
                              value={it.variant_id ?? "custom"}
                              onValueChange={(v) => {
                                if (v === "custom") {
                                  updateItem(idx, { variant_id: null });
                                } else {
                                  pickVariant(idx, v);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t("orderDetail.pickVariant")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="custom">
                                  {isAr
                                    ? "تفصيل خاص / بدون مخزون جاهز"
                                    : "Custom Tailoring / No Ready Stock"}
                                </SelectItem>
                                {(variantsQ.data ?? []).map((v: any) => {
                                  const p = productsQ.data?.find((x: any) => x.id === v.product_id);
                                  if (!p) return null;
                                  return (
                                    <SelectItem key={v.id} value={v.id}>
                                      {p.name} {v.size ? `· ${v.size}` : ""}{" "}
                                      {v.color ? `· ${v.color}` : ""} —{" "}
                                      {formatMoney(v.selling_price, currency)}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="sm:col-span-3">
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              {t("orderDetail.description")}
                            </Label>
                            {editingItems[idx] ? (
                              <Textarea
                                rows={2}
                                value={it.description}
                                onChange={(e) => updateItem(idx, { description: e.target.value })}
                                className="text-sm leading-snug"
                              />
                            ) : (
                              <div className="text-xs font-medium text-foreground bg-muted/20 border border-border/60 rounded-lg p-2.5 min-h-[42px] flex items-center">
                                {it.description ||
                                  (isAr ? "لا يوجد وصف إضافي" : "No additional description")}
                              </div>
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <Label>{t("orderDetail.qty")}</Label>
                            <div className="flex items-center rounded-lg border border-border/80 bg-background overflow-hidden h-9 shadow-2xs mt-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-8 shrink-0 rounded-none hover:bg-muted active:scale-95 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  updateItem(idx, {
                                    quantity: Math.max(1, Number(it.quantity || 1) - 1),
                                  })
                                }
                                title={isAr ? "إنقاص الكمية" : "Decrease quantity"}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                value={it.quantity}
                                onChange={(e) =>
                                  updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })
                                }
                                className="h-9 w-12 border-0 p-0 text-center font-bold text-xs focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-8 shrink-0 rounded-none hover:bg-muted active:scale-95 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  updateItem(idx, { quantity: Number(it.quantity || 1) + 1 })
                                }
                                title={isAr ? "زيادة الكمية" : "Increase quantity"}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="sm:col-span-3">
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              {t("orderDetail.unitPrice")}
                            </Label>
                            {editingItems[idx] ? (
                              <Input
                                type="number"
                                step="0.001"
                                value={it.unit_price}
                                onChange={(e) =>
                                  updateItem(idx, { unit_price: Number(e.target.value) })
                                }
                              />
                            ) : (
                              <div className="text-xs font-bold text-foreground bg-muted/20 border border-border/60 rounded-lg p-2.5 min-h-[42px] flex items-center">
                                {formatMoney(it.unit_price, currency)}
                              </div>
                            )}
                            {Number(it.original_price ?? (variant as any)?.original_price ?? 0) >
                              Number(it.unit_price) && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {isAr ? "السعر الأصلي" : "Original"}:{" "}
                                <span className="line-through">
                                  {formatMoney(
                                    Number(it.original_price ?? (variant as any)?.original_price),
                                    currency,
                                  )}
                                </span>
                                <span className="mx-1">·</span>
                                {isAr ? "سعر التخفيض" : "Sale"}:{" "}
                                <span className="font-medium text-foreground">
                                  {formatMoney(it.unit_price, currency)}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        {!it.variant_id ||
                        (it.selected_variant?.size &&
                          String(it.selected_variant.size).includes("تفصيل")) ||
                        (it.custom_field_values && it.custom_field_values.length > 0) ? (
                          <div className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs font-medium text-primary flex items-center gap-1.5">
                            <span>
                              ✂️{" "}
                              {isAr
                                ? "طلب تفصيل خاص (ينفّذ بعد الطلب - لا يخصم من المخزون الجاهز)"
                                : "Custom Tailoring (Made-To-Order · No Ready Inventory Deduction)"}
                            </span>
                          </div>
                        ) : (
                          it.variant_id && (
                            <div>
                              <Label className="text-xs">
                                {isAr ? "خصم المخزون من" : "Deduct Stock From"}
                              </Label>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {(
                                  [
                                    {
                                      key: "main",
                                      en: `Direct Sales · Main (${mainStock})`,
                                      ar: `الرئيسي (${mainStock})`,
                                    },
                                    {
                                      key: "incubator",
                                      en: `Incubator (${incStock})`,
                                      ar: `الحاضنة (${incStock})`,
                                    },
                                  ] as const
                                ).map((opt) => {
                                  const active = it.location === opt.key;
                                  return (
                                    <button
                                      key={opt.key}
                                      type="button"
                                      onClick={() => updateItem(idx, { location: opt.key })}
                                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                        active
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "border-border hover:bg-secondary"
                                      }`}
                                    >
                                      {isAr ? opt.ar : opt.en}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )
                        )}

                        {(it.selected_variant ||
                          (it.custom_field_values && it.custom_field_values.length > 0)) && (
                          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
                            <div className="font-medium text-sm">
                              {isAr ? "اختيارات العميل" : "Customer selections"}
                            </div>
                            {it.selected_variant && (
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {((it.custom_field_values && it.custom_field_values.length > 0) ||
                                  it.selected_variant?.size) && (
                                  <span>
                                    <b>{isAr ? "المقاس" : "Size"}:</b>{" "}
                                    {(it.custom_field_values &&
                                      it.custom_field_values.length > 0) ||
                                    String(it.selected_variant?.size ?? "").includes("تفصيل")
                                      ? isAr
                                        ? "تفصيل / قياسات خاصة"
                                        : "Custom Tailoring"
                                      : it.selected_variant?.size}
                                  </span>
                                )}
                                {it.selected_variant.color && (
                                  <span>
                                    <b>{isAr ? "اللون" : "Color"}:</b> {it.selected_variant.color}
                                  </span>
                                )}
                                {it.selected_variant.fabric && (
                                  <span>
                                    <b>{isAr ? "القماش" : "Fabric"}:</b>{" "}
                                    {it.selected_variant.fabric}
                                  </span>
                                )}
                              </div>
                            )}
                            {it.custom_field_values && it.custom_field_values.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
                                {it.custom_field_values.map((cf, i) => (
                                  <div key={i}>
                                    <b>
                                      {isAr
                                        ? cf.label_ar || cf.label_en || cf.key
                                        : cf.label_en || cf.label_ar || cf.key}
                                      :
                                    </b>{" "}
                                    {cf.value.startsWith("http") ? (
                                      <div className="inline-flex flex-col gap-1 mt-1">
                                        <a
                                          href={cf.value}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline font-semibold inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded"
                                        >
                                          📎 {isAr ? "تحميل/عرض الملف" : "View Uploaded File"}
                                        </a>
                                        {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cf.value) && (
                                          <img
                                            src={cf.value}
                                            alt=""
                                            className="mt-1 max-h-24 rounded border object-contain bg-background"
                                          />
                                        )}
                                      </div>
                                    ) : (
                                      cf.value
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {Boolean(it.product_id) && (
                          <div>
                            <Label className="text-xs">{t("orderDetail.customizations")}</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(customQ.data ?? [])
                                .filter((c: any) => {
                                  const pIds = Array.isArray(c.product_ids) ? c.product_ids : [];
                                  if (pIds.length === 0) return true;
                                  return pIds.includes(it.product_id);
                                })
                                .map((c: any) => {
                                  const active = it.customizations.some((x) => x.name === c.name);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() =>
                                        toggleCustom(idx, {
                                          name: c.name,
                                          price_delta: Number(c.price_delta),
                                        })
                                      }
                                      className={`text-xs px-2 py-1 rounded-full border ${
                                        active
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "border-border hover:bg-secondary"
                                      }`}
                                    >
                                      {c.name} +{formatMoney(c.price_delta, currency)}
                                    </button>
                                  );
                                })}
                              {(customQ.data ?? []).filter((c: any) => {
                                const pIds = Array.isArray(c.product_ids) ? c.product_ids : [];
                                if (pIds.length === 0) return true;
                                return pIds.includes(it.product_id);
                              }).length === 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {t("orderDetail.addonsHint")}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <span className="text-sm text-muted-foreground">
                            {t("orderDetail.lineTotal")}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">
                              {formatMoney(it.line_total, currency)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              aria-label={lang === "ar" ? "حذف بند الطلب" : "Remove order item"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Centered Modal Dialog for Web Desktop View (min-width: 768px) */}
                        <Dialog
                          open={editingItemSheetIdx === idx}
                          onOpenChange={(open) => setEditingItemSheetIdx(open ? idx : null)}
                        >
                          <DialogContent className="sm:max-w-[560px] w-[95vw] rounded-2xl p-6 font-sans border border-border/80 bg-card shadow-2xl space-y-5">
                            <DialogHeader className="text-start pb-3 border-b border-border/60 pe-8 ps-0 space-y-1">
                              <DialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                                <Pencil className="h-4.5 w-4.5 text-primary shrink-0" />
                                <span>{isAr ? "تعديل المنتج" : "Edit Product"}</span>
                              </DialogTitle>
                              <DialogDescription className="text-xs text-muted-foreground truncate">
                                {it.description ||
                                  (product?.name ?? (isAr ? "منتج مخصص" : "Custom Item"))}
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-1">
                              {/* Inventory Variant Picker */}
                              <div>
                                <Label className="text-xs font-semibold">
                                  {t("orderDetail.fromInventory")}
                                </Label>
                                <Select
                                  value={it.variant_id ?? "custom"}
                                  onValueChange={(v) => {
                                    if (v === "custom") {
                                      updateItem(idx, { variant_id: null });
                                    } else {
                                      pickVariant(idx, v);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                                    <SelectValue placeholder={t("orderDetail.pickVariant")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="custom">
                                      {isAr
                                        ? "تفصيل خاص / بدون مخزون جاهز"
                                        : "Custom Tailoring / No Ready Stock"}
                                    </SelectItem>
                                    {(variantsQ.data ?? []).map((v: any) => {
                                      const p = productsQ.data?.find(
                                        (x: any) => x.id === v.product_id,
                                      );
                                      if (!p) return null;
                                      return (
                                        <SelectItem key={v.id} value={v.id}>
                                          {p.name} {v.size ? `· ${v.size}` : ""}{" "}
                                          {v.color ? `· ${v.color}` : ""} —{" "}
                                          {formatMoney(v.selling_price, currency)}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Description */}
                              <div>
                                <Label className="text-xs font-semibold">
                                  {t("orderDetail.description")}
                                </Label>
                                <Textarea
                                  rows={2}
                                  value={it.description}
                                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                                  className="mt-1.5 text-xs rounded-xl resize-none"
                                />
                              </div>

                              {/* Quantity, Unit Price & Product Cost (COGS) */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs font-semibold">
                                    {t("orderDetail.qty")}
                                  </Label>
                                  <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden h-10 mt-1.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-10 w-10 shrink-0"
                                      onClick={() =>
                                        updateItem(idx, {
                                          quantity: Math.max(1, Number(it.quantity || 1) - 1),
                                        })
                                      }
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={it.quantity}
                                      onChange={(e) =>
                                        updateItem(idx, {
                                          quantity: Math.max(1, Number(e.target.value)),
                                        })
                                      }
                                      className="h-10 border-0 text-center font-bold text-sm bg-transparent"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-10 w-10 shrink-0"
                                      onClick={() =>
                                        updateItem(idx, {
                                          quantity: Number(it.quantity || 1) + 1,
                                        })
                                      }
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                <div>
                                  <Label className="text-xs font-semibold">
                                    {t("orderDetail.unitPrice")}
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    value={it.unit_price}
                                    onChange={(e) =>
                                      updateItem(idx, { unit_price: Number(e.target.value) })
                                    }
                                    className="mt-1.5 h-10 text-sm font-bold rounded-xl"
                                  />
                                </div>

                                <div>
                                  <Label className="text-xs font-semibold">
                                    {isAr ? "تكلفة المنتج (COGS)" : "Product Cost (COGS)"}
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    placeholder="0.000"
                                    value={it.unit_cost ?? ""}
                                    onChange={(e) =>
                                      updateItem(idx, {
                                        unit_cost:
                                          e.target.value === "" ? null : Number(e.target.value),
                                      })
                                    }
                                    className="mt-1.5 h-10 text-sm rounded-xl"
                                  />
                                </div>
                              </div>
                            </div>

                            <DialogFooter className="flex flex-row justify-end items-center gap-2.5 pt-3 border-t border-border/60">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 px-4 rounded-xl text-xs font-semibold"
                                onClick={() => setEditingItemSheetIdx(null)}
                              >
                                {isAr ? "إلغاء" : "Cancel"}
                              </Button>
                              <Button
                                type="button"
                                className="h-10 px-5 font-bold text-xs rounded-xl bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                                onClick={() => setEditingItemSheetIdx(null)}
                              >
                                {isAr ? "حفظ التعديلات" : "Save Changes"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    );
                  })}
                </div>
                <BarcodeScanner
                  open={scannerOpen}
                  onOpenChange={setScannerOpen}
                  onDetected={handleScanned}
                  cameraStreamPromise={cameraStreamPromise}
                />
              </Card>

              <div className="lg:hidden">
                <Label>{t("orderDetail.notes")}</Label>
                <Textarea
                  value={order.notes ?? ""}
                  onChange={(e) => setOrder({ ...order, notes: e.target.value })}
                  rows={5}
                />
              </div>
              <Card
                className={cn(
                  "overflow-hidden border border-border/60 shadow-xs rounded-2xl bg-card p-4 space-y-4",
                  mobileTab !== "items" && "hidden sm:block",
                )}
              >
                {order.payment_method === "benefit" && order.benefit_receipt_key && (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        <span className="font-semibold">
                          {lang === "ar" ? "إيصال تحويل بنفت" : "Benefit transfer receipt"}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${order.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-200 text-amber-900"}`}
                      >
                        {order.payment_status === "paid"
                          ? lang === "ar"
                            ? "تم التحقق"
                            : "Verified"
                          : lang === "ar"
                            ? "بانتظار التحقق"
                            : "Pending verification"}
                      </span>
                    </div>
                    {receiptViewQ.isLoading ? (
                      <div className="flex h-52 items-center justify-center rounded-lg border bg-white">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : receiptViewQ.data?.url ? (
                      <a
                        href={receiptViewQ.data.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border bg-white"
                      >
                        <img
                          src={receiptViewQ.data.url}
                          alt="Benefit payment receipt"
                          className="h-52 w-full object-contain"
                        />
                      </a>
                    ) : (
                      <div className="rounded-lg border bg-white p-5 text-center text-sm text-muted-foreground">
                        {order.benefit_receipt_deleted_at
                          ? lang === "ar"
                            ? "تم حذف صورة الإيصال حسب سياسة الاحتفاظ."
                            : "Receipt image removed under the retention policy."
                          : lang === "ar"
                            ? "تعذر تحميل صورة الإيصال الخاصة."
                            : "The private receipt could not be loaded."}
                      </div>
                    )}
                    {order.payment_status !== "paid" && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          className="bg-emerald-700 text-white hover:bg-emerald-800"
                          onClick={approveBenefitPayment}
                          disabled={approvingBenefit || rejectingBenefit}
                        >
                          {approvingBenefit ? (
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="me-2 h-4 w-4" />
                          )}
                          {lang === "ar" ? "اعتماد الدفع" : "Approve Payment"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setRejectReasonOpen(true)}
                          disabled={approvingBenefit || rejectingBenefit}
                        >
                          {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                          {lang === "ar" ? "رفض الإيصال" : "Reject Receipt"}
                        </Button>
                      </div>
                    )}
                    <Dialog
                      open={rejectReasonOpen}
                      onOpenChange={(open) => {
                        setRejectReasonOpen(open);
                        if (!open) setRejectReason("");
                      }}
                    >
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>
                            {lang === "ar" ? "رفض إيصال بنفت باي" : "Reject BenefitPay receipt"}
                          </DialogTitle>
                          <DialogDescription>
                            {lang === "ar"
                              ? "سيُرسل سبب الرفض للعميل، وستُحذف صورة الإيصال الخاصة فوراً."
                              : "The reason will be emailed to the customer and the private receipt image will be deleted immediately."}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor="benefit-rejection-reason">
                            {lang === "ar" ? "سبب الرفض" : "Rejection reason"}
                          </Label>
                          <Textarea
                            id="benefit-rejection-reason"
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            maxLength={500}
                            dir={lang === "ar" ? "rtl" : "ltr"}
                            placeholder={
                              lang === "ar"
                                ? "مثال: الإيصال غير واضح أو لا يطابق مبلغ الطلب"
                                : "For example: receipt is unclear or does not match the order amount"
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            {rejectReason.trim().length}/500
                          </p>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRejectReasonOpen(false)}
                          >
                            {lang === "ar" ? "إلغاء" : "Cancel"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={rejectBenefitPayment}
                            disabled={rejectingBenefit || rejectReason.trim().length < 3}
                          >
                            {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {lang === "ar"
                              ? "رفض الإيصال وإرسال السبب"
                              : "Reject and notify customer"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
                {/* Consolidated Financial Card Header with Toggle Button */}
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {lang === "ar" ? "الملخص المالي والرسوم" : "Financial Summary & Ledger"}
                    </span>
                  </div>
                  {!isReadOnly && (
                    <Button
                      type="button"
                      variant={isEditingFees ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setIsEditingFees(!isEditingFees)}
                      className="h-7 px-2.5 text-xs font-bold rounded-xl gap-1.5 border-border/80"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>
                        {isEditingFees
                          ? lang === "ar"
                            ? "إغلاق التعديل"
                            : "Done Editing"
                          : lang === "ar"
                            ? "تعديل الرسوم والخصم"
                            : "Edit Fees & Discounts"}
                      </span>
                    </Button>
                  )}
                </div>

                {/* Integrated Order & Payment Channel Summary Strip */}
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
                  <div>
                    <span className="text-[11px] text-muted-foreground block font-medium">
                      {t("orderDetail.orderDate")}
                    </span>
                    <span className="font-bold text-foreground">
                      {formatDate(order.order_date, lang === "ar" ? "ar-BH" : "en-BH")}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-muted-foreground block font-medium">
                        {t("orderDetail.paymentMethod")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setManagePaymentOpen(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none cursor-pointer"
                        title={lang === "ar" ? "تعديل طريقة الدفع" : "Edit payment method"}
                      >
                        <Pencil className="h-2.5 w-2.5 shrink-0" />
                        <span>{lang === "ar" ? "تغيير" : "Edit"}</span>
                      </button>
                    </div>
                    <span className="font-bold text-foreground block mt-0.5">
                      {tPayment(order.payment_method, lang) ||
                        (lang === "ar" ? "غير محدد" : "Not specified")}
                    </span>
                  </div>
                  {getPaymentGatewayReference(order) && (
                    <div className="col-span-2 border-t border-border/40 pt-1.5 flex items-center justify-between font-mono text-[11px]">
                      <span className="text-muted-foreground">Gateway Ref:</span>
                      <span className="font-bold text-foreground truncate max-w-[200px]">
                        {getPaymentGatewayReference(order)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Collapsible Fee & Discount Edit Inputs */}
                {isEditingFees && (
                  <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3 animate-fade-in">
                    <div className="rounded-lg border bg-background p-2.5 space-y-2">
                      <Label className="text-xs font-bold">
                        {lang === "ar" ? "تطبيق رمز خصم" : "Apply Promo Code"}
                      </Label>
                      {appliedPromo ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900 text-xs font-medium">
                          <div className="flex min-w-0 items-center gap-2">
                            <Tag className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate font-mono font-bold">
                              {appliedPromo.code}
                            </span>
                            <span>− {formatMoney(appliedPromo.amount, currency)}</span>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={removeAdminPromo}
                            disabled={isReadOnly}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            value={promoInput}
                            onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void applyAdminPromo();
                              }
                            }}
                            placeholder="EID20"
                            className="uppercase h-8 text-xs font-mono"
                            disabled={isReadOnly || checkingPromo}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={applyAdminPromo}
                            disabled={isReadOnly || checkingPromo}
                            className="h-8 text-xs font-bold"
                          >
                            {checkingPromo && <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />}
                            {lang === "ar" ? "تطبيق" : "Apply"}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1 text-xs">
                          <Label className="text-xs font-bold">{t("orderDetail.discount")}</Label>
                          {!appliedPromo && !isReadOnly && (
                            <div className="flex items-center rounded-md border p-0.5 text-[10px] bg-background">
                              <button
                                type="button"
                                className={cn(
                                  "px-1.5 py-0.5 rounded font-bold transition-colors",
                                  discountMode === "fixed"
                                    ? "bg-primary text-primary-foreground shadow-2xs"
                                    : "text-muted-foreground",
                                )}
                                onClick={() => setDiscountMode("fixed")}
                              >
                                {currency}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "px-1.5 py-0.5 rounded font-bold transition-colors",
                                  discountMode === "percent"
                                    ? "bg-primary text-primary-foreground shadow-2xs"
                                    : "text-muted-foreground",
                                )}
                                onClick={() => {
                                  setDiscountMode("percent");
                                  if (totals.subtotal > 0 && order.discount > 0) {
                                    const pct = (order.discount / totals.subtotal) * 100;
                                    setDiscountPercentInput(pct.toFixed(1));
                                  }
                                }}
                              >
                                %
                              </button>
                            </div>
                          )}
                        </div>
                        {discountMode === "percent" && !appliedPromo ? (
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              placeholder="10"
                              value={discountPercentInput}
                              disabled={isReadOnly}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDiscountPercentInput(val);
                                const pct = Number(val) || 0;
                                const calculated = Number(
                                  ((totals.subtotal * pct) / 100).toFixed(3),
                                );
                                setOrder({ ...order, discount: calculated });
                              }}
                              className="h-8 text-xs font-mono"
                            />
                            <span className="absolute right-2.5 top-2 text-xs text-muted-foreground font-bold">
                              %
                            </span>
                          </div>
                        ) : (
                          <Input
                            type="number"
                            step="0.001"
                            value={order.discount}
                            disabled={isReadOnly || !!appliedPromo}
                            onChange={(e) =>
                              setOrder({ ...order, discount: Number(e.target.value) })
                            }
                            className="h-8 text-xs font-mono"
                          />
                        )}
                      </div>

                      <div>
                        <Label className="text-xs font-bold mb-1 block">
                          {t("orderDetail.shipping")}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={order.shipping}
                          onChange={(e) => setOrder({ ...order, shipping: Number(e.target.value) })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1 text-xs">
                          <Label className="text-xs font-bold">{t("orderDetail.taxRate")}</Label>
                          {!isReadOnly && (
                            <button
                              type="button"
                              className="text-[10px] text-primary font-bold hover:underline"
                              onClick={() => {
                                if (Number(order.tax_rate) > 0) {
                                  setLastNonZeroTaxRate(Number(order.tax_rate));
                                  setOrder({ ...order, tax_rate: 0 });
                                } else {
                                  setOrder({ ...order, tax_rate: lastNonZeroTaxRate || 10 });
                                }
                              }}
                            >
                              {Number(order.tax_rate) === 0 ? "Exempt (0%)" : "Tax Exempt?"}
                            </button>
                          )}
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          value={order.tax_rate}
                          onChange={(e) => setOrder({ ...order, tax_rate: Number(e.target.value) })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-bold mb-1 block">
                          {t("orderDetail.advancePaid")}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={order.advance_paid ?? 0}
                          onChange={(e) =>
                            setOrder({ ...order, advance_paid: Number(e.target.value) })
                          }
                          className="h-8 text-xs font-mono font-bold text-foreground"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-1 border-t border-border pt-3 text-sm">
                  <Row
                    label={t("orderDetail.subtotal")}
                    value={formatMoney(totals.subtotal, currency)}
                  />
                  <Row
                    label={`${t("orderDetail.discount")}${order.promo_code ? ` (Promo: ${order.promo_code})` : ""}`}
                    value={`− ${formatMoney(totals.discount, currency)}`}
                  />
                  <Row
                    label={`${t("orderDetail.vat")} (${order.tax_rate}%)`}
                    value={formatMoney(totals.taxAmount, currency)}
                  />
                  <Row
                    label={t("orderDetail.shipping")}
                    value={formatMoney(totals.shipping, currency)}
                  />
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="font-display text-lg">{t("orderDetail.total")}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg">
                        {formatMoney(totals.total, currency)}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[paymentBadge]}`}
                      >
                        {t(`payStatus.${paymentBadge}`)}
                      </span>
                    </div>
                  </div>
                  {totals.advancePaid > 0 && (
                    <>
                      <Row
                        label={t("orderDetail.advancePaid")}
                        value={`− ${formatMoney(totals.advancePaid, currency)}`}
                      />
                      <div className="flex justify-between pt-1 font-medium">
                        <span>{t("orderDetail.remaining")}</span>
                        <span>{formatMoney(totals.remaining, currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </fieldset>

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
                  items={items}
                  settings={settingsQ.data}
                  shippingAddress={chosen}
                  paymentBadge={paymentBadge}
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
          <details className="group overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm sm:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold marker:content-none">
              <span>{lang === "ar" ? "سجل النشاطات" : "Activity history"}</span>
              <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-border/60 p-4">
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
        <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
          <DialogContent className="max-w-xl p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-2 border-b">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" />
                {lang === "ar"
                  ? "البحث عن منتج أو SKU أو باركود"
                  : "Search Product, SKU, or Barcode"}
              </DialogTitle>
            </DialogHeader>
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder={
                    lang === "ar"
                      ? "اكتب للبحث بالاسم، الرمز (SKU)، المقاس، أو الباركود..."
                      : "Type product title, SKU, size, or barcode..."
                  }
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  className="ps-9 h-10 text-sm font-medium"
                />
                {productSearchQuery && (
                  <button
                    type="button"
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setProductSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="max-h-[380px] overflow-y-auto space-y-2 pe-1">
                {filteredVariantsForSearch.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {lang === "ar"
                      ? `لم يتم العثور على منتجات تطابق "${productSearchQuery}"`
                      : `No products found matching "${productSearchQuery}"`}
                  </div>
                ) : (
                  filteredVariantsForSearch.map((v: any) => {
                    const p = (productsQ.data ?? []).find((x: any) => x.id === v.product_id);
                    const title = (p as any)?.name || "Product";
                    const sku = v.sku || (p as any)?.sku;
                    const mainStock = Number(v.stock_main ?? 0);
                    const incStock = Number(v.stock_incubator ?? 0);
                    const fallbackStock = Number(v.stock ?? v.quantity ?? (p as any)?.stock ?? 0);
                    const totalStock =
                      mainStock + incStock > 0 ? mainStock + incStock : fallbackStock;
                    const price = Number(
                      v.selling_price ??
                        v.price_override ??
                        v.price ??
                        (p as any)?.selling_price ??
                        (p as any)?.base_price ??
                        (p as any)?.price ??
                        0,
                    );
                    const getMediaUrl = (obj: any) => {
                      if (!obj) return null;
                      if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                      if (typeof obj.image === "string" && obj.image) return obj.image;
                      if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                      return null;
                    };
                    const img = getMediaUrl(v) || getMediaUrl(p);

                    return (
                      <div
                        key={v.id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/70 hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-all"
                        onClick={() => handleSelectVariantFromModal(v)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-11 w-11 rounded-lg border bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                            {img ? (
                              <img src={img} alt={title} className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                              {title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                              {sku && (
                                <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded text-[10px]">
                                  {sku}
                                </span>
                              )}
                              {(v.size || v.color) && (
                                <span>{[v.size, v.color].filter(Boolean).join(" / ")}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-end shrink-0">
                          <p className="font-bold text-sm text-foreground">
                            {formatMoney(price, currency)}
                          </p>
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block mt-0.5",
                              totalStock > 0
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                            )}
                          >
                            {totalStock > 0
                              ? `${lang === "ar" ? "متوفر" : "In Stock"}: ${totalStock}`
                              : lang === "ar"
                                ? "نفذت الكمية"
                                : "Out of Stock"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Inline New Customer Dialog */}
        <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] p-4 sm:p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <UserPlus className="h-5 w-5 text-primary shrink-0" />
                {lang === "ar" ? "إضافة زبون جديد" : "Create New Customer"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {lang === "ar"
                  ? "أدخل بيانات الزبون وسيتم تعيينه مباشرة لهذا الطلب بدون فقدان التغييرات."
                  : "Enter customer details. They will be assigned to this order draft immediately."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">
                  {lang === "ar" ? "اسم الزبون *" : "Full Name *"}
                </Label>
                <Input
                  className="h-11 mt-1 text-sm"
                  placeholder={lang === "ar" ? "مثال: علي محمد" : "e.g. Ali Mohamed"}
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">
                    {lang === "ar" ? "رقم الهاتف" : "Phone Number"}
                  </Label>
                  <div className="mt-1">
                    <PhoneInput
                      value={newCustPhone}
                      onChange={setNewCustPhone}
                      placeholder="33000000"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">
                    {lang === "ar" ? "البريد الإلكتروني" : "Email Address"}
                  </Label>
                  <Input
                    className="h-11 mt-1 text-sm text-left"
                    dir="ltr"
                    type="email"
                    placeholder="ali@example.com"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="border-t pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {lang === "ar" ? "عنوان التوصيل الافتراضي" : "Default Delivery Address"}
                  </Label>
                  <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {lang === "ar" ? "اختياري" : "Optional"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Input
                    className="h-10 text-sm"
                    placeholder={lang === "ar" ? "المنطقة (مثال: المنامة)" : "Region (e.g. Manama)"}
                    value={newCustRegion}
                    onChange={(e) => setNewCustRegion(e.target.value)}
                  />
                  <Input
                    className="h-10 text-sm"
                    placeholder={lang === "ar" ? "المجمع (مثال: 321)" : "Block (e.g. 321)"}
                    value={newCustBlock}
                    onChange={(e) => setNewCustBlock(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    className="h-10 text-sm"
                    placeholder={lang === "ar" ? "الطريق" : "Road"}
                    value={newCustRoad}
                    onChange={(e) => setNewCustRoad(e.target.value)}
                  />
                  <Input
                    className="h-10 text-sm"
                    placeholder={lang === "ar" ? "المنزل" : "House"}
                    value={newCustHouse}
                    onChange={(e) => setNewCustHouse(e.target.value)}
                  />
                  <Input
                    className="h-10 text-sm"
                    placeholder={lang === "ar" ? "الشقة" : "Flat"}
                    value={newCustFlat}
                    onChange={(e) => setNewCustFlat(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewCustomerOpen(false)}
                className="w-full sm:w-auto h-11"
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                onClick={handleCreateInlineCustomer}
                disabled={creatingCustomer || !newCustName.trim()}
                className="w-full sm:w-auto h-11 bg-primary text-primary-foreground font-medium"
              >
                {creatingCustomer ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    {lang === "ar" ? "جاري الحفظ..." : "Creating..."}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 me-2" />
                    {lang === "ar" ? "حفظ وتعين الزبون" : "Save & Assign Customer"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 5. Mobile Thumb-Zone Sticky Bottom Bar (<768px) - OUTSIDE animated scroll view */}
      <OrderStickyBottomBar
        lang={lang}
        primaryAction={renderTopPrimaryAction()}
        isDirty={isDirty}
        isCreationMode={isCreationMode}
        saving={saving}
        customerPhone={getOrderCustomerPhone(order)}
        onSave={save}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const INVOICE_LABELS = {
  en: {
    invoice: "INVOICE",
    invoiceNumber: "Invoice #",
    date: "Date",
    status: "Status",
    billTo: "Bill to",
    paymentMethod: "Payment method",
    vatLabel: "VAT",
    item: "Item",
    description: "Description",
    qty: "Qty",
    unit: "Unit Price",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    vat: "VAT",
    shipping: "Shipping",
    grandTotal: "Grand Total",
    notes: "Notes",
    warmRegards: "Warm regards",
    language: "Language",
    english: "English",
    arabic: "العربية",
  },
  ar: {
    invoice: "فاتورة",
    invoiceNumber: "رقم الفاتورة",
    date: "التاريخ",
    status: "الحالة",
    billTo: "فاتورة إلى",
    paymentMethod: "طريقة الدفع",
    vatLabel: "الرقم الضريبي",
    item: "الصنف",
    description: "الوصف",
    qty: "الكمية",
    unit: "سعر الوحدة",
    price: "السعر",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    vat: "ضريبة القيمة المضافة",
    shipping: "الشحن",
    grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات",
    warmRegards: "مع أطيب التحيات",
    language: "اللغة",
    english: "English",
    arabic: "العربية",
  },
} as const;
const BRAND: Record<"en" | "ar", string> = { en: "Boutq", ar: "بوتيك" };
const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
function brandFor(lang: "en" | "ar", stored?: string | null) {
  const s = (stored ?? "").trim();
  if (!s || LEGACY_BRAND_NAMES.has(s)) return BRAND[lang];
  return s;
}

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  confirmed: { en: "Confirmed", ar: "مؤكدة" },
  paid: { en: "Paid", ar: "مدفوعة" },
  pending: { en: "Pending", ar: "قيد الانتظار" },
  shipped: { en: "Shipped", ar: "تم الشحن" },
  completed: { en: "Completed", ar: "مكتملة" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
  refunded: { en: "Refunded", ar: "مستردة" },
};

const PAYMENT_LABELS: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدًا" },
  card: { en: "Card", ar: "بطاقة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  benefit: { en: "Benefit", ar: "بنفت" },
  apple_pay: { en: "Apple Pay", ar: "أبل باي" },
  google_pay: { en: "Google Pay", ar: "جوجل باي" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
};

function tStatus(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return STATUS_LABELS[s]?.[lang] ?? s;
}
function tPayment(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return PAYMENT_LABELS[s]?.[lang] ?? s;
}

// Localize numerals (Arabic-Indic) inside a rendered money/number string
function toArabicDigits(str: string) {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[0-9]/g, (d) => map[+d]);
}

function InvoiceBranchName({
  brandId,
  branchId,
  isRTL,
}: {
  brandId: string;
  branchId: string;
  isRTL: boolean;
}) {
  const q = useQuery({
    queryKey: ["branch", brandId, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches" as any)
        .select("name_ar, name_en, location_ar, location_en")
        .eq("id", branchId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!branchId,
  });
  const b = q.data;
  if (!b) return null;
  const name = isRTL ? b.name_ar || b.name_en : b.name_en || b.name_ar;
  const loc = isRTL ? b.location_ar || b.location_en : b.location_en || b.location_ar;
  return (
    <p className="text-sm" style={{ opacity: 0.85 }}>
      {name}
      {loc ? ` — ${loc}` : ""}
    </p>
  );
}

const InvoicePreview = lazy(() => import("@/components/orders/InvoicePreview"));
const SendInvoiceDialog = lazy(() => import("@/components/orders/SendInvoiceDialog"));

function ResendConfirmationEmailButton({
  order,
  lang,
  onDone,
  asMenuItem = false,
}: {
  order: any;
  lang: "ar" | "en";
  onDone: () => void;
  asMenuItem?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const status: string = order?.confirmation_email_status ?? "pending";
  const sentAt = order?.confirmation_email_sent_at as string | null | undefined;
  const err = order?.confirmation_email_error as string | null | undefined;

  const color =
    status === "sent"
      ? "text-green-600"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";

  const label =
    lang === "ar"
      ? status === "sent"
        ? "إعادة إرسال البريد"
        : status === "failed"
          ? "إعادة المحاولة"
          : "إرسال بريد التأكيد"
      : status === "sent"
        ? "Resend confirmation email"
        : status === "failed"
          ? "Retry confirmation email"
          : "Send confirmation email";

  const title = err
    ? `${lang === "ar" ? "فشل: " : "Failed: "}${err}`
    : sentAt
      ? `${lang === "ar" ? "أُرسل: " : "Sent: "}${new Date(sentAt).toLocaleString()}`
      : undefined;

  const onClick = async () => {
    if (!order?.id) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: { order_id: order.id, lang, wait_for_delivery: true },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      toast.success(
        lang === "ar"
          ? "تم قبول بريد العميل للإرسال. راجع سجل المراسلات لمتابعة الحالة."
          : "Customer email accepted by the provider. Track it in Communications.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? (lang === "ar" ? "فشل الإرسال" : "Failed to send"));
    } finally {
      setSending(false);
      onDone();
    }
  };

  if (asMenuItem) {
    return (
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onClick();
        }}
        disabled={sending}
        title={title}
      >
        {sending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Mail className={`h-4 w-4 mr-2 ${color}`} />
        )}
        {label}
      </DropdownMenuItem>
    );
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={sending} title={title}>
      {sending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Mail className={`h-4 w-4 mr-2 ${color}`} />
      )}
      {label}
    </Button>
  );
}
