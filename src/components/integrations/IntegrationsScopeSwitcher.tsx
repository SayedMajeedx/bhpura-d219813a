import {
  BarChart3,
  CreditCard,
  Mail,
  MoreHorizontal,
  Plug,
  Truck,
  KeyRound,
  Webhook,
  Activity,
  BookOpen,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type IntegrationsCategoryScope =
  | "all"
  | "connectors"
  | "api_keys"
  | "webhooks"
  | "api_logs"
  | "dev_docs"
  | "payments"
  | "shipping"
  | "email_ai"
  | "pixels";

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
  const scopes = [
    {
      id: "all",
      icon: Plug,
      ar: "جميع التكاملات",
      en: "All Integrations",
      badge: integrationCount,
    },
    { id: "payments", icon: CreditCard, ar: "بوابات الدفع", en: "Payment Gateways" },
    { id: "connectors", icon: Sparkles, ar: "الموصلات الجاهزة", en: "Connectors Hub" },
    { id: "api_keys", icon: KeyRound, ar: "مفاتيح API", en: "API Keys" },
    { id: "webhooks", icon: Webhook, ar: "خطافات الويب", en: "Webhooks" },
    { id: "api_logs", icon: Activity, ar: "سجل الطلبات", en: "API Logs" },
    { id: "dev_docs", icon: BookOpen, ar: "توثيق المطورين", en: "Developer Docs" },
    { id: "shipping", icon: Truck, ar: "شركات الشحن", en: "Logistics & Shipping" },
    { id: "email_ai", icon: Mail, ar: "البريد والذكاء الاصطناعي", en: "Email & AI Services" },
    { id: "pixels", icon: BarChart3, ar: "التتبع والتحليلات", en: "Tracking Pixels" },
  ] satisfies Array<{
    id: IntegrationsCategoryScope;
    icon: React.ElementType;
    ar: string;
    en: string;
    badge?: number;
  }>;

  const primary = scopes.slice(0, 2);
  const secondary = scopes.slice(2);
  const activeSecondary = secondary.find((scope) => scope.id === activeScope);

  const scopeButton = (scope: (typeof scopes)[number], mobile = false) => {
    const Icon = scope.icon;
    const isActive = activeScope === scope.id;
    return (
      <button
        key={scope.id}
        type="button"
        aria-pressed={isActive}
        onClick={() => onScopeChange(scope.id)}
        className={cn(
          "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          mobile ? "min-w-0 flex-1" : "whitespace-nowrap",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{isAr ? scope.ar : scope.en}</span>
        {scope.badge !== undefined && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
              isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {scope.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/40 p-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {primary.map((scope) => scopeButton(scope))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={isAr ? "المزيد من فئات التكامل" : "More integration categories"}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                activeSecondary
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              )}
            >
              {activeSecondary ? (
                <>
                  <activeSecondary.icon className="h-4 w-4" />
                  <span>{isAr ? activeSecondary.ar : activeSecondary.en}</span>
                </>
              ) : (
                <>
                  <MoreHorizontal className="h-4 w-4" />
                  <span>{isAr ? "المزيد" : "More"}</span>
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isAr ? "start" : "end"}>
            {secondary.map((scope) => (
              <DropdownMenuItem
                key={scope.id}
                onSelect={() => onScopeChange(scope.id)}
                className="min-h-11 gap-2"
              >
                <scope.icon className="h-4 w-4" />
                {isAr ? scope.ar : scope.en}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
