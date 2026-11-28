import { Mail, BellRing } from "lucide-react";
import { SegmentTab } from "@/components/ui/segment-tab";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK } from "@/components/ui/segmented";

/**
 * What the Sent messages page shows: the emails that went out, and the customer app's
 * notifications. Who gets the store's alerts, and what every message says, are set in one place,
 * Settings → Notifications (the page once listed the alert recipients a second time).
 */
export type CommunicationsScope = "logs" | "push";

interface CommunicationsScopeSwitcherProps {
  lang: "ar" | "en";
  activeScope: CommunicationsScope;
  onScopeChange: (scope: CommunicationsScope) => void;
}

export function CommunicationsScopeSwitcher({
  lang,
  activeScope,
  onScopeChange,
}: CommunicationsScopeSwitcherProps) {
  const isAr = lang === "ar";

  const scopes: {
    id: CommunicationsScope;
    icon: React.ElementType;
    labelAr: string;
    labelEn: string;
  }[] = [
    { id: "logs", icon: Mail, labelAr: "سجل الإيميلات المرسلة", labelEn: "Emails sent" },
    {
      id: "push",
      icon: BellRing,
      labelAr: "إشعارات تطبيق العملاء",
      labelEn: "Customer app notifications",
    },
  ];

  return (
    <div role="group" aria-label={isAr ? "ما أُرسل" : "What was sent"} className={SEGMENT_TRACK}>
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
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{isAr ? s.labelAr : s.labelEn}</span>
          </SegmentTab>
        );
      })}
    </div>
  );
}
