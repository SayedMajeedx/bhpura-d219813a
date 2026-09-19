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

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
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

  return (
    <div className="space-y-6">
      {/* 5 Tab Navigation Bar */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl border border-border bg-card shadow-xs overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 min-w-[140px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-start select-none ${
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
              <div className="min-w-0 flex-1 truncate">
                <div className="truncate">{tab.label}</div>
                <div
                  className={`text-[10px] font-normal truncate ${
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

      {/* Tab Panels */}
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
