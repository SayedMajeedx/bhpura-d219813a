import { Users, Plus } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface TeamCommandHeaderProps {
  lang: "ar" | "en";
  memberCount: number;
  onAddMember: () => void;
}

export function TeamCommandHeader({ lang, memberCount, onAddMember }: TeamCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Users}
      title={isAr ? "أعضاء الفريق والصلاحيات" : "Team Members & Roles"}
      badges={<AdminPageCount>{countOf(memberCount, "member", isAr ? "ar" : "en")}</AdminPageCount>}
      description={
        isAr
          ? "إضافة موظفين جُدد، تخصيص الأدوار (مدير، موظف)، وتعيين صلاحيات المخزون والطلبات والبيانات المالية."
          : "Grant staff access, assign administrative roles, and scope granular permissions for inventory, orders, and P&L data."
      }
      actions={
        <AdminPageAction
          icon={Plus}
          label={isAr ? "إضافة عضو جديد" : "Add Team Member"}
          short={isAr ? "إضافة" : "Add"}
          onClick={onAddMember}
        />
      }
    />
  );
}
