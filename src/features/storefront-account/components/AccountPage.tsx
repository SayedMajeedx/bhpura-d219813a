import { Navigate } from "@tanstack/react-router";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStorefront, formatPrice, useStoreModules } from "@/lib/storefront-context";
import { cn } from "@/lib/utils";
import { ownCustomerQueries } from "@/lib/data/customers";
import { returnsQueries } from "@/lib/data/returns";
import { loyaltyQueries } from "@/lib/data/loyalty";
import { loyaltyProgramState, shopperLoyaltyTier } from "@/lib/loyalty-program";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PackageSearch,
  MapPin,
  User as UserIcon,
  Award,
  Sparkles,
  Fingerprint,
  RotateCcw,
  Wallet,
  Coins,
  Ruler,
  CalendarDays,
  Gift,
} from "lucide-react";
import { PasskeySettings } from "@/components/passkey-settings";
import { CustomerReturnRequestModal } from "@/components/storefront/CustomerReturnRequestModal";
import { CustomerLoyaltySection } from "@/components/loyalty/CustomerLoyaltySection";
import { getCustomerStoreCreditBalance } from "@/lib/returns.functions";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { getInitials } from "@/features/storefront-account/lib/account-shared";
import { SignOutButton } from "@/features/storefront-account/components/SignOutButton";
import { useCustomer } from "@/features/storefront-account/hooks/use-customer";
import { OrdersSection } from "@/features/storefront-account/components/OrdersSection";
import { CustomerReturnsSection } from "@/features/storefront-account/components/CustomerReturnsSection";
import { ProfileSection } from "@/features/storefront-account/components/ProfileSection";
import { AddressesSection } from "@/features/storefront-account/components/AddressesSection";
import { BookingsSection } from "@/features/storefront-account/components/BookingsSection";
import { GiftCardsSection } from "@/features/storefront-account/components/GiftCardsSection";
import { giftCardOnlineQueries } from "@/lib/data/gift-cards/online";

