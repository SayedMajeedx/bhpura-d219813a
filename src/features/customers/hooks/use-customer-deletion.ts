import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteCustomers, invalidateCustomers } from "@/lib/data/customers";
import { useT } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";

/**
 * The customers list's selection and deletion: one customer from its row, or
 * the selected ones in bulk. Every delete is scoped to the brand passed.
 */
export function useCustomerDeletion({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleCustomer = (customerId: string) =>
    setSelectedCustomerIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });

  /** Selects the customers on the page, or clears them when all are already selected. */
  const toggleCustomers = (customerIds: string[]) =>
    setSelectedCustomerIds((current) => {
      const next = new Set(current);
      if (customerIds.every((id) => next.has(id))) customerIds.forEach((id) => next.delete(id));
      else customerIds.forEach((id) => next.add(id));
      return next;
    });

  /** Adds customers to the selection (the toolbar's "select all filtered"). */
  const selectCustomers = (customerIds: string[]) =>
    setSelectedCustomerIds((current) => new Set([...current, ...customerIds]));

  const clearSelection = () => setSelectedCustomerIds(new Set());

  const deleteCustomer = async (id: string) => {
    try {
      await deleteCustomers(brandId, [id]);
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
      return;
    }
    toast.success(t("common.delete"));
    void invalidateCustomers(qc, brandId);
  };

  const deleteSelectedCustomers = async () => {
    const ids = [...selectedCustomerIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      await deleteCustomers(brandId, ids);
      toast.success(isAr ? `تم حذف ${ids.length} عميل` : `${ids.length} customers deleted`);
      setSelectedCustomerIds(new Set());
      setBulkDeleteOpen(false);
      await invalidateCustomers(qc, brandId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر حذف العملاء"
            : "Could not delete customers",
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  return {
    selectedCustomerIds,
    toggleCustomer,
    toggleCustomers,
    selectCustomers,
    clearSelection,
    deleteCustomer,
    deleteSelectedCustomers,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkDeleting,
  };
}
