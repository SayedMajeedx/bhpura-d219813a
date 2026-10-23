import {
  CalendarDays,
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
  BellRing,
  MessagesSquare,
  Gift,
  ShoppingCart,
  Palette,
  Ruler,
  Puzzle,
  Upload,
  Download,
  Scissors,
  Store,
  type LucideIcon,
} from "lucide-react";
import { isServicesProfile, type StoreModules } from "@/lib/store-profile";

/**
 * The store admin's menu: one definition read by the sidebar, the phone's dock and menu sheet, the
 * workspace tabs, the tools directory and the command palette, so they cannot disagree.
 *
 * Six workspaces, named as a boutique owner names them (as Shopify and Salla do): Home, Orders,
 * Products, Customers & marketing, Money, and Store at the end. Each page is in exactly one, in the
 * order it is used, the daily ones first. A page used now and then (`rare`) folds under "More
 * tools" in its workspace; it is never hidden, only folded. Who may open a page is `PAGE_ACCESS`
 * (`src/lib/page-access.ts`); an item carries the same rule, and `tests/page-access.test.ts` keeps
 * the two equal.
 */

export type AdminWorkspaceId = "home" | "orders" | "products" | "customers" | "money" | "store";

export interface AdminWorkspaceGroup {
  id: AdminWorkspaceId;
  labelEn: string;
  labelAr: string;
  shortLabelEn: string;
  shortLabelAr: string;
  icon: LucideIcon;
}

export const ADMIN_WORKSPACES: AdminWorkspaceGroup[] = [
  {
    id: "home",
    labelEn: "Home",
    labelAr: "الرئيسية",
    shortLabelEn: "Home",
    shortLabelAr: "الرئيسية",
    icon: LayoutDashboard,
  },
  {
    id: "orders",
    labelEn: "Orders",
    labelAr: "الطلبات",
    shortLabelEn: "Orders",
    shortLabelAr: "الطلبات",
    icon: ReceiptText,
  },
  {
    id: "products",
    labelEn: "Products",
    labelAr: "المنتجات",
    shortLabelEn: "Products",
    shortLabelAr: "المنتجات",
    icon: Package,
  },
  {
    id: "customers",
    labelEn: "Customers & marketing",
    labelAr: "العملاء والتسويق",
    shortLabelEn: "Customers",
    shortLabelAr: "العملاء",
    icon: Users,
  },
  {
    id: "money",
    labelEn: "Money",
    labelAr: "المالية",
    shortLabelEn: "Money",
    shortLabelAr: "المالية",
    icon: BarChart,
  },
  {
    id: "store",
    labelEn: "Store",
    labelAr: "المتجر",
    shortLabelEn: "Store",
    shortLabelAr: "المتجر",
    icon: Store,
  },
];

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
  workspace: AdminWorkspaceId;
  /** Used now and then: folded under "More tools" in its workspace. */
  rare?: boolean;
  badge?: string | number;
}

export interface GetNavItemsOptions {
  activeSlug: string | null;
  isCourier: boolean;
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  t: (key: string) => string;
  lang: "en" | "ar";
  storefrontMode?: "shop" | "catalog" | string | null;
  storeModules?: StoreModules;
}

type ItemDef = Omit<AdminNavItemConfig, "to" | "params"> & { page: string };

