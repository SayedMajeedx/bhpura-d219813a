import { Users, Crown, AlertTriangle, UserPlus } from "lucide-react";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK, segmentCount, segmentTab } from "@/components/ui/segmented";

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
    <div
      role="group"
      aria-label={isAr ? "جمهور الحملة" : "Campaign audience"}
      className={SEGMENT_TRACK}
    >
      <TabsPill />
      {segments.map((s) => {
        const Icon = s.icon;
        const isActive = activeSegment === s.id;
        const count = counts?.[s.id];

        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSegmentChange(s.id)}
            className={segmentTab(isActive)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? s.labelAr : s.labelEn}</span>
            {count !== undefined && <span className={segmentCount(isActive)}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
