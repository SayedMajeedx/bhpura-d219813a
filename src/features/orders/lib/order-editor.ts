import { regionLabel } from "@/lib/bahrain-regions";
import { formatMoney } from "@/lib/format";
import type {
  DraftOrder,
  EditableOrderFields,
  EditableOrderSource,
  Order,
  OrderItem,
  OrderSnapshot,
} from "@/features/orders/types";

/**
 * Pure rules for the admin order editor: the new-order draft, loading items
 * from the database, change detection, totals, promo messages and searches.
 */

/** Address lines in reading order: region first in Arabic, flat first in English. */
export function formatDeliveryAddress(
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

/** Older rows stored custom field values as an object; newer ones as a list. */
export function normalizeCustomFieldValues(value: unknown): OrderItem["custom_field_values"] {
  if (Array.isArray(value)) return value as OrderItem["custom_field_values"];
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

/** An `order_items` row as an editor line. */
export function orderItemFromRow(i: any): OrderItem {
  return {
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
    location: (i.location === "custom"
      ? "custom"
      : i.location === "incubator"
        ? "incubator"
        : "main") as OrderItem["location"],
    selected_variant: i.selected_variant ?? null,
    custom_field_values: normalizeCustomFieldValues(i.custom_field_values),
  };
}

/** A new, empty manual line. */
export function blankOrderItem(): OrderItem {
  return {
    description: "",
    quantity: 1,
    unit_price: 0,
    unit_cost: null,
    original_price: null,
    customizations: [],
    customization_total: 0,
    line_total: 0,
    location: "main",
    selected_variant: { size: "", color: "", fabric: "" },
    custom_field_values: [],
  };
}

/** Recomputes a line's customization total and line total. */
export function recalcOrderItem(i: OrderItem): OrderItem {
  const custTotal = i.customizations.reduce((s, c) => s + Number(c.price_delta), 0);
  const line = (Number(i.unit_price) + custTotal) * Number(i.quantity);
  return { ...i, customization_total: custTotal, line_total: line };
}

/**
 * The unsaved order shown at `/orders/new`: the store's first enabled
 * fulfillment method, its flat delivery fee and default tax rate.
 */
export function newDraftOrder(settings: any, brandId: string, today: string): DraftOrder {
  const fulfillmentMethod = settings.delivery_enabled
    ? "delivery"
    : settings.pickup_enabled
      ? "pickup"
      : settings.digital_delivery_enabled
        ? "digital"
        : "delivery";
  const shipping = fulfillmentMethod === "delivery" ? Number(settings.delivery_fee ?? 0) : 0;
  return {
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
    order_date: today,
  };
}

/** A draft nobody has touched yet: no customer, payment method or items. */
export function isUntouchedDraft(order: Order): boolean {
  return (
    order?.status === "draft" &&
    !order?.customer_id &&
    !order?.payment_method &&
    (order?.order_items?.length ?? 0) === 0
  );
}

/** The parts of a line that count as a change (labels and variant details excluded). */
export function simplifyItem(it: OrderItem) {
  return {
    id: it.id ?? null,
    product_id: it.product_id ?? null,
    variant_id: it.variant_id ?? null,
    description: (it.description ?? "").trim(),
    quantity: Number(it.quantity || 0),
    unit_price: Number(it.unit_price || 0),
    unit_cost: it.unit_cost == null ? null : Number(it.unit_cost),
    original_price: it.original_price == null ? null : Number(it.original_price),
    line_total: Number(it.line_total || 0),
    location: it.location ?? "main",
    customizations: it.customizations ?? [],
    customization_total: Number(it.customization_total || 0),
    selected_variant: it.selected_variant
      ? {
          size: it.selected_variant.size ?? null,
          color: it.selected_variant.color ?? null,
          fabric: it.selected_variant.fabric ?? null,
        }
      : null,
    custom_field_values: (it.custom_field_values ?? []).map((cf) => ({
      key: cf.key,
      value: cf.value,
    })),
  };
}

/** The order fields the editor can change, with defaults, for change detection. */
export function normalizeOrderMin(o: EditableOrderSource | null | undefined): EditableOrderFields {
  return {
    id: o?.id ?? null,
    notes: o?.notes ?? "",
    delivery_notes: o?.delivery_notes ?? "",
    customer_id: o?.customer_id ?? null,
    shipping_address_id: o?.shipping_address_id ?? null,
    branch_id: o?.branch_id ?? null,
    fulfillment_method: o?.fulfillment_method ?? "delivery",
    digital_delivery_channel: o?.digital_delivery_channel ?? null,
    digital_delivery_contact: o?.digital_delivery_contact ?? null,
    payment_status: o?.payment_status ?? "unpaid",
    fulfillment_status: o?.fulfillment_status ?? "ON_HOLD",
    status: o?.status ?? "draft",
    payment_method: o?.payment_method ?? null,
    discount: Number(o?.discount ?? 0),
    shipping: Number(o?.shipping ?? 0),
    tax_rate: Number(o?.tax_rate ?? 0),
    advance_paid: Number(o?.advance_paid ?? 0),
    order_date: o?.order_date ?? "",
  };
}

/** Whether the order or its lines differ from the last loaded or saved snapshot. */
export function isOrderDirty(
  snapshot: OrderSnapshot | null,
  order: Order | null,
  items: OrderItem[],
): boolean {
  if (!snapshot || !order) return false;
  const orderChanged =
    JSON.stringify(normalizeOrderMin(order)) !== JSON.stringify(normalizeOrderMin(snapshot.order));
  const itemsChanged =
    JSON.stringify(items.map(simplifyItem)) !==
    JSON.stringify((snapshot.items ?? []).map(simplifyItem));
  return orderChanged || itemsChanged;
}

/** Customer and lines a promo code was validated against; a change drops the code. */
export function promoSignature(customerId: string | null | undefined, items: OrderItem[]): string {
  return JSON.stringify({
    customer: customerId ?? null,
    items: items.map((item) => [
      item.variant_id ?? null,
      item.quantity,
      Number(item.line_total).toFixed(3),
    ]),
  });
}

/**
 * Order totals. Tax applies after the discount; with VAT-inclusive pricing the
 * tax is carved out of the prices instead of added. Shipping is never taxed.
 */
export function orderTotals(
  items: OrderItem[],
  order: {
    discount?: unknown;
    shipping?: unknown;
    tax_rate?: unknown;
    advance_paid?: unknown;
  } | null,
  vatInclusive: boolean,
) {
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const discount = Number(order?.discount ?? 0);
  const shipping = Number(order?.shipping ?? 0);
  const taxable = Math.max(0, subtotal - discount);
  const taxRate = Number(order?.tax_rate ?? 0);
  let taxAmount = 0;
  let total = 0;
  if (vatInclusive) {
    taxAmount = taxable - taxable / (1 + taxRate / 100);
    total = taxable + shipping;
  } else {
    taxAmount = (taxable * taxRate) / 100;
    total = taxable + taxAmount + shipping;
  }
  const advancePaid = Math.max(0, Number(order?.advance_paid ?? 0));
  const remaining = Math.max(0, total - advancePaid);
  return { subtotal, discount, shipping, taxAmount, total, advancePaid, remaining };
}

/** Why `validate_promo_code` rejected a code, for the merchant. */
export function promoFailureMessage(
  result: { reason?: string; minimum_order_amount?: unknown } | null | undefined,
  lang: string,
): string {
  switch (result?.reason) {
    case "FIRST_ORDER_ONLY":
      return lang === "ar"
        ? "رمز الخصم هذا مخصص للعملاء الجدد فقط."
        : "This promo code is restricted to first-time customers only.";
    case "PREVIOUS_ORDER_REQUIRED":
      return lang === "ar"
        ? "رمز الخصم هذا مخصص للعملاء الذين لديهم طلب سابق فقط."
        : "This promo code is only available to customers with a previous order.";
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
}

type SearchableCustomer = { name?: string | null; email?: string | null; phone?: string | null };

/** Up to 50 customers matching name, email or phone digits (first 50 when empty). */
export function filterCustomers<T extends SearchableCustomer>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, 50);
  const qDigits = q.replace(/\D/g, "");
  return list
    .filter((c) => {
      const name = (c.name || "").toLowerCase();
      const email = (c.email || "").toLowerCase();
      const phone = c.phone || "";
      const phoneDigits = phone.replace(/\D/g, "");
      const matchesName = name.includes(q);
      const matchesEmail = email.includes(q);
      const matchesPhone = qDigits.length > 0 && phoneDigits.includes(qDigits);
      return matchesName || matchesEmail || matchesPhone;
    })
    .slice(0, 50);
}

/**
 * Variants for the "add product" search: every word must appear in the product
 * name (any language), SKU, barcode, size, colour or fabric. First 25 when empty.
 */
export function filterVariantsForSearch(variants: any[], products: any[], query: string): any[] {
  if (!query.trim()) return variants.slice(0, 25);
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return variants
    .filter((v) => {
      const p = products.find((x) => x.id === v.product_id);
      const title = String(p?.name ?? "").toLowerCase();
      const titleAr = String(p?.name_ar ?? "").toLowerCase();
      const titleEn = String(p?.name_en ?? "").toLowerCase();
      const sku = String(v.sku ?? p?.sku ?? "").toLowerCase();
      const barcode = String(v.barcode ?? "").toLowerCase();
      const size = String(v.size ?? "").toLowerCase();
      const color = String(v.color ?? "").toLowerCase();
      const fabric = String(v.fabric ?? "").toLowerCase();

      const fullSearchableBlob = `${title} ${titleAr} ${titleEn} ${sku} ${barcode} ${size} ${color} ${fabric}`;
      return tokens.every((token) => fullSearchableBlob.includes(token));
    })
    .slice(0, 35);
}
