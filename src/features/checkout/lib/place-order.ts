import { getCountryByCode, type ShippingZone } from "@/lib/shipping";
import type {
  AppliedPromo,
  CheckoutForm,
  Fulfillment,
  PaymentMethod,
  Storefront,
} from "@/features/checkout/types";

/**
 * The `place_storefront_order` arguments: the customer and address (the
 * country goes in front of the label for international orders), the lines,
 * notes with the gift note on top, fulfillment details, promo, receipt and
 * the shipping zone label.
 */
export function placeStorefrontOrderArgs({
  brand,
  form,
  customerEmail,
  selectedDestination,
  selectedCountryCode,
  selectedZone,
  session,
  saveToProfile,
  cart,
  method,
  isGift,
  giftRecipient,
  giftMessage,
  fulfillment,
  branchId,
  digitalChannel,
  digitalContact,
  appliedPromo,
  benefitReceiptId,
  shipping,
  lang,
  idempotencyKey,
}: {
  brand: Pick<Storefront["brand"], "slug">;
  form: CheckoutForm;
  customerEmail: string;
  selectedDestination: string;
  selectedCountryCode: string;
  selectedZone: ShippingZone | undefined;
  session: Storefront["session"];
  saveToProfile: boolean;
  cart: Storefront["cart"];
  method: PaymentMethod | "";
  isGift: boolean;
  giftRecipient: string;
  giftMessage: string;
  fulfillment: Fulfillment;
  branchId: string;
  digitalChannel: "email" | "whatsapp";
  digitalContact: string;
  appliedPromo: AppliedPromo | null;
  benefitReceiptId: string | null;
  shipping: number;
  lang: Storefront["lang"];
  idempotencyKey: string;
}) {
  return {
    p_brand_slug: brand.slug,
    p_customer: {
      name: form.name,
      phone: form.phone,
      email: customerEmail,
      label:
        selectedDestination === "BH"
          ? form.label
          : [getCountryByCode(selectedCountryCode)?.name_en || selectedCountryCode, form.label]
              .filter(Boolean)
              .join(" - "),
      region: form.region,
      block: form.block,
      road: form.road,
      house: form.house,
      flat: form.flat,
      save_to_profile: Boolean(session?.user && saveToProfile),
    },
    p_items: cart.map((c) => ({
      variant_id: c.variant_id && c.variant_id.trim() ? c.variant_id : null,
      quantity: c.qty,
      selected_variant: {
        size: c.size,
        color: c.color,
        fabric: c.fabric ?? null,
      },
      custom_fields: c.custom_fields ?? [],
      custom_field_values: c.custom_fields ?? [],
    })),
    p_payment_method: method,
    p_notes: (() => {
      const giftNote = isGift
        ? `🎁 [طلب إهداء / Gift Order]\nالمستلم: ${giftRecipient || "غير محدد"}\nرسالة الإهداء: ${giftMessage || "بدون رسالة"}`
        : "";
      const userNote = form.notes?.trim() || "";
      return [giftNote, userNote].filter(Boolean).join("\n\n") || undefined;
    })(),
    p_fulfillment: fulfillment,
    p_branch_id: fulfillment === "pickup" ? branchId || null : null,
    p_digital_channel: fulfillment === "digital" ? digitalChannel : null,
    p_digital_contact: fulfillment === "digital" ? digitalContact.trim() : null,
    p_promo_code: appliedPromo?.code ?? null,
    p_benefit_receipt_id: benefitReceiptId,
    p_shipping_fee: shipping,
    p_shipping_zone:
      fulfillment === "delivery"
        ? selectedDestination === "BH"
          ? lang === "ar"
            ? "البحرين - توصيل محلي"
            : "Bahrain - Local Delivery"
          : selectedZone
            ? lang === "ar"
              ? `${selectedZone.name_ar} (${getCountryByCode(selectedCountryCode)?.name_ar || selectedCountryCode})`
              : `${selectedZone.name_en} (${getCountryByCode(selectedCountryCode)?.name_en || selectedCountryCode})`
            : lang === "ar"
              ? "شحن دولي"
              : "International Shipping"
        : null,
    p_idempotency_key: idempotencyKey,
  };
}

/**
 * The shopper-facing message for a failed order, and whether the promo code
 * must be dropped (the server refused it). Unknown errors show as they are.
 */
