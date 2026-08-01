import { useRef, useEffect } from "react";
import {
  Building2,
  Receipt,
  Store,
  Truck,
  CreditCard,
  MapPin,
  Mail,
  ShieldCheck,
  CreditCard as LicenseIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTabId =
  | "business"
  | "invoice"
  | "storefront"
  | "checkout"
  | "payments"
  | "branches"
  | "emails"
  | "security"
  | "subscription";

interface SettingsScopeSwitcherProps {
  lang: "ar" | "en";
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

export function SettingsScopeSwitcher({
  lang,
  activeTab,
  onTabChange,
}: SettingsScopeSwitcherProps) {
  const isAr = lang === "ar";

  const tabs: {
    id: SettingsTabId;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
  }[] = [
    { id: "business", icon: Building2, labelAr: "الملف التجاري", labelEn: "Business Profile" },
    { id: "invoice", icon: Receipt, labelAr: "الفاتورة والطباعة", labelEn: "Invoicing" },
    { id: "storefront", icon: Store, labelAr: "واجهة المتجر", labelEn: "Storefront SEO" },
    { id: "checkout", icon: Truck, labelAr: "الشحن والتسليم", labelEn: "Fulfillment" },
    { id: "payments", icon: CreditCard, labelAr: "طرق الدفع", labelEn: "Payments" },
    { id: "branches", icon: MapPin, labelAr: "الفروع والمواقع", labelEn: "Branches" },
    { id: "emails", icon: Mail, labelAr: "الإشعارات والبريد", labelEn: "Notifications" },
    { id: "security", icon: ShieldCheck, labelAr: "الأمان والبصمة", labelEn: "Security" },
    {
      id: "subscription",
      icon: LicenseIcon,
      labelAr: "الاشتراك والترخيص",
      labelEn: "Subscription",
    },
  ];

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector<HTMLElement>("[data-active='true']");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-2xl no-scrollbar [scrollbar-width:none] [::-webkit-scrollbar]:hidden [-ms-overflow-style:none] snap-x snap-mandatory select-none"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            data-active={isActive ? "true" : "false"}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0 snap-start outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? tab.labelAr : tab.labelEn}</span>
          </button>
        );
      })}
    </div>
  );
}