export function AccountPage() {
  const { brand, session, isStoreMember, membershipLoading, t, lang, currency } = useStorefront();
  const modules = useStoreModules();
  const isAr = lang === "ar";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: customer, isLoading: loadingCustomer } = useCustomer();

  const { data: orders, isLoading: loadingOrders } = useQuery(
    ownCustomerQueries.orders(brand.id, customer?.id),
  );

  // A store that takes bookings shows the shopper's own (storefront_my_bookings).
  const { data: bookings, isLoading: loadingBookings } = useQuery(
    ownCustomerQueries.bookings(brand.id, customer?.id, Boolean(modules.bookings)),
  );

  const { data: addresses, isLoading: loadingAddresses } = useQuery(
    ownCustomerQueries.addresses(brand.id, customer?.id),
  );

  const { data: storeCredit = 0 } = useQuery({
    queryKey: ["storefront-account-store-credit", brand.id, customer?.id],
    enabled: !!brand.id && !!customer?.id,
    queryFn: async () => {
      return getCustomerStoreCreditBalance(brand.id, customer!.id);
    },
  });

  const {
    data: customerReturns = [],
    isLoading: loadingReturns,
    refetch: refetchReturns,
  } = useQuery(returnsQueries.customer(brand.id, customer?.id ?? ""));

  const [returnModalOrder, setReturnModalOrder] = useState<any>(null);

  const totalSpent = useMemo(() => {
    return (orders ?? []).reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [orders]);

  // The store's own programme: the Rewards tab and the tier only while it is on, and the tier
  // the database gave the shopper (the page once made up "Gold VIP" from 350 spent).
  // The cards bought while signed in, with their codes once paid; the tab shows when there are some.
  const { data: giftCards, isLoading: loadingGiftCards } = useQuery(
    giftCardOnlineQueries.mine(brand.id, session?.user?.id),
  );
  const showGiftCards = (giftCards?.length ?? 0) > 0;
  const { data: loyaltyProgram } = useQuery(loyaltyQueries.program(brand.id));
  const { data: loyaltyTiers = [] } = useQuery(loyaltyQueries.tiers(brand.id));
  const { data: loyaltyAccount } = useQuery(loyaltyQueries.account(brand.id, customer?.id ?? ""));
  const loyaltyOn = loyaltyProgramState(loyaltyProgram) === "on";
  const loyaltyTier = shopperLoyaltyTier(loyaltyProgram, loyaltyAccount, loyaltyTiers);
  // A services store takes no returns; its bookings come first.
  const showReturns = modules.returns !== false;
  const tabCount =
    4 +
    (modules.bookings ? 1 : 0) +
    (showReturns ? 1 : 0) +
    (loyaltyOn ? 1 : 0) +
    (showGiftCards ? 1 : 0) +
    (modules.fit_passport ? 1 : 0);

  if (membershipLoading) {
    return <SectionSkeleton rows={3} className="min-h-[45vh]" />;
  }

  if (!session || !isStoreMember) {
    return (
      <Navigate
        to="/$slug/auth"
        params={{ slug: brand.slug }}
        search={{ redirect: mounted ? window.location.pathname : "" }}
      />
    );
  }

  return (
    <section
      dir={isAr ? "rtl" : "ltr"}
      className={`mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 ${isAr ? "text-end" : "text-start"}`}
    >
      {/* Editorial Header */}
      <div className="border-b pb-6 mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-bold tracking-widest text-primary/80 block mb-1">
            {t("بوابة العميل", "Customer Portal")}
          </span>
          <h1 className="font-display text-3xl sm:text-4xl" style={{ color: "var(--sf-heading)" }}>
            {t("حسابي الخاص", "My Account")}
          </h1>
        </div>
        <p className="text-xs text-muted-foreground md:max-w-xs leading-relaxed">
          {t(
            "مرحباً بك في مساحتك الخاصة لإدارة طلباتك وتفضيلات الشحن الشخصية بشكل آمن.",
            "Manage your orders, active deliveries, and billing profiles in one dedicated workspace.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-8 items-start">
        {/* Luxury Profiler Side Panel */}
        <Card className="p-6 text-center space-y-6 bg-card border border-border-strong rounded-2xl shadow-xs relative overflow-hidden">
          <div className="space-y-4">
            {/* Elegant Monogram Monocle */}
            <div className="w-20 h-20 rounded-full mx-auto bg-primary/10 text-primary flex items-center justify-center font-display text-2xl font-bold border border-primary/20 shadow-inner relative">
              <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-amber-500 animate-pulse" />
              {getInitials(customer?.name || session.user?.email || "U")}
            </div>

            {/* Profile Identity Text */}
            <div className="space-y-1">
              <h2
                className="font-display text-xl truncate px-2"
                style={{ color: "var(--sf-heading)" }}
              >
                {customer?.name || t("ضيف", "Guest")}
              </h2>
              <p className="text-xs text-muted-foreground truncate px-2">{session.user?.email}</p>
            </div>

            {/* The shopper's tier in the store's programme, when there is one. */}
            {loyaltyTier && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                <Award className="w-3.5 h-3.5" />
                {isAr ? loyaltyTier.name_ar : loyaltyTier.name_en}
              </div>
            )}

            {/* Store Credit Wallet Pill if Available */}
            {Number(storeCredit) > 0 && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="text-xs uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300 block flex items-center justify-center gap-1">
                  <Wallet className="h-3 w-3" />
                  {t("رصيد المتجر (المحفظة)", "Store Credit")}
                </span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {formatPrice(storeCredit, currency, lang)}
                </span>
              </div>
            )}
          </div>

          <hr className="border-border-subtle" />

          {/* Core metrics panel */}
          <div className="grid grid-cols-3 gap-1 divide-x divide-border/40 rtl:divide-x-reverse text-center">
            <div className="px-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t("المشتريات", "Spent")}
              </p>
              <p
                className="text-xs font-bold mt-1 text-foreground"
                style={{ color: "var(--sf-heading)" }}
              >
                {formatPrice(totalSpent, currency, lang)}
              </p>
            </div>
            <div className="px-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t("الطلبات", "Orders")}
              </p>
              <p
                className="text-xs font-bold mt-1 text-foreground"
                style={{ color: "var(--sf-heading)" }}
              >
                {orders?.length ?? 0}
              </p>
            </div>
            <div className="px-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {t("المرتجعات", "Returns")}
              </p>
              <p
                className="text-xs font-bold mt-1 text-foreground"
                style={{ color: "var(--sf-heading)" }}
              >
                {customerReturns?.length ?? 0}
              </p>
            </div>
          </div>

          <hr className="border-border-subtle" />

          {/* Quick Sign Out control */}
          <div className="pt-1">
            <SignOutButton />
          </div>
        </Card>

        {/* Portal Active Sections */}
        <div className="space-y-6">
          <Tabs
            defaultValue={modules.bookings ? "bookings" : "orders"}
            className="w-full rounded-2xl border bg-card p-4 shadow-xs sm:p-6 border-border-strong"
          >
            <TabsList
              className={cn(
                "grid w-full h-auto rounded-xl p-1 bg-muted/40 border border-border-subtle mb-6 gap-1",
                "grid-cols-2",
                tabCount >= 9
                  ? "sm:grid-cols-9"
                  : tabCount === 8
                    ? "sm:grid-cols-8"
                    : tabCount === 7
                      ? "sm:grid-cols-7"
                      : tabCount === 6
                        ? "sm:grid-cols-6"
                        : "sm:grid-cols-5",
              )}
            >
              {modules.bookings && (
                <TabsTrigger
                  value="bookings"
                  className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
                >
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs">{t("حجوزاتي", "My bookings")}</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="orders"
                className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
              >
                <PackageSearch className="h-4 w-4 text-primary" />
                <span className="font-semibold text-xs">{t("طلباتي", "My orders")}</span>
              </TabsTrigger>
              {loyaltyOn && (
                <TabsTrigger
                  value="loyalty"
                  className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
                >
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs">{t("المكافآت والولاء", "Rewards")}</span>
                </TabsTrigger>
              )}
              {showGiftCards && (
                <TabsTrigger
                  value="gift-cards"
                  className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
                >
                  <Gift className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs">{t("بطاقات الهدايا", "Gift cards")}</span>
                </TabsTrigger>
              )}
              {showReturns && (
                <TabsTrigger
                  value="returns"
                  className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
                >
                  <RotateCcw className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs">{t("المرتجعات", "Returns")}</span>
                  {customerReturns.length > 0 && (
                    <span className="text-xs font-mono font-bold bg-primary/20 text-primary px-1.5 py-0.2 rounded-full">
                      {customerReturns.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {modules.fit_passport && (
                <TabsTrigger
                  value="fit"
                  className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
                >
                  <Ruler className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-xs">{t("مقاساتي", "My fit")}</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="profile"
                className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
              >
                <UserIcon className="h-4 w-4 text-primary" />
                <span className="font-semibold text-xs">{t("البيانات", "Profile")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="addresses"
                className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
              >
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-semibold text-xs">{t("العناوين", "Addresses")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="gap-1.5 py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition text-xs"
              >
                <Fingerprint className="h-4 w-4 text-primary" />
                <span className="font-semibold text-xs">{t("الأمان", "Security")}</span>
              </TabsTrigger>
            </TabsList>

            {modules.bookings && (
              <TabsContent value="bookings" className="mt-0 focus-visible:outline-none">
                <BookingsSection bookings={bookings} isLoading={loadingBookings} />
              </TabsContent>
            )}

            <TabsContent value="orders" className="mt-0 focus-visible:outline-none">
              <OrdersSection
                currency={currency}
                isAr={isAr}
                lang={lang}
                orders={orders}
                isLoading={loadingOrders}
                onRequestReturn={(order) => setReturnModalOrder(order)}
              />
            </TabsContent>

            {showGiftCards && (
              <TabsContent value="gift-cards" className="mt-0 focus-visible:outline-none">
                <GiftCardsSection cards={giftCards} isLoading={loadingGiftCards} />
              </TabsContent>
            )}

            {loyaltyOn && (
              <TabsContent value="loyalty" className="mt-0 focus-visible:outline-none">
                <CustomerLoyaltySection
                  brandId={brand.id}
                  customerId={customer?.id || ""}
                  currency={currency}
                />
              </TabsContent>
            )}

            {showReturns && (
              <TabsContent value="returns" className="mt-0 focus-visible:outline-none">
                <CustomerReturnsSection
                  currency={currency}
                  isAr={isAr}
                  lang={lang}
                  returns={customerReturns}
                  isLoading={loadingReturns}
                />
              </TabsContent>
            )}

            <TabsContent value="profile" className="mt-0 focus-visible:outline-none">
              <ProfileSection isAr={isAr} customer={customer} loadingCustomer={loadingCustomer} />
            </TabsContent>

            {modules.fit_passport && (
              <TabsContent value="fit" className="mt-0 focus-visible:outline-none">
                <AddonSlot
                  placement="storefront.account.tab"
                  props={{
                    brandId: brand.id,
                    brandName:
                      (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) ??
                      undefined,
                    customerId: customer?.id,
                    isAr: isAr,
                  }}
                />
              </TabsContent>
            )}

            <TabsContent value="addresses" className="mt-0 focus-visible:outline-none">
              <AddressesSection
                isAr={isAr}
                lang={lang}
                addresses={addresses}
                isLoading={loadingAddresses}
                customer={customer}
                loadingCustomer={loadingCustomer}
              />
            </TabsContent>

            <TabsContent value="security" className="mt-0 focus-visible:outline-none">
              <PasskeySettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Customer Return Request Modal */}
      {returnModalOrder && (
        <CustomerReturnRequestModal
          open={!!returnModalOrder}
          onOpenChange={(open) => !open && setReturnModalOrder(null)}
          order={returnModalOrder}
          brandId={brand.id}
          isAr={isAr}
          onSuccess={() => {
            refetchReturns();
          }}
        />
      )}
    </section>
  );
}
