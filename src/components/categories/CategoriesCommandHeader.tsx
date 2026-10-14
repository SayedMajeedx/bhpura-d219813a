import React from "react";
import { Boxes, Plus, FolderSync } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";

interface CategoriesCommandHeaderProps {
  lang: "en" | "ar";
  categoryCount: number;
  onCreateNew: () => void;
  onSyncVerticalDefaults?: () => void;
  isSyncingDefaults?: boolean;
}

export const CategoriesCommandHeader: React.FC<CategoriesCommandHeaderProps> = ({
  lang,
  categoryCount,
  onCreateNew,
  onSyncVerticalDefaults,
  isSyncingDefaults = false,
}) => {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Boxes}
      title={isAr ? "الأقسام والتصنيفات" : "Categories & Catalog Hierarchy"}
      badges={
        <AdminPageCount>
          {categoryCount} {isAr ? "قسم" : "categories"}
        </AdminPageCount>
      }
      description={
        isAr
          ? "تنظيم أقسام المتجر، الترتيب، وإدارة تصنيف المنتجات"
          : "Organize store categories, display order, and product catalog hierarchy."
      }
      actions={
        <>
          {onSyncVerticalDefaults && (
            <AdminPageAction
              icon={FolderSync}
              variant="outline"
              label={isAr ? "تهيئة أقسام النشاط" : "Sync Vertical Categories"}
              iconOnPhone
              busy={isSyncingDefaults}
              disabled={isSyncingDefaults}
              onClick={onSyncVerticalDefaults}
            />
          )}
          <AdminPageAction
            icon={Plus}
            label={isAr ? "قسم جديد" : "New Category"}
            onClick={onCreateNew}
          />
        </>
      }
    />
  );
};
