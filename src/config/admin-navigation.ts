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
      icon: FileText,
      permission: "manage_settings",
      section: "storefront_settings",
      tier: "modular",
    },
    {
      id: "team",
      to: "/admin/b/$slug/team",
      params: { slug: activeSlug },
      labelEn: "Team Management",
      labelAr: lang === "ar" ? "إدارة الموظفين" : "Team Management",
      icon: Shield,
      adminOnly: true,
      section: "storefront_settings",
      tier: "modular",
    },
    {
      id: "settings",
      to: "/admin/b/$slug/settings",
      params: { slug: activeSlug },
      labelEn: "Settings",
      labelAr: t("nav.settings"),
      icon: Settings,
      permission: "manage_settings",
      section: "storefront_settings",
      tier: "core",
    },
  ];

  return allItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.permission) return hasPermission(item.permission);
    return true;
  });
}