export function placeOrderFailure(
  msg: string,
  t: Storefront["t"],
): { message: string; clearPromo: boolean } {
  if (msg.includes("INSUFFICIENT_STOCK")) {
    return {
      message: t("المخزون غير كافٍ لأحد المنتجات", "Insufficient stock for one item"),
      clearPromo: false,
    };
  } else if (msg.includes("order_items_location_check")) {
    return {
      message: t(
        "تعذر تجهيز الطلب المخصص حالياً. حدّث الصفحة وحاول مرة أخرى.",
        "Custom order checkout is temporarily unavailable. Refresh and try again.",
      ),
      clearPromo: false,
    };
  } else if (msg.includes("PAYMENT_METHOD_DISABLED")) {
    return { message: t("طريقة الدفع غير متاحة", "Payment method unavailable"), clearPromo: false };
  } else if (
    msg.includes("DELIVERY_DISABLED") ||
    msg.includes("PICKUP_DISABLED") ||
    msg.includes("DIGITAL_DELIVERY_DISABLED")
  ) {
    return {
      message: t("طريقة التسليم غير متاحة", "Fulfillment method unavailable"),
      clearPromo: false,
    };
  } else if (
    msg.includes("DIGITAL_CONTACT") ||
    msg.includes("DIGITAL_EMAIL") ||
    msg.includes("DIGITAL_CHANNEL")
  ) {
    return {
      message: t("تحقق من بيانات التسليم الرقمي", "Check the digital delivery details"),
      clearPromo: false,
    };
  } else if (msg.includes("PROMO_FIRST_ORDER_ONLY")) {
    return {
      message: t(
        "رمز الخصم هذا مخصص للعملاء الجدد فقط.",
        "This promo code is restricted to first-time customers only.",
      ),
      clearPromo: true,
    };
  } else if (msg.includes("PROMO_USAGE_LIMIT_REACHED")) {
    return {
      message: t(
        "لقد وصلت إلى الحد المسموح لاستخدام هذا الرمز.",
        "You have reached this code's usage limit.",
      ),
      clearPromo: true,
    };
  } else if (msg.includes("PROMO_PREVIOUS_ORDER_REQUIRED")) {
    return {
      message: t(
        "رمز الخصم هذا مخصص للعملاء الذين لديهم طلب سابق فقط.",
        "This promo code is only available to customers with a previous order.",
      ),
      clearPromo: true,
    };
  } else if (msg.includes("PROMO_NO_ELIGIBLE_ITEMS")) {
    return {
      message: t(
        "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً.",
        "This promo code cannot be applied to items already on discount/sale.",
      ),
      clearPromo: true,
    };
  } else if (msg.includes("PROMO_AUTH_REQUIRED")) {
    return {
      message: t("سجّل الدخول لاستخدام هذا الرمز.", "Sign in to use this promo code."),
      clearPromo: true,
    };
  } else if (msg.includes("RECEIPT_STORAGE_UNREACHABLE")) {
    return {
      message: t(
        "تعذر الوصول إلى التخزين الآمن للإيصال. حاول مرة أخرى أو تواصل مع المتجر.",
        "The secure receipt upload could not be reached. Please retry or contact the store.",
      ),
      clearPromo: false,
    };
  } else if (msg.includes("BENEFIT_RECEIPT")) {
    return {
      message: t(
        "تعذر التحقق من إيصال التحويل. أعد رفع الصورة وحاول مرة أخرى.",
        "The transfer receipt could not be verified. Upload it again and retry.",
      ),
      clearPromo: false,
    };
  } else if (msg.includes("CUSTOMER_ACCOUNT_EXISTS_SIGN_IN_REQUIRED")) {
    return {
      message: t(
        "هذا البريد الإلكتروني أو رقم الهاتف مرتبط بحساب موجود. سجّل الدخول لإكمال الطلب بأمان.",
        "This email or phone belongs to an existing account. Sign in to continue securely.",
      ),
      clearPromo: false,
    };
  } else if (msg.includes("CUSTOMER_CONTACT_ALREADY_REGISTERED")) {
    return {
      message: t(
        "البريد الإلكتروني أو رقم الهاتف مستخدم في حساب عميل آخر.",
        "This email or phone is already used by another customer account.",
      ),
      clearPromo: false,
    };
  } else if (msg.includes("PROMO_")) {
    return {
      message: t(
        "رمز الخصم لم يعد صالحاً لهذا الطلب",
        "The promo code is no longer valid for this order",
      ),
      clearPromo: true,
    };
  }
  return { message: msg, clearPromo: false };
}
