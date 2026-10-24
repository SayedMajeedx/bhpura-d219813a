import { Layout, Plus, Save } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface PagesCommandHeaderProps {
  lang: "ar" | "en";
  pageCount: number;
  saving: boolean;
  /** Something on the screen is not saved yet. */
  dirty?: boolean;
  onAddPage: () => void;
  onSave: () => void;
}

export function PagesCommandHeader({
  lang,
  pageCount,
  saving,
  dirty = false,
  onAddPage,
  onSave,
}: PagesCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Layout}
      title={isAr ? "الصفحات التعريفية والسياسات" : "Pages & Policy Management"}
      badges={<AdminPageCount>{countOf(pageCount, "page", isAr ? "ar" : "en")}</AdminPageCount>}
      description={
        isAr
          ? "إنشاء وترتيب الصفحات التعريفية (عن المتجر، الشروط، الأسئلة الشائعة)، وحسابات التواصل الاجتماعي."
          : "Design and organize custom storefront pages (About Us, Policies, FAQs), SEO tags, and social profiles."
      }
      actions={
        <>
          <AdminPageAction
            icon={Plus}
            variant="outline"
            label={isAr ? "إضافة صفحة" : "Add Page"}
            iconOnPhone
            onClick={onAddPage}
          />
          <AdminPageAction
            icon={Save}
            busy={saving}
            disabled={saving || !dirty}
            label={
              saving
                ? isAr
                  ? "جاري الحفظ..."
                  : "Saving..."
                : dirty
                  ? isAr
                    ? "حفظ التغييرات"
                    : "Save Changes"
                  : isAr
                    ? "كل التغييرات محفوظة"
                    : "All changes saved"
            }
            short={
              saving
                ? isAr
                  ? "حفظ..."
                  : "Saving"
                : dirty
                  ? isAr
                    ? "حفظ"
                    : "Save"
                  : isAr
                    ? "محفوظ"
                    : "Saved"
            }
            onClick={onSave}
          />
        </>
      }
    />
  );
}
