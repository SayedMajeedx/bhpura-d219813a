import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { NotificationRecipientsEditor } from "@/features/settings/shared/NotificationRecipientsEditor";

export function RecipientsGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { brandId } = useBrandSettingsFormContext();

  return (
    <div className="space-y-4">
      <NotificationRecipientsEditor brandId={brandId} isAr={isAr} />
    </div>
  );
}
