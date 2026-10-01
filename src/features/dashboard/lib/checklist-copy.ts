/**
 * The launch checklist's first and last steps, in the words of what the store
 * sells: products, or (a store that takes bookings) services and bookings.
 */
type Text = { ar: string; en: string };

export type ChecklistCopy = {
  addTitle: Text;
  addPending: Text;
  addDone: (count: number) => Text;
  addButtonDone: Text;
  addButtonPending: Text;
  firstTitle: Text;
  firstPending: Text;
  firstDone: (count: number) => Text;
  firstButtonDone: Text;
  firstButtonPending: Text;
  /** Where the last step's button goes. */
  firstTo: "/admin/b/$slug/orders" | "/admin/b/$slug/bookings";
};

const PRODUCTS: ChecklistCopy = {
  addTitle: { ar: "إضافة أول منتج", en: "Add Your First Product" },
  addPending: {
    ar: "أدخل اسم وسعر وصورة أول منتج لعرضه فوراً أمام عملائك.",
    en: "Add name, price, and photo of your first item to display.",
  },
  addDone: (count) => ({
    ar: `لديك الآن ${count} منتج جاهز للبيع في المتجر.`,
    en: `You have ${count} products ready to sell.`,
  }),
  addButtonDone: { ar: "إدارة المنتجات", en: "Manage Products" },
  addButtonPending: { ar: "أضف منتجك الأول الآن", en: "Add Product Now" },
  firstTitle: { ar: "تسجيل أول عملية بيع", en: "Record Your First Sale" },
  firstPending: {
    ar: "استقبل أول طلب من متجرك الإلكتروني، أو سجّل طلباً يدوياً لتشغيل لوحة الأرباح والمخزون.",
    en: "Receive your first online order or create a manual order to activate financial metrics.",
  },
  firstDone: (count) => ({
    ar: `تم تسجيل ${count} طلب بنجاح. لوحة المبيعات والتقارير المالية تعمل بكامل طاقتها.`,
    en: `${count} orders recorded successfully. Sales telemetry is active.`,
  }),
  firstButtonDone: { ar: "إدارة الطلبات والفواتير", en: "Manage Orders & Invoices" },
  firstButtonPending: { ar: "الطلبات والفواتير", en: "Orders & Invoices" },
  firstTo: "/admin/b/$slug/orders",
};

const SERVICES: ChecklistCopy = {
  addTitle: { ar: "إضافة أول خدمة", en: "Add Your First Service" },
  addPending: {
    ar: "أضف اسم الخدمة وأسعار مددها وما تشمله، لتظهر لعملائك جاهزة للحجز.",
    en: "Add the service's name, prices by length and what it includes, ready to book.",
  },
  addDone: (count) => ({
    ar: `لديك الآن ${count} خدمة جاهزة للحجز.`,
    en: `You have ${count} services ready to book.`,
  }),
  addButtonDone: { ar: "إدارة الخدمات", en: "Manage Services" },
  addButtonPending: { ar: "أضف خدمتك الأولى الآن", en: "Add Service Now" },
  firstTitle: { ar: "استقبال أول حجز", en: "Receive Your First Booking" },
  firstPending: {
    ar: "شارك رابط متجرك لتصلك أول الحجوزات، أو أضف حجزاً يدوياً من تقويم الحجوزات.",
    en: "Share your link to get your first bookings, or add one from the bookings calendar.",
  },
  firstDone: (count) => ({
    ar: `تم تسجيل ${count} طلب حجز. التقويم والتقارير جاهزة.`,
    en: `${count} bookings recorded. The calendar and reports are ready.`,
  }),
  firstButtonDone: { ar: "فتح تقويم الحجوزات", en: "Open the Bookings Calendar" },
  firstButtonPending: { ar: "تقويم الحجوزات", en: "Bookings Calendar" },
  firstTo: "/admin/b/$slug/bookings",
};

export function checklistCopy(takesBookings: boolean): ChecklistCopy {
  return takesBookings ? SERVICES : PRODUCTS;
}
