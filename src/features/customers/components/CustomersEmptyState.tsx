import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OsEmptyState } from "@/components/os/os-empty-state";

/** Shown when no customer matches: add the first customer, or clear the filters. */
export function CustomersEmptyState({
  customerCount,
  isAr,
  onAddCustomer,
  onClearFilters,
}: {
  customerCount: number;
  isAr: boolean;
  onAddCustomer: () => void;
  onClearFilters: () => void;
}) {
  return (
    <OsEmptyState
      icon={Users}
      compact
      title={isAr ? "لا يوجد عملاء مطابقون" : "No matching customers"}
      description={
        customerCount === 0
          ? isAr
            ? "ابدأ بإضافة أول عميل إلى قاعدة بيانات المتجر."
            : "Add the first customer to your store database."
          : isAr
            ? "غيّر البحث أو الفلاتر لعرض عملاء آخرين."
            : "Change the search or filters to see other customers."
      }
      action={
        <Button type="button" onClick={customerCount === 0 ? onAddCustomer : onClearFilters}>
          {customerCount === 0
            ? isAr
              ? "إضافة عميل"
              : "Add Customer"
            : isAr
              ? "مسح الفلاتر"
              : "Clear Filters"}
        </Button>
      }
    />
  );
}
