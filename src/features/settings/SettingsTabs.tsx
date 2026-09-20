import { useI18n } from "@/lib/i18n";
import { type SettingsTabId } from "@/features/settings/registry";
import { IdentityTab } from "@/features/settings/tabs/identity/IdentityTab";
import { StorefrontTab } from "@/features/settings/tabs/storefront/StorefrontTab";
import { OrdersTab } from "@/features/settings/tabs/orders/OrdersTab";
import { NotificationsTab } from "@/features/settings/tabs/notifications/NotificationsTab";
import { AccountTab } from "@/features/settings/tabs/account/AccountTab";
import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  Package,
  Palette,
  Shield,
  ShoppingBag,
  Store,
} from "lucide-react";

export interface SettingsTabsProps {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

/** Navigation bar only (no form context required) — used by SettingsTabs and tests. */
export function SettingsTabBar({ activeTab, onTabChange }: SettingsTabsProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const tabs: Array<{
    id: SettingsTabId;
    label: string;
    icon: React.ElementType;
    description: string;
  }> = [
    {
      id: "identity",
      label: isAr ? "الهوية والعلامة" : "Identity",
      icon: Palette,
      description: isAr ? "الشعار والألوان والخطوط" : "Logos, colors & fonts",
    },
    {
      id: "storefront",
      label: isAr ? "المتجر والرئيسية" : "Storefront",
      icon: Store,
      description: isAr ? "الواجهة والبنرات والسيو" : "Homepage, banners & SEO",
    },
    {
      id: "orders",
      label: isAr ? "الطلبات والمدفوعات" : "Orders & Checkout",
      icon: CreditCard,
      description: isAr ? "طرق الدفع والشحن والفواتير" : "Payments, shipping & invoice",
    },
    {
      id: "notifications",
      label: isAr ? "الإشعارات" : "Notifications",
      icon: Bell,
      description: isAr ? "قوالب وتنبيهات الطلبات" : "Email templates & recipients",
    },
    {
      id: "account",
      label: isAr ? "الحساب والأمان" : "Account",
      icon: Shield,
      description: isAr ? "الباقة ومفاتيح المرور" : "Plan, passkeys & downloads",
    },
  ];

  // 5-column grid on phones (icon over label, no scroll rail); full cards from `sm` up.
  return (
    <div
      role="tablist"
      aria-label={isAr ? "أقسام الإعدادات" : "Settings sections"}
      className="grid grid-cols-5 gap-1 p-1.5 rounded-2xl border border-border bg-card shadow-xs sm:flex sm:items-center sm:gap-1.5"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            title={tab.description}
            onClick={() => onTabChange(tab.id)}
            className={`min-h-11 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl text-xs font-semibold transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-1 sm:flex-row sm:items-center sm:gap-2.5 sm:px-3 sm:py-2.5 sm:text-xs sm:text-start ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <div
              className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 max-w-full sm:flex-1">
              <div className="truncate">{tab.label}</div>
              <div
                className={`hidden sm:block text-xs font-normal truncate ${
                  isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                }`}
              >
                {tab.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="space-y-6">
      <SettingsTabBar activeTab={activeTab} onTabChange={onTabChange} />
      <div>
        {activeTab === "identity" && <IdentityTab />}
        {activeTab === "storefront" && <StorefrontTab />}
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "account" && <AccountTab />}
      </div>
    </div>
  );
}
