import { Users, Crown, AlertTriangle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export type CampaignSegment = "All" | "VIP" | "Churn Risk" | "New Buyer";

interface CampaignsScopeSwitcherProps {
  lang: "ar" | "en";
  activeSegment: CampaignSegment;
  onSegmentChange: (segment: CampaignSegment) => void;
  counts?: Record<CampaignSegment, number>;
}

export function CampaignsScopeSwitcher({
  lang,
  activeSegment,
  onSegmentChange,
  counts,
}: CampaignsScopeSwitcherProps) {
  const isAr = lang === "ar";

  const segments: {
    id: CampaignSegment;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
  }[] = [
    { id: "All", icon: Users, labelAr: "جميع العملاء", labelEn: "All Audience" },
    { id: "VIP", icon: Crown, labelAr: "العملاء المميزون (VIP)", labelEn: "VIP Spenders" },
    { id: "Churn Risk", icon: AlertTriangle, labelAr: "معرضون للتسرب", labelEn: "Churn Risk" },
    { id: "New Buyer", icon: UserPlus, labelAr: "مشترون جُدد", labelEn: "New Buyers" },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/40 border border-border/60 rounded-2xl scrollbar-none">
      {segments.map((s) => {
        const Icon = s.icon;
        const isActive = activeSegment === s.id;
        const count = counts?.[s.id];

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSegmentChange(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm scale-[1.01]"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? s.labelAr : s.labelEn}</span>
            {count !== undefined && (
              <span
                className={cn(
                  "ms-1 px-1.5 py-0.2 text-[10px] font-extrabold rounded-full",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
