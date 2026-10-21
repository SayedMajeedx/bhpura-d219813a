import { ShoppingCart, Settings2 } from "lucide-react";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/lib/i18n";

interface AbandonedCartsCommandHeaderProps {
  onOpenSettings?: () => void;
  isEnabled: boolean;
}

export function AbandonedCartsCommandHeader({
  onOpenSettings,
  isEnabled,
}: AbandonedCartsCommandHeaderProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={ShoppingCart}
      title={isAr ? "السلات المتروكة والاستعادة" : "Abandoned Carts Recovery"}
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
          ? "السلات التي تُركت دون طلب. ترسل أنت التذكير عبر واتساب لمن وافق على ذلك، ولا يُرسل شيء تلقائياً."
          : "Carts left without an order. You send a WhatsApp reminder to shoppers who agreed to it; nothing is sent automatically."
      }
      actions={
        onOpenSettings && (
          <AdminPageAction
            icon={Settings2}
            label={isAr ? "إعدادات الاستعادة" : "Recovery Settings"}
            iconOnPhone
            onClick={onOpenSettings}
          />
        )
      }
    />
  );
}
