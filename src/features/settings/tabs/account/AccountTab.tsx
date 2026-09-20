import { CreditCard, LifeBuoy, ShieldCheck, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { GroupNavigator, type GroupDef } from "@/features/settings/GroupNavigator";
import { SupportAccessCard } from "@/components/support-access-card";
import { PasskeySettings } from "@/components/passkey-settings";
import { SubscriptionCard } from "@/components/subscription-card";
import { MobileAppDownloadsCard } from "@/components/mobile/MobileAppDownloadsCard";

export function AccountTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();

  const groups: GroupDef[] = [
    {
      id: "subscription",
      icon: CreditCard,
      render: () => <SubscriptionCard brand={brand as any} />,
    },
    {
      id: "security",
      icon: ShieldCheck,
      render: () => (
        <div className="space-y-6">
          <PasskeySettings />
        </div>
      ),
    },
    {
      id: "support-access",
      label: { ar: "صلاحية الدعم الفني", en: "Support access" },
      icon: LifeBuoy,
      render: () => <SupportAccessCard brand={brand as any} />,
    },
    {
      id: "apps",
      icon: Smartphone,
      render: () => <MobileAppDownloadsCard brandSlug={brand.slug || ""} isAr={isAr} />,
    },
  ];

  return <GroupNavigator tab="account" groups={groups} />;
}