/** Every page of a store's admin, in the order each workspace lists them. */
const ITEMS: ItemDef[] = [
  // Home: what needs doing today.
  {
    id: "dashboard",
    page: "dashboard",
    labelEn: "Dashboard",
    labelAr: "لوحة التحكم",
    descriptionEn: "Today's sales, the orders that need you, and the store's key figures",
    descriptionAr: "مبيعات اليوم، والطلبات التي تحتاجك، وأهم أرقام المتجر",
    icon: LayoutDashboard,
    workspace: "home",
  },
  {
    id: "outreach",
    page: "outreach",
    labelEn: "Clients to message",
    labelAr: "عملاء للتواصل اليوم",
    descriptionEn:
      "Who is worth a message today and why, with the message written in their language",
    descriptionAr: "من يستحق رسالة اليوم ولماذا، والرسالة مكتوبة بلغته",
    icon: MessagesSquare,
    permission: "manage_customers",
    workspace: "home",
  },

  // Orders: what was ordered, booked, sent back or left in a cart.
  {
    id: "orders",
    page: "orders",
    labelEn: "Orders",
    labelAr: "الطلبات",
    descriptionEn: "Orders and invoices, delivery, the courier, and orders taken by hand",
    descriptionAr: "الطلبات والفواتير، والتوصيل والمندوب، والطلبات اليدوية",
    icon: ReceiptText,
    permission: "manage_orders",
    workspace: "orders",
  },
  {
    id: "bookings",
    page: "bookings",
    labelEn: "Bookings",
    labelAr: "الحجوزات",
    descriptionEn: "Booking calendar, booked and blocked days, and booking requests",
    descriptionAr: "تقويم الحجوزات، الأيام المحجوزة والمغلقة، وطلبات الحجز",
    icon: CalendarDays,
    permission: "manage_orders",
    workspace: "orders",
  },
  {
    id: "returns",
    page: "returns",
    labelEn: "Returns",
    labelAr: "المرتجعات",
    descriptionEn: "Return and exchange requests, refunds, and pieces coming back",
    descriptionAr: "طلبات الاسترجاع والاستبدال، والمبالغ المستردة، واستلام القطع",
    icon: RotateCcw,
    permission: "manage_orders",
    workspace: "orders",
  },
  {
    id: "abandoned-carts",
    page: "abandoned-carts",
    labelEn: "Abandoned carts",
    labelAr: "السلات المتروكة",
    descriptionEn: "Carts left without an order, and a WhatsApp reminder to those who agreed",
    descriptionAr: "السلات التي تُركت دون طلب، وتذكير عبر واتساب لمن وافق",
    icon: ShoppingCart,
    permission: "manage_orders",
    workspace: "orders",
  },

  // Products: what the store sells and how it comes in.
  {
    id: "inventory",
    page: "inventory",
    labelEn: "Products",
    labelAr: "المنتجات",
    descriptionEn: "Products, sizes and colours, stock, made to order, and prices",
    descriptionAr: "المنتجات، المقاسات والألوان، المخزون، الصنع حسب الطلب، والأسعار",
    icon: Package,
    permission: "manage_inventory",
    workspace: "products",
  },
  {
    id: "categories",
    page: "categories",
    labelEn: "Categories",
    labelAr: "الأقسام",
    descriptionEn: "Organise products into main and sub-categories for browsing the store",
    descriptionAr: "تنظيم المنتجات في أقسام رئيسية وفرعية لتسهيل التصفح",
    icon: Tags,
    permission: "manage_inventory",
    workspace: "products",
  },
  {
    id: "supplier-orders",
    page: "supplier-orders",
    labelEn: "Supplier orders",
    labelAr: "طلبيات الموردين",
    descriptionEn:
      "Orders from your suppliers: what arrived, what each piece cost, what is still owed",
    descriptionAr: "طلبيات الموردين: ما وصل منها، وتكلفة كل قطعة، وما بقي عليك",
    icon: Scissors,
    permission: "view_financials",
    workspace: "products",
  },
  {
    id: "incubators",
    page: "incubators",
    labelEn: "Partner shops",
    labelAr: "محلات الشركاء",
    descriptionEn: "Pieces at partner shops on consignment, their sales, and settlements",
    descriptionAr: "القطع لدى محلات الشركاء بالأمانة، ومبيعاتهم، والتسويات",
    icon: Building2,
    permission: "manage_inventory",
    workspace: "products",
  },
  {
    id: "size-guides",
    page: "size-guides",
    labelEn: "Size guides",
    labelAr: "أدلة المقاسات",
    descriptionEn: "Size charts, how-to-measure guides, and the size finder",
    descriptionAr: "جداول المقاسات، وإرشادات أخذ القياس، ومساعد اختيار المقاس",
    icon: Ruler,
    permission: "manage_inventory",
    workspace: "products",
  },

  // Customers & marketing: the people who buy, and what brings them back.
  {
    id: "customers",
    page: "customers",
    labelEn: "Customers",
    labelAr: "العملاء",
    descriptionEn: "Customers, what they bought, their addresses, and their consent to messages",
    descriptionAr: "العملاء، ومشترياتهم، وعناوينهم، وموافقتهم على الرسائل",
    icon: Users,
    permission: "manage_customers",
    workspace: "customers",
  },
  {
    id: "discounts",
    page: "discounts",
    labelEn: "Discounts",
    labelAr: "الخصومات",
    descriptionEn: "Discount codes, percentage or fixed discounts, and free delivery offers",
    descriptionAr: "أكواد الخصم، والخصم بنسبة أو بمبلغ، وعروض التوصيل المجاني",
    icon: BadgePercent,
    permission: "manage_settings",
    workspace: "customers",
  },
  {
    id: "campaigns",
    page: "campaigns",
    labelEn: "WhatsApp campaigns",
    labelAr: "حملات الواتساب",
    descriptionEn: "A WhatsApp message to a group of customers, sent by you one chat at a time",
    descriptionAr: "رسالة واتساب لمجموعة من العملاء، ترسلها أنت محادثة بعد أخرى",
    icon: Megaphone,
    permission: "manage_orders",
    workspace: "customers",
  },
  {
    id: "loyalty",
    page: "loyalty",
    labelEn: "Loyalty",
    labelAr: "برنامج الولاء",
    descriptionEn: "Points for every order, tiers, and what members have to spend",
    descriptionAr: "نقاط مع كل طلب، والمستويات، ورصيد الأعضاء",
    icon: Award,
    permission: "manage_settings",
    workspace: "customers",
  },
  {
    id: "reviews",
    page: "reviews",
    labelEn: "Reviews",
    labelAr: "التقييمات",
    descriptionEn: "Customers' ratings and comments, and which ones the store shows",
    descriptionAr: "تقييمات العملاء وآراؤهم، وما يظهر منها في المتجر",
    icon: MessageSquareHeart,
    permission: "manage_customers",
    workspace: "customers",
  },
  {
    id: "signups",
    page: "signups",
    labelEn: "Sign-ups & waiting list",
    labelAr: "المشتركون وقائمة الانتظار",
    descriptionEn: "Who asked to be told when a product is back, and who signed up for your news",
    descriptionAr: "من طلب إشعاره عند توفر منتج، ومن اشترك في أخبار المتجر",
    icon: BellRing,
    permission: "manage_customers",
    workspace: "customers",
  },
  {
    id: "content-studio",
    page: "content-studio",
    labelEn: "Content studio",
    labelAr: "استديو المحتوى",
    descriptionEn: "Stories and posts made from your products, ready to publish",
    descriptionAr: "ستوريات ومنشورات من صور منتجاتك، جاهزة للنشر",
    icon: Palette,
    permission: "manage_inventory",
    workspace: "customers",
  },
  {
    id: "giveaways",
    page: "giveaways",
    labelEn: "Instagram giveaways",
    labelAr: "مسابقات انستغرام",
    descriptionEn: "Pull the comments on an Instagram post and draw winners with your own rules",
    descriptionAr: "اسحب تعليقات بوست على انستغرام واختر الفائزين حسب شروطك",
    icon: Gift,
    permission: "manage_settings",
    workspace: "customers",
    rare: true,
  },

  // Money: what the store made and spent.
  {
    id: "reports",
    page: "reports",
    labelEn: "Reports",
    labelAr: "التقارير",
    descriptionEn: "Sales, cost of goods, profit, VAT, products and customers, by period",
    descriptionAr: "المبيعات، تكلفة البضاعة، الربح، الضريبة، المنتجات والعملاء، لكل فترة",
    icon: BarChart,
    permission: "view_financials",
    workspace: "money",
  },
  {
    id: "expenses",
    page: "expenses",
    labelEn: "Expenses",
    labelAr: "المصاريف",
    descriptionEn: "Running costs, the cash box and bank, suppliers, and profit and loss",
    descriptionAr: "المصاريف التشغيلية، الصندوق والبنك، الموردون، والأرباح والخسائر",
    icon: Wallet,
    permission: "view_financials",
    workspace: "money",
  },

  // Store: how the store is set up, and who runs it.
  {
    id: "settings",
    page: "settings",
    labelEn: "Settings",
    labelAr: "الإعدادات",
    descriptionEn: "Store profile, look, payment and delivery, invoices, and checkout",
    descriptionAr: "بيانات المتجر، المظهر، الدفع والتوصيل، الفواتير، وإتمام الشراء",
    icon: Settings,
    permission: "manage_settings",
    workspace: "store",
  },
  {
    id: "team",
    page: "team",
    labelEn: "Team",
    labelAr: "فريق العمل",
    descriptionEn: "Staff, what each person may do, and their sign-in",
    descriptionAr: "الموظفون، وصلاحيات كل واحد، وبيانات الدخول",
    icon: Shield,
    adminOnly: true,
    workspace: "store",
  },
  {
    id: "pages",
    page: "pages",
    labelEn: "Pages & policies",
    labelAr: "الصفحات والسياسات",
    descriptionEn: "About us, delivery and return policies, terms, and the footer's pages",
    descriptionAr: "من نحن، سياسات التوصيل والاسترجاع، الشروط، وصفحات أسفل المتجر",
    icon: FileText,
    permission: "manage_settings",
    workspace: "store",
    rare: true,
  },
  {
    id: "communications",
    page: "communications",
    labelEn: "Notifications",
    labelAr: "الإشعارات",
    descriptionEn: "The messages and emails customers receive about their orders",
    descriptionAr: "الرسائل والإيميلات التي تصل العملاء عن طلباتهم",
    icon: Mail,
    permission: "manage_settings",
    workspace: "store",
    rare: true,
  },
  {
    id: "integrations",
    page: "integrations",
    labelEn: "Integrations",
    labelAr: "الربط والتكامل",
    descriptionEn: "Payment gateways, couriers, analytics, Instagram and other connections",
    descriptionAr: "بوابات الدفع، شركات التوصيل، التحليلات، انستغرام وغيرها",
    icon: Plug,
    adminOnly: true,
    workspace: "store",
    rare: true,
  },
  {
    id: "addons",
    page: "addons",
    labelEn: "Add-ons",
    labelAr: "الإضافات",
    descriptionEn: "Install and set up add-ons for your kind of store",
    descriptionAr: "تثبيت وإعداد الإضافات المناسبة لنوع متجرك",
    icon: Puzzle,
    permission: "manage_settings",
    workspace: "store",
    rare: true,
  },
  {
    id: "import",
    page: "import",
    labelEn: "Import",
    labelAr: "الاستيراد",
    descriptionEn:
      "Bring in products, customers and past orders from a spreadsheet or another platform",
    descriptionAr: "استيراد المنتجات والعملاء والطلبات السابقة من ملف أو منصة أخرى",
    icon: Upload,
    permission: "manage_inventory",
    workspace: "store",
    rare: true,
  },
  {
    id: "export",
    page: "export",
    labelEn: "Export & backup",
    labelAr: "التصدير والنسخ الاحتياطي",
    descriptionEn: "Download products, customers, orders and expenses as Excel or CSV",
    descriptionAr: "تنزيل المنتجات والعملاء والطلبات والمصاريف بصيغة إكسل أو CSV",
    icon: Download,
    permission: "manage_inventory",
    workspace: "store",
    rare: true,
  },
];

