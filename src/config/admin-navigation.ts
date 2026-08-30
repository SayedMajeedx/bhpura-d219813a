import {
  LayoutDashboard,
  Package,
  Users,
  ReceiptText,
  Settings,
  Wallet,
  Megaphone,
  Shield,
  Plug,
  Tags,
  FileText,
  BadgePercent,
  Mail,
  BarChart,
  Building2,
  MessageSquareHeart,
  RotateCcw,
  Award,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type NavItemTier = "core" | "modular";

export interface AdminNavItemConfig {
  id: string;
  to: string;
  params?: Record<string, string>;
  labelEn: string;
  labelAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  icon: LucideIcon;
  permission?: string;
  adminOnly?: boolean;
  section: "overview" | "operations" | "growth_finance" | "storefront_settings";
  tier?: NavItemTier;
  badge?: string | number;
}

export const CORE_NAV_IDS = [
  "dashboard",
  "orders",
  "inventory",
  "customers",
  "reports",
  "settings",
] as const;

export const DEFAULT_PINNED_IDS = ["returns", "discounts", "campaigns"] as const;

export interface GetNavItemsOptions {
  activeSlug: string | null;
  isCourier: boolean;
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  t: (key: string) => string;
  lang: "en" | "ar";
}

export function getAdminNavItems({
  activeSlug,
  isCourier,
  isAdmin,
  hasPermission,
  t,
  lang,
}: GetNavItemsOptions): AdminNavItemConfig[] {
  if (!activeSlug) return [];

  if (isCourier) {
    return [
      {
        id: "orders",
        to: "/admin/b/$slug/orders",
        params: { slug: activeSlug },
        labelEn: "Orders",
        labelAr: t("nav.orders"),
        descriptionEn: "Order tracking and delivery fulfillment",
        descriptionAr: "متابعة الطلبات وتوصيل الشحنات",
        icon: ReceiptText,
        section: "operations",
      },
    ];
  }

  const allItems: AdminNavItemConfig[] = [
    // Group 1: OVERVIEW
    {
      id: "dashboard",
      to: "/admin/b/$slug/dashboard",
      params: { slug: activeSlug },
      labelEn: "Dashboard",
      labelAr: t("nav.dashboard"),
      descriptionEn: "Real-time command center, live sales metrics, and top boutique KPIs",
      descriptionAr: "لوحة التحكم الرئيسية والإحصائيات اللحظية للمبيعات والطلبات",
      icon: LayoutDashboard,
      section: "overview",
      tier: "core",
    },
    {
      id: "reports",
      to: "/admin/b/$slug/reports",
      params: { slug: activeSlug },
      labelEn: "Reports",
      labelAr: lang === "ar" ? "التقارير" : "Reports",
      descriptionEn: "Comprehensive financial accounting, VAT reports, sales, and profit margin analysis",
      descriptionAr: "التقارير المحاسبية التفصيلية، المبيعات، ضريبة القيمة المضافة، والربحية",
      icon: BarChart,
      permission: "manage_orders",
      section: "overview",
      tier: "core",
    },

    // Group 2: OPERATIONS
    {
      id: "orders",
      to: "/admin/b/$slug/orders",
      params: { slug: activeSlug },
      labelEn: "Orders & Invoices",
      labelAr: lang === "ar" ? "الطلبات والفواتير" : "Orders & Invoices",
      descriptionEn: "Order fulfillment, invoice generation, courier dispatch, and manual sales",
      descriptionAr: "معالجة ومتابعة الطلبات، الفواتير، حالات الشحن، والطلبات اليدوية",
      icon: ReceiptText,
      permission: "manage_orders",
      section: "operations",
      tier: "core",
    },
    {
      id: "returns",
      to: "/admin/b/$slug/returns",
      params: { slug: activeSlug },
      labelEn: "Returns & Exchanges",
      labelAr: lang === "ar" ? "المرتجعات والاستبدال" : "Returns & Exchanges",
      descriptionEn: "Manage return and exchange requests, compensation policies, and reverse logistics",
      descriptionAr: "إدارة طلبات الاسترجاع والاستبدال وسياسات التعويض واستلام المنتجات",
      icon: RotateCcw,
      permission: "manage_orders",
      section: "operations",
      tier: "modular",
    },
    {
      id: "customers",
      to: "/admin/b/$slug/customers",
      params: { slug: activeSlug },
      labelEn: "Customers",
      labelAr: t("nav.customers"),
      descriptionEn: "Customer CRM, purchasing history, VIP segments, and delivery addresses",
      descriptionAr: "قاعدة بيانات العملاء، سجل المشتريات، والعناوين المفضلة",
      icon: Users,
      permission: "manage_customers",
      section: "operations",
      tier: "core",
    },
    {
      id: "reviews",
      to: "/admin/b/$slug/reviews",
      params: { slug: activeSlug },
      labelEn: "Customer Reviews",
      labelAr: lang === "ar" ? "تقييمات العملاء" : "Customer Reviews",
      descriptionEn: "Review customer ratings, testimonials, and moderate public feedback",
      descriptionAr: "إدارة ومراجعة تقييمات العملاء وآرائهم على المنتجات وتفعيل ظهورها",
      icon: MessageSquareHeart,
      permission: "manage_customers",
      section: "operations",
      tier: "modular",
    },
    {
      id: "inventory",
      to: "/admin/b/$slug/inventory",
      params: { slug: activeSlug },
      labelEn: "Inventory",
      labelAr: t("nav.inventory"),
      descriptionEn: "Manage products, size/color variants, stock tracking, and pricing",
      descriptionAr: "إدارة المنتجات، المقاسات والألوان، تنبيهات المخزون، والأسعار",
      icon: Package,
      permission: "manage_inventory",
      section: "operations",
      tier: "core",
    },
    {
      id: "incubators",
      to: "/admin/b/$slug/incubators",
      params: { slug: activeSlug },
      labelEn: "Incubators & Consignment",
      labelAr: lang === "ar" ? "الحاضنات والعُهد" : "Incubators & Consignment",
      descriptionEn: "Consignment inventory tracking, vendor payouts, and profit-sharing management",
      descriptionAr: "إدارة بضائع الأمانة، الموردين الخارجيين، ونسب الأرباح المشتركة",
      icon: Building2,
      permission: "manage_inventory",
      section: "operations",
      tier: "modular",
    },
    {
      id: "categories",
      to: "/admin/b/$slug/categories",
      params: { slug: activeSlug },
      labelEn: "Categories",
      labelAr: lang === "ar" ? "الأقسام" : "Categories",
      descriptionEn: "Organize products into main and sub-categories for intuitive storefront browsing",
      descriptionAr: "تنظيم المنتجات في أقسام وتصنيفات رئيسية وفرعية لتسهيل التصفح",
      icon: Tags,
      permission: "manage_inventory",
      section: "operations",
      tier: "modular",
    },

    // Group 3: GROWTH & FINANCE
    {
      id: "campaigns",
      to: "/admin/b/$slug/campaigns",
      params: { slug: activeSlug },
      labelEn: "WhatsApp Campaigns",
      labelAr: lang === "ar" ? "حملات الواتساب" : "WhatsApp Campaigns",
      descriptionEn: "Launch targeted WhatsApp marketing broadcasts, promos, and customer alerts",
      descriptionAr: "إرسال رسائل وحملات تسويقية وتنبيهات مخصصة لعملائك عبر الواتساب",
      icon: Megaphone,
      permission: "manage_orders",
      section: "growth_finance",
      tier: "modular",
    },
    {
      id: "discounts",
      to: "/admin/b/$slug/discounts",
      params: { slug: activeSlug },
      labelEn: "Discount Codes",
      labelAr: lang === "ar" ? "رموز الخصم" : "Discount Codes",
      descriptionEn: "Create promo codes, percentage/fixed discounts, and free shipping triggers",
      descriptionAr: "إنشاء أكواد الخصم، العروض الترويجية، الشحن المجاني والخصومات التلقائية",
      icon: BadgePercent,
      permission: "manage_settings",
      section: "growth_finance",
      tier: "modular",
    },
    {
      id: "loyalty",
      to: "/admin/b/$slug/loyalty",
      params: { slug: activeSlug },
      labelEn: "Loyalty & Rewards",
      labelAr: lang === "ar" ? "برنامج الولاء والمكافآت" : "Loyalty & Rewards",
      descriptionEn: "Customer rewards points system for repeat purchases and loyalty tiers",
      descriptionAr: "برنامج مكافآت ونقاط ولاء العملاء مع كل عملية شراء لاسترجاع واستبدال النقاط",
      icon: Award,
      permission: "manage_settings",
      section: "growth_finance",
      tier: "modular",
    },
    {
      id: "abandoned-carts",
      to: "/admin/b/$slug/abandoned-carts",
      params: { slug: activeSlug },
      labelEn: "Abandoned Carts",
      labelAr: lang === "ar" ? "السلات المتروكة" : "Abandoned Carts",
      descriptionEn: "Track abandoned checkouts and recover lost sales with automated follow-ups",
      descriptionAr: "متابعة السلات غير المكتملة وتذكير العملاء لإتمام الشراء بالواتساب",
      icon: ShoppingCart,
      permission: "manage_orders",
      section: "growth_finance",
      tier: "modular",
    },
    {
      id: "expenses",
      to: "/admin/b/$slug/expenses",
      params: { slug: activeSlug },
      labelEn: "Expenses",
      labelAr: t("nav.expenses"),
      descriptionEn: "Track operational overhead, marketing expenses, and accurate net profit",
      descriptionAr: "تسجيل المصروفات التشغيلية والتسويقية وحساب صافي الأرباح بدقة",
      icon: Wallet,
      permission: "view_financials",
      section: "growth_finance",
      tier: "modular",
    },

    // Group 4: STOREFRONT & SETTINGS
    {
      id: "integrations",
      to: "/admin/b/$slug/integrations",
      params: { slug: activeSlug },
      labelEn: "Integrations",
      labelAr: t("nav.integrations"),
      descriptionEn: "Connect payment gateways, shipping couriers, analytics, and Webhook APIs",
      descriptionAr: "ربط المتجر مع بوابات الدفع، شركات الشحن، وخدمات التحليلات والـ Webhooks",
      icon: Plug,
      adminOnly: true,
      section: "storefront_settings",
      tier: "modular",
    },
    {
      id: "communications",
      to: "/admin/b/$slug/communications",
      params: { slug: activeSlug },
      labelEn: "Communications",
      labelAr: lang === "ar" ? "الاتصالات" : "Communications",
      descriptionEn: "Automated order confirmation templates, SMS, and email communication channels",
      descriptionAr: "إعداد قوالب الإشعارات التلقائية عبر الواتساب والرسائل النصية والبريد",
      icon: Mail,
      permission: "manage_settings",
      section: "storefront_settings",
      tier: "modular",
    },
    {
      id: "pages",
      to: "/admin/b/$slug/pages",
      params: { slug: activeSlug },
      labelEn: "Pages & Policies",
      labelAr: lang === "ar" ? "الصفحات والسياسات" : "Pages & Policies",
      descriptionEn: "Custom content pages, About Us, Privacy Policy, and Terms & Conditions",
      descriptionAr: "إنشاء وتعديل الصفحات التعريفية مثل (من نحن، سياسة الشحن، الشروط والأحكام)",
      icon: FileText,
      permission: "manage_settings",
      section: "storefront_settings",
      tier: "modular",
    },
    {
      id: "team",
      to: "/admin/b/$slug/team",
      params: { slug: activeSlug },
      labelEn: "Team & Permissions",
      labelAr: lang === "ar" ? "فريق العمل والصلاحيات" : "Team & Permissions",
      descriptionEn: "Manage team members, staff invites, and granular permission access",
      descriptionAr: "إضافة الموظفين وتعيين الصلاحيات وأدوار الإدارة لكل عضو في الفريق",
      icon: Shield,
      permission: "manage_team",
      section: "storefront_settings",
      tier: "modular",
    },
    {
      id: "settings",
      to: "/admin/b/$slug/settings",
      params: { slug: activeSlug },
      labelEn: "Settings",
      labelAr: t("nav.settings"),
      descriptionEn: "Store profile, currency, branding, working hours, and checkout preferences",
      descriptionAr: "إعدادات المتجر، العملة، الهوية البصرية، أوقات العمل، وخيارات الدفع",
      icon: Settings,
      permission: "manage_settings",
      section: "storefront_settings",
      tier: "core",
    },
  ];

  return allItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });
}
