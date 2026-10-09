import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FooterVariant } from "@/lib/storefront-engine";

export type FooterTitles = { companyEn: string; companyAr: string; helpEn: string; helpAr: string };

type Props = {
  lang: "ar" | "en";
  titles: FooterTitles;
  onChange: (patch: Partial<FooterTitles>) => void;
  /** Which footer the storefront really renders, from the store's engine and footer layout. */
  footerVariant: FooterVariant;
  companyCount: number;
  helpCount: number;
};

/** The two footer group headings, and how the storefront's footer shows them. */
export function FooterGroupTitlesCard({
  lang,
  titles,
  onChange,
  footerVariant,
  companyCount,
  helpCount,
}: Props) {
  const isAr = lang === "ar";
  const columns = footerVariant === "columns";
  const field = (
    label: string,
    value: string,
    placeholder: string,
    dir: "rtl" | "ltr",
    key: keyof FooterTitles,
  ) => (
    <div>
      <Label className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange({ [key]: e.target.value })}
        placeholder={placeholder}
        dir={dir}
      />
    </div>
  );

  return (
    <Card className="space-y-4 overflow-hidden rounded-2xl border-border-subtle bg-card p-4 shadow-md">
      <div>
        <h3 className="text-base font-bold">
          {isAr ? "عناوين مجموعات روابط التذييل" : "Footer link group headings"}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {columns
            ? isAr
              ? "متجرك يستخدم تذييل الأعمدة: تظهر مجموعة الشركة كعمود (عند وجود صفحات فيها) والمساعدة كعمود، وعلى الجوال كقوائم قابلة للطي."
              : "Your store uses the columns footer: the company group is a column (when it has pages), help is a column, and on phones both fold into accordions."
            : isAr
              ? "متجرك يستخدم التذييل البسيط: تظهر المجموعتان كقوائم قابلة للطي على الجوال."
              : "Your store uses the simple footer: both groups show as accordions on phones."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? `${companyCount} صفحة في الشركة · ${helpCount} صفحة في المساعدة`
            : `${companyCount} page(s) in the company group · ${helpCount} in help`}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field(
          isAr ? "عنوان مجموعة الشركة — بالعربية" : "Company group title (Arabic)",
          titles.companyAr,
          "الشركة",
          "rtl",
          "companyAr",
        )}
        {field(
          isAr ? "عنوان مجموعة الشركة — English" : "Company group title (English)",
          titles.companyEn,
          "Company",
          "ltr",
          "companyEn",
        )}
        {field(
          isAr ? "عنوان مجموعة المساعدة — بالعربية" : "Help group title (Arabic)",
          titles.helpAr,
          "المساعدة",
          "rtl",
          "helpAr",
        )}
        {field(
          isAr ? "عنوان مجموعة المساعدة — English" : "Help group title (English)",
          titles.helpEn,
          "Help",
          "ltr",
          "helpEn",
        )}
      </div>
    </Card>
  );
}
