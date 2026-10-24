import { Plus, Tag } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface DiscountsCommandHeaderProps {
  lang: "ar" | "en";
  promoCount: number;
  onCreateNew: () => void;
}

export function DiscountsCommandHeader({
  lang,
  promoCount,
  onCreateNew,
}: DiscountsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Tag}
      title={isAr ? "رموز الخصم والعروض" : "Discount Codes & Promotions"}
      badges={<AdminPageCount>{countOf(promoCount, "code", isAr ? "ar" : "en")}</AdminPageCount>}
      description={
        isAr
          ? "أنشئ رموز خصم مخصصة، وحدد شروط الأهلية، وجدولة المبيعات، والحد الأقصى للاستخدام."
          : "Create custom promo codes, set eligibility rules, schedules, and redemption caps."
      }
      actions={
        <AdminPageAction
          icon={Plus}
          label={isAr ? "إنشاء رمز خصم" : "Create Promo Code"}
          short={isAr ? "رمز جديد" : "New code"}
          onClick={onCreateNew}
        />
      }
    />
  );
}
