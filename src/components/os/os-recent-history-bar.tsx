import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { History, Pin, PinOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRecentModules,
  recordVisitedModule,
  type RecentModule,
} from "@/lib/os-productivity";

interface OsRecentHistoryBarProps {
  lang: "ar" | "en";
  currentPageTitle?: string;
}

export function OsRecentHistoryBar({ lang, currentPageTitle }: OsRecentHistoryBarProps) {
  const isAr = lang === "ar";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [recents, setRecents] = useState<RecentModule[]>([]);

  useEffect(() => {
    if (currentPageTitle && pathname) {
      recordVisitedModule({
        path: pathname,
        titleEn: currentPageTitle,
        titleAr: currentPageTitle,
      });
      setRecents(getRecentModules());
    }
  }, [pathname, currentPageTitle]);

  if (recents.length <= 1) return null;

  return (
    <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-muted/30 border-b border-border/40 text-xs shrink-0 select-none">
      <div className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground me-1 shrink-0">
        <Clock className="h-3 w-3 text-primary" />
        <span>{isAr ? "المرارة مؤخراً:" : "Recents:"}</span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
        {recents.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path as any}
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 whitespace-nowrap",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/20 font-bold"
                  : "bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground border border-border/40 shadow-2xs",
              )}
            >
              {isAr ? item.titleAr : item.titleEn}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
