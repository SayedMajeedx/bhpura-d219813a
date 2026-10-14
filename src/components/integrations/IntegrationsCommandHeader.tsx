import { Plug, Plus } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";

interface IntegrationsCommandHeaderProps {
  lang: "ar" | "en";
  integrationCount: number;
  onNewIntegration: () => void;
  /** The store ships goods (couriers can be connected). */
  shipping?: boolean;
}

export function IntegrationsCommandHeader({
  lang,
  integrationCount,
  onNewIntegration,
  shipping = true,
}: IntegrationsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Plug}
      title={isAr ? "التكاملات وبوابات الربط" : "Integrations & API Keys"}
      badges={
        <AdminPageCount>
          {integrationCount} {isAr ? "تكاملات" : "integrations"}
        </AdminPageCount>
      }
      description={
        isAr
          ? shipping
            ? "ربط بوابات الدفع الإلكتروني (بينفت، Tap، Stripe)، شركات الشحن (أرامكس)، الذكاء الاصطناعي، وبيكسلات التتبع."
            : "ربط بوابات الدفع الإلكتروني (بينفت، Tap، Stripe)، الذكاء الاصطناعي، وبيكسلات التتبع."
          : shipping
            ? "Connect payment gateways (BenefitPay, Tap, Stripe), shipping couriers (Aramex), AI models, and tracking pixels."
            : "Connect payment gateways (BenefitPay, Tap, Stripe), AI models, and tracking pixels."
      }
      actions={
        <AdminPageAction
          icon={Plus}
          label={isAr ? "إضافة ربط جديد" : "Add Integration"}
          short={isAr ? "ربط جديد" : "Add"}
          onClick={onNewIntegration}
        />
      }
    />
  );
}
