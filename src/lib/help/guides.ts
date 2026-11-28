/**
 * Help for a merchant inside the admin: five short guides to the jobs a new store does first,
 * each opening where the job is done, and a WhatsApp chat with Boutq (the ease-of-use review of
 * 2026-11-28: the admin had no help and no way to reach support).
 *
 * A guide is shown only when its page is one the reader may open (`mayOpenPage`), so a member of
 * staff is never sent to a page that turns them away. A services store reads its own guides
 * (a service and a booking, not a product and a delivery).
 */
import { mayOpenPage, type PageCaller } from "@/lib/page-access";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";

type Lang = "ar" | "en";
type Words = { ar: string; en: string };

export type HelpGuide = {
  id: string;
  /** The admin page the guide opens (a `PAGE_ACCESS` key). */
  page: string;
  /** Where under the store's admin it opens, after `/admin/b/<slug>/`. */
  path: string;
  title: Words;
  steps: Words[];
  open: Words;
};

const ADD_PRODUCT: HelpGuide = {
  id: "add-product",
  page: "inventory",
  path: "inventory?action=new",
  title: { ar: "أضف منتجاً", en: "Add a product" },
  steps: [
    {
      ar: "اكتب اسم المنتج وسعره، وأضف صوره.",
      en: "Write the product's name and price, and add its photos.",
    },
    {
      ar: "اختر المقاسات أو الألوان بلمسة، ومعها عدد القطع لكل منها.",
      en: "Pick its sizes or colours in a tap, with the pieces you have of each.",
    },
    {
      ar: "قل كيف يُباع: من المخزون الجاهز أو يُصنع حسب الطلب.",
      en: "Say how it is sold: from ready stock or made to order.",
    },
    { ar: "احفظ، فيظهر المنتج في متجرك.", en: "Save, and it shows in your store." },
  ],
  open: { ar: "أضف منتجاً", en: "Add a product" },
};

const ADD_SERVICE: HelpGuide = {
  id: "add-service",
  page: "inventory",
  path: "inventory?action=new",
  title: { ar: "أضف خدمة", en: "Add a service" },
  steps: [
    { ar: "اكتب اسم الخدمة وأضف صورها.", en: "Write the service's name and add its photos." },
    {
      ar: "حدّد مددها، ولكل مدة سعرها.",
      en: "Set its lengths, each with its own price.",
    },
    { ar: "اكتب مكانها وما تشمله.", en: "Say where it happens and what it includes." },
    { ar: "احفظ، فيمكن حجزها من متجرك.", en: "Save, and customers can book it from your store." },
  ],
  open: { ar: "أضف خدمة", en: "Add a service" },
};

const HANDLE_ORDER: HelpGuide = {
  id: "handle-order",
  page: "orders",
  path: "orders",
  title: { ar: "تابع طلباً جديداً", en: "Handle a new order" },
  steps: [
    {
      ar: "صفحة الطلبات تبدأ بما يحتاج إجراءً منك. افتح الطلب.",
      en: "The orders page starts with what needs you. Open the order.",
    },
    {
      ar: "إن دفع العميل بتحويل، فراجع الإيصال أعلى الطلب ثم اعتمد الدفع.",
      en: "If the customer paid by transfer, check the receipt at the top, then approve the payment.",
    },
    {
      ar: "اضغط زر الخطوة التالية كلما تقدّم الطلب: التجهيز، ثم الجاهزية، ثم التوصيل.",
      en: "Press the next-step button as the order moves on: preparing, ready, then delivery.",
    },
    {
      ar: "عند التسليم سجّل ما استلمته من العميل، فيكتمل الطلب.",
      en: "At hand-over, record what the customer paid, and the order is complete.",
    },
  ],
  open: { ar: "افتح الطلبات", en: "Open orders" },
};

const HANDLE_BOOKING: HelpGuide = {
  id: "handle-booking",
  page: "bookings",
  path: "bookings",
  title: { ar: "تابع حجزاً جديداً", en: "Handle a new booking" },
  steps: [
    {
      ar: "صفحة الحجوزات تبدأ بأيام الأسبوع وما ينتظر ردّك.",
      en: "The bookings page starts with the week and what waits for your answer.",
    },
    { ar: "اقبل الطلب أو اعتذر عنه.", en: "Accept the request, or decline it." },
    {
      ar: "قبل الموعد أرسل للعميل تذكيراً على واتساب من بطاقة الحجز.",
      en: "Before the day, send the customer a WhatsApp reminder from the booking's card.",
    },
    {
      ar: "بعد الموعد اضغط «تم»، فيُسجَّل ما دفعه العميل.",
      en: "After it, press Done, and what the customer paid is recorded.",
    },
  ],
  open: { ar: "افتح الحجوزات", en: "Open bookings" },
};

