import type {
  CheckoutForm,
  Fulfillment,
  PaymentMethod,
  Storefront,
} from "@/features/checkout/types";

/**
 * What stops the order from being placed, or null: name and phone (no phone
 * for digital), a valid email when given, the terms, a full address (Bahrain
 * or international), a payment method, the Benefit receipt, a pickup branch,
 * and the digital delivery contact.
 */
export function checkoutFormError({
  form,
  fulfillment,
  acceptedTerms,
  selectedDestination,
  method,
  benefitReceipt,
  branches,
  branchId,
  digitalChannel,
  digitalContact,
  t,
}: {
  form: CheckoutForm;
  fulfillment: Fulfillment;
  acceptedTerms: boolean;
  selectedDestination: string;
  method: PaymentMethod | "";
  benefitReceipt: File | null;
  branches: readonly unknown[];
  branchId: string;
  digitalChannel: "email" | "whatsapp";
  digitalContact: string;
  t: Storefront["t"];
}): string | null {
  if (!form.name.trim() || (fulfillment !== "digital" && !form.phone.trim())) {
    return t("الاسم والهاتف مطلوبان", "Name and phone are required");
  }
  const customerEmail = form.email.trim();
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return t(
      "يرجى إدخال بريد إلكتروني صحيح لتصلك تحديثات الطلب",
      "Enter a valid email address to receive order updates",
    );
  }
  if (!acceptedTerms) {
    return t(
      "يرجى الموافقة على الشروط والأحكام وسياسة الخصوصية",
      "Please accept the terms and conditions and privacy policy",
    );
  }
  if (fulfillment === "delivery") {
    if (selectedDestination === "BH") {
      if (!form.region || !form.block.trim() || !form.road.trim() || !form.house.trim()) {
        return t(
          "يرجى تعبئة كامل عنوان التوصيل داخل البحرين",
          "Please complete the delivery address in Bahrain",
        );
      }
    } else {
      if (!form.region.trim() || !form.road.trim() || !form.house.trim()) {
        return t(
          "يرجى إدخال المدينة، والحي، وتفاصيل العنوان للشحن الدولي",
          "Please enter city, district, and street address for international shipping",
        );
      }
    }
  }
  if (!method) {
    return t("اختر طريقة دفع", "Choose a payment method");
  }
  if (method === "benefit" && !benefitReceipt) {
    return t(
      "يرجى إرفاق صورة إيصال التحويل لتأكيد الطلب",
      "Please attach the transfer receipt to confirm your order",
    );
  }
  if (fulfillment === "pickup" && branches.length > 0 && !branchId) {
    return t("اختر الفرع", "Select a branch");
  }
  if (fulfillment === "digital") {
    const contact = digitalContact.trim();
    if (!contact) {
      return t(
        "أدخل البريد الإلكتروني أو رقم/معرّف واتساب",
        "Enter the email or WhatsApp number/user ID",
      );
    }
    if (digitalChannel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      return t("أدخل بريداً إلكترونياً صحيحاً", "Enter a valid email address");
    }
  }
  return null;
}