export function getAdminNavItems({
  activeSlug,
  isCourier,
  isAdmin,
  hasPermission,
  storefrontMode = "shop",
  storeModules,
}: GetNavItemsOptions): AdminNavItemConfig[] {
  if (!activeSlug) return [];
  const toItem = ({ page, ...item }: ItemDef): AdminNavItemConfig => ({
    ...item,
    to: `/admin/b/$slug/${page}`,
    params: { slug: activeSlug },
  });

  if (isCourier) {
    const orders = ITEMS.find((item) => item.id === "orders") as ItemDef;
    return [
      {
        ...toItem(orders),
        labelEn: "Deliveries",
        labelAr: "التوصيلات",
        descriptionEn: "The deliveries assigned to you",
        descriptionAr: "التوصيلات المسندة إليك",
      },
    ];
  }

  // A services store sells services: its catalog is not "Products".
  const services = storeModules ? isServicesProfile(storeModules) : false;
  const named = ITEMS.map(toItem).map((item) =>
    services && item.id === "inventory"
      ? {
          ...item,
          labelEn: "Services",
          labelAr: "الخدمات",
          descriptionEn: "Manage services, lengths, packages and prices",
          descriptionAr: "إدارة الخدمات والمدد والباقات والأسعار",
        }
      : item,
  );

  const shown = named.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.id === "size-guides" && !storeModules?.size_guide) return false;
    if (item.id === "bookings" && !storeModules?.bookings) return false;
    // A store without stock or returns (a services store) has no use for these.
    if (item.id === "incubators" && storeModules?.incubators === false) return false;
    // Orders of pieces from a supplier fill the stock: a store that keeps none has no use for it.
    if (item.id === "supplier-orders" && services) return false;
    if (item.id === "returns" && storeModules?.returns === false) return false;
    if (storefrontMode === "catalog") {
      if (item.id === "abandoned-carts" || item.id === "loyalty" || item.id === "discounts") {
        return false;
      }
    }
    return true;
  });
  // A services store works from its bookings: they open its Orders workspace (the phone's dock
  // and the workspace tabs open its first page), before the orders they become.
  return services ? bookingsFirst(shown) : shown;
}

