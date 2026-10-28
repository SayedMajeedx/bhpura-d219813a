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
  /** The button makes a promo code: it is offered on the codes view only. */
  onCreateNew?: () => void;
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
      title={isAr ? "الخصومات والعروض" : "Discounts & Offers"}
      badges={<AdminPageCount>{countOf(promoCount, "code", isAr ? "ar" : "en")}</AdminPageCount>}
      description={
        isAr
          ? "رموز خصم يكتبها المتسوق، وعروض تلقائية تُطبَّق على الطلبات: شروطها وجدولتها وحدود استخدامها."
          : "Promo codes shoppers type and offers applied automatically: their rules, schedules and limits."
      }
      actions={
        onCreateNew ? (
          <AdminPageAction
            icon={Plus}
            label={isAr ? "إنشاء رمز خصم" : "Create Promo Code"}
            short={isAr ? "رمز جديد" : "New code"}
            onClick={onCreateNew}
          />
        ) : undefined
      }
    />
  );
}
