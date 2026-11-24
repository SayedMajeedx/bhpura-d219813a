import { Layout, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentCount } from "@/components/ui/segmented";
import { SegmentTab } from "@/components/ui/segment-tab";

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
    // The admin's one tab bar look (segmented.ts): equal halves on a phone, the labels' own
    // width from sm up.
    <div className={cn(SEGMENT_TRACK, "grid w-full grid-cols-2 sm:inline-flex sm:w-auto")}>
      <TabsPill />
      {scopes.map((s) => {
        const Icon = s.icon;
        const isActive = activeScope === s.id;

        return (
          <SegmentTab
            key={s.id}
            active={isActive}
            aria-pressed={isActive}
            onClick={() => onScopeChange(s.id)}
            className="min-w-0 whitespace-normal leading-tight sm:whitespace-nowrap"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{isAr ? s.labelAr : s.labelEn}</span>
            {s.badge !== undefined && <span className={segmentCount(isActive)}>{s.badge}</span>}
          </SegmentTab>
        );
      })}
    </div>
  );
}
