import { Plug, Plus } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface IntegrationsCommandHeaderProps {
  lang: "ar" | "en";
  integrationCount: number;
  onNewIntegration: () => void;
}

export function IntegrationsCommandHeader({
  lang,
  integrationCount,
  onNewIntegration,
}: IntegrationsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Plug}
      title={isAr ? "التكاملات وبوابات الربط" : "Integrations & API Keys"}
      badges={
        <AdminPageCount>
          {countOf(integrationCount, "integration", isAr ? "ar" : "en")}
        </AdminPageCount>
      }
      description={
        isAr
          ? "ربط بوابات الدفع الإلكتروني (بينفت، Tap)، الذكاء الاصطناعي، وبيكسلات التتبع."
          : "Connect payment gateways (BenefitPay, Tap), AI models, and tracking pixels."
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
