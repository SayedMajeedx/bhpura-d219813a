import { formatPrice } from "@/lib/storefront-context";
import type { Storefront } from "@/features/checkout/types";

/** Why `validate_promo_code` refused a code, in the shopper's language. */
export function promoRejectionMessage(
  result: { reason?: string; minimum_order_amount?: unknown } | null | undefined,
  { currency, lang, t }: { currency: string; lang: Storefront["lang"]; t: Storefront["t"] },
): string {
  if (result?.reason === "MINIMUM_NOT_MET")
    return t(
      `الحد الأدنى للطلب ${formatPrice(Number(result.minimum_order_amount), currency, lang)}`,
      `Minimum order is ${formatPrice(Number(result.minimum_order_amount), currency, lang)}`,
    );
  if (result?.reason === "CODE_INACTIVE")
    return t("رمز الخصم هذا لم يعد نشطاً.", "This promotional code is no longer active.");
  if (result?.reason === "FIRST_ORDER_ONLY")
    return t(
      "رمز الخصم هذا مخصص للعملاء الجدد فقط.",
      "This promo code is restricted to first-time customers only.",
    );
  if (result?.reason === "PREVIOUS_ORDER_REQUIRED")
    return t(
      "رمز الخصم هذا مخصص للعملاء الذين لديهم طلب سابق فقط.",
      "This promo code is only available to customers with a previous order.",
    );
  if (result?.reason === "AUTH_REQUIRED")
    return t("سجّل الدخول لاستخدام هذا الرمز.", "Sign in to use this promo code.");
  if (result?.reason === "USAGE_LIMIT_REACHED")
    return t(
      "لقد وصلت إلى الحد المسموح لاستخدام هذا الرمز.",
      "You have reached this code's usage limit.",
    );
  if (result?.reason === "NO_ELIGIBLE_ITEMS")
    return t(
      "لا يمكن تطبيق رمز الخصم هذا على المنتجات المخفضة مسبقاً.",
      "This promo code cannot be applied to items already on discount/sale.",
    );
  if (result?.reason === "CODE_NOT_FOUND")
    return t("رمز الخصم غير موجود لهذا المتجر.", "This promo code does not exist for this brand.");
  return t(
    "تعذر تطبيق رمز الخصم. تحقق من شروطه.",
    "This promo code could not be applied. Check its eligibility rules.",
  );
}
