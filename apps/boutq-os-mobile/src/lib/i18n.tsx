import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "ar";
type Dict = Record<string, string>;

const en: Dict = {
  "app.title": "Boutq OS",
  "app.subtitle": "Boutique management",
  "app.portalSubtitle": "Boutique management portal",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.print": "Print / PDF",
  "common.back": "Back",
  "common.new": "New",
  "common.add": "Add",
  "common.search": "Search...",
  "common.all": "All",
  "common.active": "Active",
  "common.inactive": "Inactive",
  "common.status": "Status",
  "common.actions": "Actions",
  "common.details": "Details",
  "common.pleaseWait": "Please wait...",
  "common.loading": "Loading…",
  "common.language": "Language",
  "common.confirmDelete": "Are you sure?",
  "common.copy": "Copy",
  "common.copied": "Copied to clipboard!",
  "common.call": "Call",
  "common.whatsapp": "WhatsApp",
  "common.apply": "Apply",
  "common.refresh": "Refresh",
  "common.filter": "Filter",

  "nav.dashboard": "Dashboard",
  "nav.inventory": "Inventory",
  "nav.customers": "Customers",
  "nav.orders": "Orders",
  "nav.expenses": "Expenses",
  "nav.more": "More",
  "nav.reports": "Reports",
  "nav.discounts": "Discounts",
  "nav.categories": "Categories",
  "nav.incubators": "Incubators",
  "nav.reviews": "Reviews",
  "nav.campaigns": "Campaigns",
  "nav.team": "Team",
  "nav.settings": "Settings",
  "nav.integrations": "Integrations",
  "nav.pages": "Pages",
  "nav.signOut": "Sign out",

  "dashboard.title": "Dashboard",
  "dashboard.todaySales": "Today's Sales",
  "dashboard.activeOrders": "Active Orders",
  "dashboard.pendingFulfillment": "Fulfillment Queue",
  "dashboard.lowStock": "Low Stock Alerts",
  "dashboard.recentOrders": "Recent Orders",
  "dashboard.noOrders": "No orders yet.",
  "dashboard.revenueMonth": "Revenue this month",
  "dashboard.ordersToday": "Orders today",
  "dashboard.topSelling": "Top selling items",
  "dashboard.topSellingSubtitle": "By units sold",
  "dashboard.urgentAction": "Urgent Work Queue",
  "dashboard.quickActions": "Quick Actions",
  "dashboard.scopeAll": "Overview",
  "dashboard.scopeOperations": "Operations",
  "dashboard.scopeFinancials": "Financials",

  "orders.title": "Orders & Invoices",
  "orders.searchPh": "Search by invoice, customer or phone...",
  "orders.tabAll": "All",
  "orders.tabAction": "Needs Action",
  "orders.tabDelivery": "Ready for Delivery",
  "orders.tabCompleted": "Completed",
  "orders.tabCancelled": "Cancelled",
  "orders.noMatch": "No orders found.",
  "orders.invoice": "Invoice",
  "orders.date": "Date",
  "orders.customer": "Customer",
  "orders.status": "Status",
  "orders.total": "Total",

  "orderDetail.title": "Order Details",
  "orderDetail.items": "Ordered Items",
  "orderDetail.tailoringNotes": "Tailoring & Customization Notes",
  "orderDetail.deliveryAddress": "Delivery Address",
  "orderDetail.financialSummary": "Financial Ledger",
  "orderDetail.subtotal": "Subtotal",
  "orderDetail.discount": "Discount",
  "orderDetail.deliveryFee": "Delivery Fee",
  "orderDetail.total": "Total Amount",
  "orderDetail.advancePaid": "Advance Paid",
  "orderDetail.remainingDue": "Remaining Due",
  "orderDetail.updateStatus": "Update Order Status",
  "orderDetail.updatePayment": "Update Payment Status",
  "orderDetail.updateFulfillment": "Update Fulfillment Stage",
  "orderDetail.dispatchCourier": "Dispatch Courier via WhatsApp",
  "orderDetail.notifyCustomer": "Notify Customer via WhatsApp",
  "orderDetail.markPaid": "Mark Fully Paid",

  "inventory.title": "Inventory & Stock",
  "inventory.searchPh": "Search by SKU, barcode, product name...",
  "inventory.filterAll": "All Products",
  "inventory.filterLow": "Low Stock (≤ 5)",
  "inventory.filterOut": "Out of Stock",
  "inventory.mainStock": "Main Stock",
  "inventory.incubatorStock": "Incubator",
  "inventory.price": "Price",
  "inventory.cost": "Cost",
  "inventory.stock": "Stock",
  "inventory.sku": "SKU",
  "inventory.noProducts": "No products match criteria.",

  "customers.title": "Customers Directory",
  "customers.searchPh": "Search by name or phone...",
  "customers.lifetimeSpend": "Total Spend",
  "customers.ordersCount": "Orders",
  "customers.lastOrder": "Last Order",
  "customers.history": "Customer Order History",
  "customers.noCustomers": "No customers found.",

  "expenses.title": "Expenses Tracking",
  "expenses.addExpense": "Add Expense",
  "expenses.monthSummary": "This Month's OpEx",
  "expenses.category": "Category",
  "expenses.amount": "Amount",
  "expenses.notes": "Notes",
  "expenses.paymentMethod": "Payment Method",
  "expenses.date": "Date",
  "expenses.noExpenses": "No expenses logged for this period.",

  "reports.title": "Reports & Analytics",
  "reports.salesSummary": "Sales Summary",
  "reports.averageOrder": "Average Order Value",
  "reports.topProducts": "Top Products by Revenue",
  "reports.paymentBreakdown": "Payment Methods Distribution",
  "reports.periodToday": "Today",
  "reports.period7d": "Last 7 Days",
  "reports.period30d": "Last 30 Days",
  "reports.periodAll": "All Time",

  "discounts.title": "Promo Codes & Discounts",
  "discounts.addDiscount": "Create Promo Code",
  "discounts.code": "Promo Code",
  "discounts.type": "Discount Type",
  "discounts.percentage": "Percentage (%)",
  "discounts.fixed": "Fixed Amount",
  "discounts.value": "Discount Value",
  "discounts.minOrder": "Minimum Order Amount",
  "discounts.maxDiscount": "Maximum Discount Amount",
  "discounts.expiryDate": "Expiration Date",
  "discounts.usageLimit": "Limit Per Customer",
  "discounts.noDiscounts": "No promo codes active.",

  "categories.title": "Categories & Sections",
  "categories.addCategory": "Add Category",
  "categories.nameAr": "Arabic Name",
  "categories.nameEn": "English Name",
  "categories.slug": "Slug Identifier",
  "categories.sortOrder": "Sort Order",
  "categories.noCategories": "No categories found.",

  "incubators.title": "Incubators & Consignment",
  "incubators.locations": "Locations & Consignors",
  "incubators.itemsConsigned": "Consigned Items",
  "incubators.totalStock": "Stock in Incubator",
  "incubators.sales": "Incubator Sales",
  "incubators.noIncubators": "No incubators configured.",

  "reviews.title": "Customer Reviews & Ratings",
  "reviews.rating": "Rating",
  "reviews.comment": "Review Feedback",
  "reviews.approved": "Approved / Displayed",
  "reviews.pending": "Pending Approval",
  "reviews.noReviews": "No customer reviews yet.",

  "campaigns.title": "WhatsApp Campaigns",
  "campaigns.templates": "Message Presets & Templates",
  "campaigns.orderConfirmation": "Order Confirmation",
  "campaigns.deliveryDispatch": "Delivery Dispatch",
  "campaigns.readyPickup": "Ready for Pickup",
  "campaigns.promotional": "Promotional Broadcast",

  "team.title": "Team & Roles Management",
  "team.addMember": "Add Staff Member",
  "team.name": "Name",
  "team.role": "Role",
  "team.admin": "Administrator",
  "team.staff": "Operations Staff",
  "team.courier": "Courier / Driver",
  "team.active": "Active",
  "team.inactive": "Inactive",
  "team.noMembers": "No team members found.",

  "settings.title": "Storefront Settings",
  "settings.storeName": "Store Name",
  "settings.currency": "Currency",
  "settings.phone": "Contact Phone",
  "settings.whatsapp": "WhatsApp Hotline",
  "settings.deliveryFee": "Default Delivery Fee",
  "settings.policy": "Store Policies & Terms",

  "integrations.title": "Payment & API Integrations",
  "integrations.benefit": "BenefitPay Gateway",
  "integrations.tap": "Tap Payments",
  "integrations.applePay": "Apple Pay",
  "integrations.connected": "Connected & Active",
  "integrations.notConfigured": "Not Configured",

  "pages.title": "Store Pages & Policies",
  "pages.about": "About the Brand",
  "pages.returns": "Returns & Exchanges Policy",
  "pages.terms": "Terms & Conditions",
  "pages.privacy": "Privacy Policy",
};

