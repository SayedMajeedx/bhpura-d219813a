import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { SupportAccessCard } from "@/components/support-access-card";
import { PasskeySettings } from "@/components/passkey-settings";
import { SubscriptionCard } from "@/components/subscription-card";
import { MobileAppDownloadsCard } from "@/components/mobile/MobileAppDownloadsCard";

export function AccountTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();

  return (
    <div className="space-y-8">
      {/* 1. Subscription & Plan */}
      <section id="group-subscription" aria-label="Subscription Plan">
        <SubscriptionCard brand={brand as any} />
      </section>

      {/* 2. Platform Support Access */}
      <section id="group-support-access" aria-label="Support Access">
        <SupportAccessCard brand={brand as any} />
      </section>

      {/* 3. Passkey & Biometric Security */}
      <section id="group-security" aria-label="Passkey Security">
        <PasskeySettings />
      </section>

      {/* 4. Mobile App Downloads */}
      <section id="group-apps" aria-label="Mobile Apps">
        <MobileAppDownloadsCard brandSlug={brand.slug || ""} isAr={isAr} />
      </section>
    </div>
  );
}
