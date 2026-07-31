import { Layout, Share2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PagesScope = "pages" | "socials";

interface PagesScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: PagesScope;
  onScopeChange: (scope: PagesScope) => void;
  pageCount: number;
}

export function PagesScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
  pageCount,
}: PagesScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: PagesScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
    badge?: number;
  }[] = [
    {
      id: "pages",
      icon: Layout,
      labelAr: "صفحات المتجر والسياسات",
      labelEn: "Storefront Pages & Policies",
      badge: pageCount,
    },
    {
      id: "socials",
      icon: Share2,
      labelAr: "حسابات التواصل والواتساب",
      labelEn: "Social Links & WhatsApp Widget",
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