function bookingsFirst(items: AdminNavItemConfig[]): AdminNavItemConfig[] {
  const bookings = items.find((item) => item.id === "bookings");
  const orders = items.findIndex((item) => item.id === "orders");
  if (!bookings || orders < 0) return items;
  const rest = items.filter((item) => item !== bookings);
  return [...rest.slice(0, orders), bookings, ...rest.slice(orders)];
}

/** The address an item opens, with the store filled in. */
export function navItemPath(item: AdminNavItemConfig, slug?: string | null): string {
  return item.to.replace("$slug", item.params?.slug ?? slug ?? "");
}

/** Whether an address is the item's page or one of its own pages (never one that only starts alike). */
export function isNavItemActive(
  item: AdminNavItemConfig,
  pathname: string,
  slug?: string | null,
): boolean {
  const target = navItemPath(item, slug);
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  return path === target || path.startsWith(`${target}/`);
}

/** The item whose page is open, or none. */
export function activeNavItem(
  navItems: readonly AdminNavItemConfig[],
  pathname: string,
  slug?: string | null,
): AdminNavItemConfig | undefined {
  return navItems.find((item) => isNavItemActive(item, pathname, slug));
}

/** The workspace of the page that is open, or none (a page outside the menu). */
export function workspaceOfPath(
  navItems: readonly AdminNavItemConfig[],
  pathname: string,
  slug?: string | null,
): AdminWorkspaceId | null {
  return activeNavItem(navItems, pathname, slug)?.workspace ?? null;
}

