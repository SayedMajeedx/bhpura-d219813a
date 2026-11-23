import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { type SettingsTabId } from "@/features/settings/registry";
import { IdentityTab } from "@/features/settings/tabs/identity/IdentityTab";
import { StorefrontTab } from "@/features/settings/tabs/storefront/StorefrontTab";
import { OrdersTab } from "@/features/settings/tabs/orders/OrdersTab";
import { NotificationsTab } from "@/features/settings/tabs/notifications/NotificationsTab";
import { AccountTab } from "@/features/settings/tabs/account/AccountTab";
import { Bell, CreditCard, Palette, Shield, Store } from "lucide-react";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentTab } from "@/components/ui/segmented";

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

  const tabListRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the active tab into center view on mobile navigation
  useEffect(() => {
    if (
      activeTabRef.current &&
      tabListRef.current &&
      typeof activeTabRef.current.scrollIntoView === "function"
    ) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab]);

  // The admin's one tab bar look (segmented.ts), scrolling sideways with whole labels when it does
  // not fit; each section's description is its tab's tooltip.
  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={isAr ? "أقسام الإعدادات" : "Settings sections"}
      className={`${SEGMENT_TRACK} scroll-smooth overscroll-contain`}
    >
      <TabsPill />
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            ref={isActive ? activeTabRef : undefined}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            title={tab.description}
            onClick={() => onTabChange(tab.id)}
            className={segmentTab(isActive)}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span>{tab.label}</span>
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
