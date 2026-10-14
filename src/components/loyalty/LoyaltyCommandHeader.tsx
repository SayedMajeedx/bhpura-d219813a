import { Award, Sparkles, Settings2 } from "lucide-react";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/lib/i18n";
import type { LoyaltyProgramState } from "@/lib/loyalty-program";

interface LoyaltyCommandHeaderProps {
  onOpenSettings?: () => void;
  onOpenAdjust?: () => void;
  state: LoyaltyProgramState;
}

export function LoyaltyCommandHeader({
  onOpenSettings,
  onOpenAdjust,
  state,
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
            state === "on"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : state === "not_set_up"
                ? "bg-warning/10 text-warning border-warning/30"
                : "bg-muted text-muted-foreground border-border"
          }`}
        >
          {state === "on"
            ? isAr
              ? "مفعّل"
              : "Active"
            : state === "not_set_up"
              ? isAr
                ? "غير مُعدّ"
                : "Not set up"
              : isAr
                ? "متوقف"
                : "Off"}
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