const DELIVERY_AND_PAYMENT: HelpGuide = {
  id: "delivery-payment",
  page: "settings",
  path: "settings?tab=orders&group=payments",
  title: { ar: "طرق الدفع والتوصيل", en: "Payment and delivery" },
  steps: [
    {
      ar: "في الإعدادات ← الطلبات والمدفوعات ← طرق الدفع، شغّل ما تقبله: نقداً، بطاقة، بنفت باي.",
      en: "In Settings → Orders & Checkout → Payment Methods, turn on what you take: cash, card, BenefitPay.",
    },
    {
      ar: "إن أردت عربوناً قبل التجهيز، فحدّده في الصفحة نفسها.",
      en: "If you want an advance before preparing, set it on the same page.",
    },
    {
      ar: "في «التوصيل والاستلام» اكتب رسوم التوصيل ومدته، وشغّل الاستلام إن كان عندك.",
      en: "In Delivery & Pickup, write the delivery fee and time, and turn on pickup if you have it.",
    },
    { ar: "احفظ، فيراها العميل عند الدفع.", en: "Save, and the customer sees them at checkout." },
  ],
  open: { ar: "افتح إعدادات الدفع", en: "Open payment settings" },
};

const PAYMENT_ONLY: HelpGuide = {
  ...DELIVERY_AND_PAYMENT,
  id: "payment",
  title: { ar: "طرق الدفع", en: "How customers pay" },
  steps: [
    DELIVERY_AND_PAYMENT.steps[0],
    {
      ar: "إن أردت عربوناً عند الحجز، فحدّده في قواعد الحجز.",
      en: "If you want a deposit when booking, set it in the booking rules.",
    },
    { ar: "احفظ، فيراها العميل عند الحجز.", en: "Save, and the customer sees them when booking." },
  ],
};

const DISCOUNT_CODE: HelpGuide = {
  id: "discount-code",
  page: "discounts",
  path: "discounts?action=new",
  title: { ar: "أنشئ كود خصم", en: "Make a discount code" },
  steps: [
    {
      ar: "اكتب الكود كما سيكتبه العميل، مثل EID10.",
      en: "Write the code as customers will type it, like EID10.",
    },
    {
      ar: "اختر نسبة أو مبلغاً، ومتى يبدأ وينتهي.",
      en: "Choose a percentage or an amount, and when it starts and ends.",
    },
    {
      ar: "اختر المنتجات التي يشملها، أو اتركه لكل المتجر.",
      en: "Choose the products it covers, or leave it for the whole store.",
    },
    { ar: "احفظ، ثم شارك الكود مع عملائك.", en: "Save, then share the code with your customers." },
  ],
  open: { ar: "أنشئ كوداً", en: "Make a code" },
};

const STORE_LOOK: HelpGuide = {
  id: "store-look",
  page: "settings",
  path: "settings?tab=storefront&group=home_hero",
  title: { ar: "غيّر شكل متجرك", en: "Change how your store looks" },
  steps: [
    {
      ar: "في الإعدادات ← المتجر والرئيسية ← الواجهة الرئيسية، أضف صوراً أو فيديو وعنواناً لأعلى الصفحة.",
      en: "In Settings → Storefront → Homepage Hero, add photos or a video and a headline for the top of the page.",
    },
    {
      ar: "في «الصفحة الرئيسية» اختر الأقسام التي تظهر وترتيبها.",
      en: "In Home page, choose which sections show.",
    },
    {
      ar: "في «الترويسة والقائمة والتذييل» اختر ألوان الشريط العلوي والسفلي.",
      en: "In Header, Menu & Footer, choose the colours of the top and bottom bars.",
    },
    {
      ar: "احفظ، ثم اضغط «المتجر» أعلى الصفحة لترى النتيجة.",
      en: "Save, then press Storefront at the top to see it.",
    },
  ],
  open: { ar: "افتح إعدادات الواجهة", en: "Open storefront settings" },
};

/** The guides for a store, in the order a new store does them, that the reader may open. */
export function helpGuides(caller: PageCaller, { services = false } = {}): HelpGuide[] {
  const all = services
    ? [ADD_SERVICE, HANDLE_BOOKING, PAYMENT_ONLY, DISCOUNT_CODE, STORE_LOOK]
    : [ADD_PRODUCT, HANDLE_ORDER, DELIVERY_AND_PAYMENT, DISCOUNT_CODE, STORE_LOOK];
  return all.filter((guide) => mayOpenPage(guide.page, caller));
}

/** Where a guide opens, under the store's admin. */
export function guideHref(guide: HelpGuide, slug: string): string {
  return `/admin/b/${encodeURIComponent(slug)}/${guide.path}`;
}

/** The message a merchant starts the chat with: their store and the page they were on. */
export function supportMessage({
  storeName,
  pageName,
  lang,
}: {
  storeName: string;
  pageName?: string | null;
  lang: Lang;
}): string {
  const page = pageName?.trim();
  if (lang === "ar") {
    return page
      ? `مرحباً Boutq، أحتاج مساعدة في متجر ${storeName} (صفحة ${page}).`
      : `مرحباً Boutq، أحتاج مساعدة في متجر ${storeName}.`;
  }
  return page
    ? `Hello Boutq, I need help with my store ${storeName} (the ${page} page).`
    : `Hello Boutq, I need help with my store ${storeName}.`;
}

/** The chat with Boutq's support, with the message written, or null when there is no number. */
export function supportChatUrl(number: string | null | undefined, message: string): string | null {
  const chat = whatsappChatUrl(number);
  return chat ? `${chat}?text=${encodeURIComponent(message)}` : null;
}
