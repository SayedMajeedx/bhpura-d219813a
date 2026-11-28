import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { searchOrders } from "@/lib/data/orders";
import { searchCustomers } from "@/lib/data/customers";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import { useBrandOptional } from "@/lib/brand-context";
import { getStorefrontUrl } from "@/lib/storefront-url";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Package,
  ReceiptText,
  Megaphone,
  Wallet,
  BadgePercent,
  Plus,
  Store,
  Languages,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { fetchBrandIdBySlug } from "@/lib/data/brands";
import { searchProducts } from "@/lib/data/catalog";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import type { AdminNavItemConfig } from "@/config/admin-navigation";
import { useOrderNumber, useOrderNumberFormat } from "@/hooks/use-order-number";
import { orderNumberQuery } from "@/lib/order-number";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { matchesWords } from "@/lib/fold-text";
import { setStoredSettingsLevel } from "@/features/settings/settings-level";

type SettingsSearch = typeof import("@/features/settings/lib/settings-search");

/**
 * The settings' search, loaded once someone types: the list of 199 settings stays out of the
 * script every admin page loads.
 */
function useSettingsSearch(wanted: boolean): SettingsSearch | null {
  const [search, setSearch] = useState<SettingsSearch | null>(null);
  useEffect(() => {
    if (!wanted || search) return;
    let live = true;
    import("@/features/settings/lib/settings-search")
      .then((module) => {
        if (live) setSearch(module);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wanted, search]);
  return search;
}

type PaletteAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  run: () => void;
};

export function SpotlightCommandPalette({
  open,
  onOpenChange,
  services = false,
  pages = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A services store: it adds services and has no stock. */
  services?: boolean;
  /** The menu's pages for this person (`getAdminNavItems`). */
  pages?: AdminNavItemConfig[];
}) {
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false }) as { slug?: string };
  const { lang, setLang } = useI18n();
  const brand = useBrandOptional();
  const orderNo = useOrderNumber(brand?.id);
  const numberFormat = useOrderNumberFormat(brand?.id);
  const storeCurrency = useStoreCurrency(brand?.id);
  const isAr = lang === "ar";
  const [searchQuery, setSearchQuery] = useState("");

  const activeSlug = brand?.slug || routeParams?.slug || "";

  // Query live matching orders, products, and customers
  const liveSearchResults = useQuery({
    queryKey: [
      "spotlight-search",
      activeSlug,
      brand?.id,
      searchQuery,
      numberFormat?.order_number_prefix ?? null,
    ],
    queryFn: async () => {
      const q = searchQuery.trim();
      if (!q) {
        return { orders: [], products: [], customers: [] };
      }

      // First resolve brandId if brand context is not loaded yet
      let bId = brand?.id;
      if (!bId && activeSlug) {
        bId = (await fetchBrandIdBySlug(activeSlug)) ?? undefined;
      }

      if (!bId) return { orders: [], products: [], customers: [] };

      const [ordersRes, productsRes, customersRes] = await Promise.all([
        searchOrders(bId, orderNumberQuery(q, numberFormat)),
        searchProducts(bId, q),
        searchCustomers(bId, q),
      ]);

      return {
        orders: ordersRes,
        products: productsRes,
        customers: customersRes,
      };
    },
    enabled: open && searchQuery.trim().length > 0,
    staleTime: 5_000,
  });

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    setSearchQuery("");
    callback();
  };

  const query = searchQuery.trim();
  const go = (href: string) => void navigate({ href });
  const store = (path: string) => `/admin/b/${encodeURIComponent(activeSlug)}/${path}`;

  // The pages of the menu this person may open, from its one definition (the palette once
  // listed its own pages, with no permission or store rule), narrowed to what was typed.
  const navItems = pages
    .map((page) => ({
      label: isAr ? page.labelAr : page.labelEn,
      href: page.to.replace("$slug", encodeURIComponent(activeSlug)),
      icon: page.icon,
    }))
    .filter((item) => !query || matchesWords(item.label, query));

  // A setting by its name, for a person who may open the settings: "logo", "الضريبة".
  const mayOpenSettings = Boolean(activeSlug) && pages.some((p) => p.to.endsWith("/settings"));
  const wantsSettings = open && mayOpenSettings && query.length >= 2;
  const settingsSearch = useSettingsSearch(wantsSettings);
  const storeSettings = useQuery({
    ...businessSettingsQueries.detail(brand?.id ?? ""),
    enabled: wantsSettings && Boolean(brand?.id),
  });
  const settingResults =
    settingsSearch && wantsSettings
      ? settingsSearch.searchSettings(query, storeSettings.data, 6)
      : [];

  const actions: PaletteAction[] = [
    ...(activeSlug
      ? [
          {
            id: "product",
            label: services
              ? isAr
                ? "إضافة خدمة جديدة"
                : "Create New Service"
              : isAr
                ? "إضافة منتج جديد"
                : "Create New Product",
            icon: Plus,
            iconClass: "text-emerald-500",
            run: () => go(store("inventory?action=new")),
          },
          {
            id: "order",
            label: isAr ? "إنشاء طلب يدوي جديد" : "Create Manual Order",
            icon: ReceiptText,
            iconClass: "text-blue-500",
            run: () => go(store("orders?action=new_manual")),
          },
          {
            id: "discount",
            label: isAr ? "إنشاء كود خصم جديد" : "Create Discount Code",
            icon: BadgePercent,
            iconClass: "text-purple-500",
            run: () => go(store("discounts?action=new")),
          },
          {
            id: "campaign",
            label: isAr ? "إرسال رسالة واتساب / حملة" : "Send WhatsApp Campaign",
            icon: Megaphone,
            iconClass: "text-rose-500",
            run: () => go(store("campaigns?segment=All")),
          },
          {
            id: "expense",
            label: isAr ? "تسجيل مصروف جديد" : "Record Expense",
            icon: Wallet,
            iconClass: "text-amber-500",
            run: () => go(store("expenses?action=new")),
          },
        ]
      : []),
    {
      id: "language",
      label: isAr ? "تغيير اللغة إلى الإنجليزية" : "Switch Language to Arabic (العربية)",
      icon: Languages,
      iconClass: "text-amber-500",
      run: () => setLang(lang === "en" ? "ar" : "en"),
    },
    ...(activeSlug
      ? [
          {
            id: "storefront",
            label: isAr ? "فتح المتجر الإلكتروني" : "View Live Storefront",
            icon: Store,
            iconClass: "text-sky-500",
            run: () => void window.open(getStorefrontUrl(activeSlug), "_blank"),
          },
        ]
      : []),
  ].filter((action) => !query || matchesWords(action.label, query));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} commandProps={{ shouldFilter: false }}>
      <CommandInput
        placeholder={
          isAr
            ? "ابحث عن طلب، منتج، إعداد، أو اكتب أمرًا..."
            : "Search orders, products, settings, or type a command..."
        }
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="max-h-[380px] p-2">
        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
          {isAr ? "لم يتم العثور على نتائج مطابقة." : "No matching results found."}
        </CommandEmpty>

        {/* Live Order Search Results */}
        {liveSearchResults.data?.orders && liveSearchResults.data.orders.length > 0 && (
          <CommandGroup heading={isAr ? "الطلبات المطابقة" : "Matching Orders"}>
            {liveSearchResults.data.orders.map((o) => (
              <CommandItem
                key={o.id}
                onSelect={() =>
                  handleSelect(() =>
                    navigate({
                      to: "/admin/b/$slug/orders/$id",
                      params: { slug: activeSlug, id: o.id },
                    }),
                  )
                }
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{orderNo(o.invoice_number)}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {o.customer_name_snapshot || (isAr ? "عميل زائر" : "Guest Customer")}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold">
                  {formatMoney(
                    Number(o.total || 0),
                    o.currency || storeCurrency,
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Live Product Search Results */}
        {liveSearchResults.data?.products && liveSearchResults.data.products.length > 0 && (
          <CommandGroup heading={isAr ? "المنتجات المطابقة" : "Matching Products"}>
            {liveSearchResults.data.products.map((p) => (
              <CommandItem
                key={p.id}
                onSelect={() =>
                  handleSelect(() =>
                    navigate({
                      to: "/admin/b/$slug/inventory",
                      params: { slug: activeSlug },
                    }),
                  )
                }
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="h-6 w-6 rounded object-cover border" />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">
                    {isAr ? p.name_ar || p.name_en : p.name_en || p.name_ar}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(
                    Number(p.base_price) > 0
                      ? Number(p.base_price)
                      : p.product_variants?.[0]?.selling_price
                        ? Number(p.product_variants[0].selling_price)
                        : 0,
                    storeCurrency,
                    isAr ? "ar-BH-u-nu-latn" : "en-US",
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Settings, by name: opens the Settings page at the setting's tab and group */}
        {settingsSearch && settingResults.length > 0 && (
          <CommandGroup heading={isAr ? "الإعدادات" : "Settings"}>
            {settingResults.map((entry) => (
              <CommandItem
                key={`${entry.table}.${entry.key}`}
                value={`setting-${entry.table}-${entry.key}`}
                onSelect={() =>
                  handleSelect(() => {
                    // A setting kept for the advanced view opens with that view on, or its
                    // group would not draw it.
                    if (entry.level === "advanced") setStoredSettingsLevel("advanced");
                    go(settingsSearch.settingHref(entry, activeSlug));
                  })
                }
                className="flex items-center gap-2 cursor-pointer"
              >
                <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{entry.label[lang]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {settingsSearch.settingPlace(entry, lang)}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Navigation Routes */}
        {navItems.length > 0 && (
          <CommandGroup heading={isAr ? "التنقل السريع" : "Quick Navigation"}>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`page-${item.href}`}
                  onSelect={() => handleSelect(() => go(item.href))}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Quick Actions */}
        {actions.length > 0 && (
          <CommandGroup heading={isAr ? "الإجراءات السريعة" : "Quick Actions"}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.id}
                  value={`action-${action.id}`}
                  onSelect={() => handleSelect(action.run)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Icon className={`h-4 w-4 ${action.iconClass}`} />
                  <span>{action.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
