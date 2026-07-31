import { Plug, CreditCard, Truck, Mail, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntegrationsCategoryScope = "all" | "payments" | "shipping" | "email_ai" | "pixels";

interface IntegrationsScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: IntegrationsCategoryScope;
  onScopeChange: (scope: IntegrationsCategoryScope) => void;
  integrationCount: number;
}

export function IntegrationsScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  integrationCount,
}: IntegrationsScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: IntegrationsCategoryScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
    badge?: number;
  }[] = [
    {
      id: "all",
      icon: Plug,
      labelAr: "جميع التكاملات",
      labelEn: "All Integrations",
      badge: integrationCount,
    },
    {
      id: "payments",
      icon: CreditCard,
      labelAr: "بوابات الدفع",
      labelEn: "Payment Gateways",
    },
    {
      id: "shipping",
      icon: Truck,
      labelAr: "شركات الشحن",
      labelEn: "Logistics & Shipping",
    },
    {
      id: "email_ai",
      icon: Mail,
      labelAr: "البريد والذكاء الاصطناعي",
      labelEn: "Email & AI Services",
    },
    {
      id: "pixels",
      icon: BarChart3,
      labelAr: "بيكسلات التتبع والتحليلات",
      labelEn: "Tracking Pixels",
    },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-2xl scrollbar-none">
      {scopes.map((s) => {
        const Icon = s.icon;
        const isActive = activeScope === s.id;

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onScopeChange(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? s.labelAr : s.labelEn}</span>
            {s.badge !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {s.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
