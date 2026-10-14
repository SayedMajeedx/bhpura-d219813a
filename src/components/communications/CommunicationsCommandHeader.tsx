import { Mail, Plus } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";

interface CommunicationsCommandHeaderProps {
  lang: "ar" | "en";
  recipientCount: number;
  onAddRecipient: () => void;
}

export function CommunicationsCommandHeader({
  lang,
  recipientCount,
  onAddRecipient,
}: CommunicationsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Mail}
      title={isAr ? "سجل المراسلات وتنبيهات الإدارة" : "Outbound Logs & Admin Alerts"}
      badges={
        <AdminPageCount>
          {recipientCount} {isAr ? "مستلمين" : "recipients"}
        </AdminPageCount>
      }
      description={
        isAr
          ? "إدارة مستلمي تنبيهات الطلبات والمدفوعات، ومتابعة سجل رسائل البريد الإلكتروني الصادرة."
          : "Manage operational alert recipients and audit outbound transactional email activity logs."
      }
      actions={
        <AdminPageAction
          icon={Plus}
          label={isAr ? "إضافة مستلم تنبيهات" : "Add Alert Recipient"}
          short={isAr ? "إضافة" : "Add"}
          onClick={onAddRecipient}
        />
      }
    />
  );
}
