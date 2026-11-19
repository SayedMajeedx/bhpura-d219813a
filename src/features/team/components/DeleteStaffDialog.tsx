import { AppConfirm } from "@/components/ui/app-confirm";
import type { TeamPageState } from "@/features/team/hooks/use-team-page";

/** Asks before a member is removed. */
export function DeleteStaffDialog({ page }: { page: TeamPageState }) {
  const { t, isAr, deleteConfirm, setDeleteConfirm, handleDelete } = page;
  const who = deleteConfirm?.name || deleteConfirm?.email || "";
  return (
    <AppConfirm
      open={!!deleteConfirm}
      onOpenChange={(open) => !open && setDeleteConfirm(null)}
      title={isAr ? "حذف المستخدم" : "Delete User"}
      description={
        isAr ? (
          <>
            هل أنت متأكد من إزالة صلاحية الفريق عن <bdi className="font-semibold">{who}</bdi>؟ إذا
            كان لديه حساب عميل فسيتم الاحتفاظ بملفه وكلمة مروره وطلباته وعناوينه.
          </>
        ) : (
          <>
            Are you sure you want to delete <bdi className="font-semibold">{who}</bdi>? Team access
            will be removed. If this person also has a customer account, their password, orders,
            addresses, and customer data will be preserved.
          </>
        )
      }
      destructive
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
    />
  );
}
