import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { TeamPageState } from "@/features/team/hooks/use-team-page";

/** Asks before a member is removed. */
export function DeleteStaffDialog({ page }: { page: TeamPageState }) {
  const { t, isAr, deleteConfirm, setDeleteConfirm, handleDelete } = page;
  return (
    <>
      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "حذف المستخدم" : "Delete User"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <>
                  {isAr ? (
                    <>
                      هل أنت متأكد من إزالة صلاحية الفريق عن{" "}
                      <strong>{deleteConfirm.name || deleteConfirm.email}</strong>؟
                      <br />
                      إذا كان لديه حساب عميل فسيتم الاحتفاظ بملفه وكلمة مروره وطلباته وعناوينه.
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete{" "}
                      <strong>{deleteConfirm.name || deleteConfirm.email}</strong>?
                      <br />
                      Team access will be removed. If this person also has a customer account, their
                      password, orders, addresses, and customer data will be preserved.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