const ar: Dict = {
  "app.title": "نظام بوتيك OS",
  "app.subtitle": "إدارة البوتيك",
  "app.portalSubtitle": "لوحة إدارة البوتيك الموحدة",

  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.delete": "حذف",
  "common.edit": "تعديل",
  "common.print": "طباعة أو تحميل PDF",
  "common.back": "رجوع",
  "common.new": "جديد",
  "common.add": "إضافة",
  "common.search": "بحث...",
  "common.all": "الكل",
  "common.active": "مفعّل",
  "common.inactive": "غير مفعّل",
  "common.status": "الحالة",
  "common.actions": "الإجراءات",
  "common.details": "التفاصيل",
  "common.pleaseWait": "يرجى الانتظار...",
  "common.loading": "جارٍ التحميل…",
  "common.language": "اللغة",
  "common.confirmDelete": "هل أنت متأكد؟",
  "common.copy": "نسخ",
  "common.copied": "تم النسخ بنجاح!",
  "common.call": "اتصال",
  "common.whatsapp": "واتساب",
  "common.apply": "تطبيق",
  "common.refresh": "تحديث",
  "common.filter": "تصفية",

  "nav.dashboard": "لوحة التحكم",
  "nav.inventory": "المخزون",
  "nav.customers": "العملاء",
  "nav.orders": "الطلبات",
  "nav.expenses": "المصروفات",
  "nav.more": "المزيد والإدارة",
  "nav.reports": "التقارير",
  "nav.discounts": "رموز الخصم",
  "nav.categories": "الأقسام",
  "nav.incubators": "الحاضنات والعُهد",
  "nav.reviews": "تقييمات العملاء",
  "nav.campaigns": "حملات الواتساب",
  "nav.team": "فريق العمل",
  "nav.settings": "إعدادات المتجر",
  "nav.integrations": "الربط وبوابات الدفع",
  "nav.pages": "الصفحات والسياسات",
  "nav.signOut": "تسجيل الخروج",

  "dashboard.title": "لوحة التحكم",
  "dashboard.todaySales": "مبيعات اليوم",
  "dashboard.activeOrders": "الطلبات النشطة",
  "dashboard.pendingFulfillment": "بانتظار التجهيز",
  "dashboard.lowStock": "تنبيهات المخزون",
  "dashboard.recentOrders": "أحدث الطلبات",
  "dashboard.noOrders": "لا توجد طلبات بعد.",
  "dashboard.revenueMonth": "إيرادات هذا الشهر",
  "dashboard.ordersToday": "طلبات اليوم",
  "dashboard.topSelling": "الأكثر مبيعاً",
  "dashboard.topSellingSubtitle": "حسب القطع المباعة",
  "dashboard.urgentAction": "طابور المهام العاجلة",
  "dashboard.quickActions": "إجراءات سريعة",
  "dashboard.scopeAll": "نظرة عامة",
  "dashboard.scopeOperations": "العمليات",
  "dashboard.scopeFinancials": "المالية والأرباح",

  "orders.title": "الطلبات والفواتير",
  "orders.searchPh": "بحث برقم الفاتورة، اسم العميل أو الهاتف...",
  "orders.tabAll": "الكل",
  "orders.tabAction": "تتطلب إجراء",
  "orders.tabDelivery": "جاهزة للشحن",
  "orders.tabCompleted": "مكتملة",
  "orders.tabCancelled": "ملغية",
  "orders.noMatch": "لم يتم العثور على طلبات تطابق البحث.",
  "orders.invoice": "الفاتورة",
  "orders.date": "التاريخ",
  "orders.customer": "العميل",
  "orders.status": "الحالة",
  "orders.total": "الإجمالي",

  "orderDetail.title": "تفاصيل الطلب",
  "orderDetail.items": "محتويات الطلب",
  "orderDetail.tailoringNotes": "ملاحظات التفصيل والمقاسات",
  "orderDetail.deliveryAddress": "عنوان التوصيل",
  "orderDetail.financialSummary": "الملخص المالي",
  "orderDetail.subtotal": "المجموع الفرعي",
  "orderDetail.discount": "الخصم",
  "orderDetail.deliveryFee": "رسوم التوصيل",
  "orderDetail.total": "المبلغ الإجمالي",
  "orderDetail.advancePaid": "المبلغ المقدم",
  "orderDetail.remainingDue": "المتبقي للاستحقاق",
  "orderDetail.updateStatus": "تحديث حالة الطلب",
  "orderDetail.updatePayment": "تحديث حالة الدفع",
  "orderDetail.updateFulfillment": "تحديث مرحلة التجهيز والتوصيل",
  "orderDetail.dispatchCourier": "إرسال بيانات الشحنة للمندوب بالواتساب",
  "orderDetail.notifyCustomer": "إرسال تحديث للعميل بالواتساب",
  "orderDetail.markPaid": "تسجيل كمدفوع بالكامل",

  "inventory.title": "إدارة المخزون والمنتجات",
  "inventory.searchPh": "بحث بالكود (SKU)، الباركود أو اسم المنتج...",
  "inventory.filterAll": "كل المنتجات",
  "inventory.filterLow": "مخزون منخفض (≤ 5)",
  "inventory.filterOut": "نفد المخزون",
  "inventory.mainStock": "المخزون الأساسي",
  "inventory.incubatorStock": "الحاضنة",
  "inventory.price": "السعر",
  "inventory.cost": "التكلفة",
  "inventory.stock": "المخزون",
  "inventory.sku": "كود المنتج",
  "inventory.noProducts": "لا توجد منتجات تطابق الشروط.",

  "customers.title": "دليل وسجل العملاء",
  "customers.searchPh": "بحث بالاسم أو رقم الهاتف...",
  "customers.lifetimeSpend": "إجمالي المشتريات",
  "customers.ordersCount": "عدد الطلبات",
  "customers.lastOrder": "آخر طلب",
  "customers.history": "سجل طلبات العميل",
  "customers.noCustomers": "لا يوجد عملاء مطابقين.",

  "expenses.title": "تتبع المصروفات التشغيلية",
  "expenses.addExpense": "إضافة مصروف",
  "expenses.monthSummary": "مصروفات هذا الشهر",
  "expenses.category": "الفئة",
  "expenses.amount": "المبلغ",
  "expenses.notes": "ملاحظات",
  "expenses.paymentMethod": "طريقة الدفع",
  "expenses.date": "التاريخ",
  "expenses.noExpenses": "لا توجد مصروفات مسجلة لهذه الفترة.",

  "reports.title": "التقارير والإحصائيات",
  "reports.salesSummary": "ملخص المبيعات",
  "reports.averageOrder": "متوسط قيمة الطلب",
  "reports.topProducts": "المنتجات الأكثر تحقيقاً للإيرادات",
  "reports.paymentBreakdown": "توزيع طرق الدفع",
  "reports.periodToday": "اليوم",
  "reports.period7d": "آخر 7 أيام",
  "reports.period30d": "آخر 30 يوماً",
  "reports.periodAll": "كل الفترات",

  "discounts.title": "رموز الخصم والعروض",
  "discounts.addDiscount": "إنشاء كود خصم جديد",
  "discounts.code": "كود الخصم",
  "discounts.type": "نوع الخصم",
  "discounts.percentage": "نسبة مئوية (%)",
  "discounts.fixed": "مبلغ ثابت",
  "discounts.value": "قيمة الخصم",
  "discounts.minOrder": "الحد الأدنى للطلب",
  "discounts.maxDiscount": "الحد الأقصى لمبلغ الخصم",
  "discounts.expiryDate": "تاريخ الانتهاء",
  "discounts.usageLimit": "الحد الأقصى لاستخدام العميل",
  "discounts.noDiscounts": "لا توجد رموز خصم مفعّلة.",

  "categories.title": "الأقسام والتصنيفات",
  "categories.addCategory": "إضافة قسم جديد",
  "categories.nameAr": "الاسم بالعربية",
  "categories.nameEn": "الاسم بالإنجليزية",
  "categories.slug": "الاسم في الرابط (Slug)",
  "categories.sortOrder": "ترتيب الظهور",
  "categories.noCategories": "لا توجد أقسام مسجلة.",

  "incubators.title": "الحاضنات والعُهد",
  "incubators.locations": "مواقع الحاضنات والمحلات",
  "incubators.itemsConsigned": "القطع المسلّمة كعُهدة",
  "incubators.totalStock": "إجمالي مخزون الحاضنة",
  "incubators.sales": "مبيعات الحاضنة",
  "incubators.noIncubators": "لا توجد حاضنات مسجلة.",

  "reviews.title": "تقييمات وآراء العملاء",
  "reviews.rating": "التقييم",
  "reviews.comment": "ملاحظات العميل",
  "reviews.approved": "معتمد ومعروض في المتجر",
  "reviews.pending": "بانتظار المراجعة",
  "reviews.noReviews": "لا توجد تقييمات مسجلة بعد.",

  "campaigns.title": "حملات الواتساب والتواصل",
  "campaigns.templates": "قوالب الرسائل الجاهزة",
  "campaigns.orderConfirmation": "تأكيد استلام الطلب",
  "campaigns.deliveryDispatch": "خروج الشحنة مع المندوب",
  "campaigns.readyPickup": "جاهز للاستلام من الفرع",
  "campaigns.promotional": "رسائل العروض الترويجية",

  "team.title": "إدارة الموظفين والصلاحيات",
  "team.addMember": "إضافة موظف جديد",
  "team.name": "الاسم",
  "team.role": "الدور والوظيفة",
  "team.admin": "مدير النظام",
  "team.staff": "فريق العمليات",
  "team.courier": "مندوب التوصيل",
  "team.active": "نشط",
  "team.inactive": "معطّل",
  "team.noMembers": "لا يوجد موظفون مسجلون.",

  "settings.title": "إعدادات المتجر",
  "settings.storeName": "اسم المتجر",
  "settings.currency": "العملة",
  "settings.phone": "هاتف التواصل",
  "settings.whatsapp": "واتساب خدمة العملاء",
  "settings.deliveryFee": "رسوم التوصيل الافتراضية",
  "settings.policy": "سياسات واستبدال المتجر",

  "integrations.title": "بوابات الدفع والربط التقني",
  "integrations.benefit": "بوابة بنفت بي (BenefitPay)",
  "integrations.tap": "بوابة تاب (Tap Payments)",
  "integrations.applePay": "أبل باي (Apple Pay)",
  "integrations.connected": "متصل ومفعّل",
  "integrations.notConfigured": "غير مهيّأ",

  "pages.title": "الصفحات الثابتة والسياسات",
  "pages.about": "عن العلامة التجارية",
  "pages.returns": "سياسة الاسترجاع والاستبدال",
  "pages.terms": "الشروط والأحكام",
  "pages.privacy": "سياسة الخصوصية",
};

const dicts: Record<Lang, Dict> = { en, ar };

type I18nContextValue = {
  lang: Lang;
  isAr: boolean;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string) => string;
};

const LANG_STORAGE_KEY = "boutq_mobile_lang";
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    void AsyncStorage.getItem(LANG_STORAGE_KEY).then((stored) => {
      if (stored === "en" || stored === "ar") {
        setLangState(stored);
      }
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    void AsyncStorage.setItem(LANG_STORAGE_KEY, l);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = prev === "ar" ? "en" : "ar";
      void AsyncStorage.setItem(LANG_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string): string => {
      return dicts[lang]?.[key] ?? dicts.en?.[key] ?? key;
    },
    [lang],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      isAr: lang === "ar",
      setLang,
      toggleLang,
      t,
    }),
    [lang, setLang, toggleLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
