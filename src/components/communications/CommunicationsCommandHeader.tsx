import { Mail, Settings } from "lucide-react";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface CommunicationsCommandHeaderProps {
  lang: "ar" | "en";
  /** Opens Settings → Notifications, where messages and alert recipients are set. */
  onOpenSettings: () => void;
}

export function CommunicationsCommandHeader({
  lang,
  onOpenSettings,
}: CommunicationsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Mail}
      title={isAr ? "الرسائل المرسلة" : "Sent messages"}
      description={
        isAr
          ? "ما وصل عملاءك وفريقك من إيميلات، وإشعارات تطبيق العملاء. نصوص الرسائل ومن تصله التنبيهات في الإعدادات ← الإشعارات."
          : "The emails your customers and team were sent, and your customer app's notifications. What messages say and who gets alerts are in Settings → Notifications."
      }
      actions={
        <AdminPageAction
          icon={Settings}
          label={isAr ? "إعدادات الإشعارات" : "Notification settings"}
          short={isAr ? "الإعدادات" : "Settings"}
          onClick={onOpenSettings}
        />
      }
    />
  );
}