export type AdminNavGroup = AdminWorkspaceGroup & {
  /** The pages in view. */
  items: AdminNavItemConfig[];
  /** The pages folded under "More tools". */
  more: AdminNavItemConfig[];
};

/** The workspaces a person has pages in, in menu order, each with its pages in view and folded. */
export function adminNavGroups(navItems: readonly AdminNavItemConfig[]): AdminNavGroup[] {
  return ADMIN_WORKSPACES.map((workspace) => {
    const pages = navItems.filter((item) => item.workspace === workspace.id);
    return {
      ...workspace,
      items: pages.filter((item) => !item.rare),
      more: pages.filter((item) => item.rare),
    };
  }).filter((group) => group.items.length + group.more.length > 0);
}

/** A workspace by its id. */
export function workspaceById(id: AdminWorkspaceId | null | undefined) {
  return ADMIN_WORKSPACES.find((workspace) => workspace.id === id);
}

/** The workspaces the phone's dock offers before "More": the four a boutique opens every day. */
export const DOCK_WORKSPACES: readonly AdminWorkspaceId[] = [
  "home",
  "orders",
  "products",
  "customers",
];

/**
 * The phone's dock: each daily workspace the person has a page in, opening its first page, and
 * lit while any of its pages is open. Money and Store are in the menu sheet ("More").
 */
export function dockWorkspaces(
  navItems: readonly AdminNavItemConfig[],
  pathname: string,
  slug?: string | null,
): { workspace: AdminNavGroup; first: AdminNavItemConfig; active: boolean }[] {
  const open = workspaceOfPath(navItems, pathname, slug);
  return adminNavGroups(navItems)
    .filter((group) => DOCK_WORKSPACES.includes(group.id))
    .map((group) => ({
      workspace: group,
      first: group.items[0] ?? group.more[0],
      active: open === group.id,
    }));
}

/**
 * The tabs under the top bar for the workspace that is open: its pages in view, and a folded page
 * only while it is the one open.
 */
export function workspaceTabs(
  navItems: readonly AdminNavItemConfig[],
  pathname: string,
  slug?: string | null,
): {
  workspace?: AdminWorkspaceGroup;
  items: AdminNavItemConfig[];
  activeItem?: AdminNavItemConfig;
} {
  const activeItem = activeNavItem(navItems, pathname, slug);
  if (!activeItem) return { items: [] };
  const group = adminNavGroups(navItems).find((g) => g.id === activeItem.workspace);
  if (!group) return { items: [] };
  const items = activeItem.rare ? [...group.items, activeItem] : group.items;
  return { workspace: workspaceById(group.id), items, activeItem };
}
