import { Award, Sparkles, Settings2 } from "lucide-react";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/lib/i18n";

interface LoyaltyCommandHeaderProps {
  onOpenSettings?: () => void;
  onOpenAdjust?: () => void;
  isEnabled: boolean;
}

export function LoyaltyCommandHeader({
  onOpenSettings,
  onOpenAdjust,
  isEnabled,
}: LoyaltyCommandHeaderProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Award}
      title={isAr ? "برنامج الولاء والمكافآت" : "Loyalty & Rewards"}
      badges={
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
            isEnabled
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          {isEnabled ? (isAr ? "مفعّل" : "Active") : isAr ? "معطّل" : "Disabled"}
        </span>
      }
      description={
        isAr
          ? "إدارة برامج النقاط، مستويات العضوية (VIP)، وسجل حركات واسترداد المكافآت."
          : "Manage customer reward points, VIP tier progression, and points ledger transactions."
      }
      actions={
        <>
          {onOpenAdjust && (
            <AdminPageAction
              icon={Sparkles}
              variant="outline"
              label={isAr ? "تعديل رصيد يدوي" : "Manual Adjustment"}
              iconOnPhone
              onClick={onOpenAdjust}
            />
          )}
          {onOpenSettings && (
            <AdminPageAction
              icon={Settings2}
              label={isAr ? "إعدادات البرنامج" : "Program Settings"}
              short={isAr ? "الإعدادات" : "Settings"}
              onClick={onOpenSettings}
            />
          )}
        </>
      }
    />
  );
}
