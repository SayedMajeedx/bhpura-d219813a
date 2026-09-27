import { toast } from "sonner";
import { syncSingleExpenseToPackagingMaterial } from "@/lib/packaging-sync";

type Sync = typeof syncSingleExpenseToPackagingMaterial;

/**
 * Mirrors a saved expense to the packaging materials, and tells the merchant
 * when a packaging expense could not update them (the expense itself is saved).
 */
export async function syncExpensePackaging(
  supabase: Parameters<Sync>[0],
  brandId: string,
  expense: Parameters<Sync>[2],
  isAr: boolean,
): Promise<void> {
  if ((await syncSingleExpenseToPackagingMaterial(supabase, brandId, expense)) !== "failed") return;
  toast.warning(
    isAr
      ? "تم حفظ المصروف، لكن تعذر تحديث مواد التغليف في المخزون."
      : "Expense saved, but the packaging materials could not be updated.",
  );
}
