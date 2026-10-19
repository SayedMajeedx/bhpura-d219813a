import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createSupplierOrder,
  invalidateSupplierOrders,
  recordSupplierPayment,
  updateSupplierOrder,
} from "@/lib/data/supplier-orders";
import {
  emptyForm,
  formFigures,
  formKey,
  formProblems,
  formFromOrder,
  planSave,
  type FormProblem,
  type FormProduct,
  type SupplierOrderForm,
} from "../lib/order-form";
import { localToday, type SupplierOrder } from "../lib/order-state";
import { supplierOrderError } from "../lib/errors";
import type { SupplierCatalog } from "./use-supplier-catalog";

/**
 * The editor's state and its save. A new order is placed (or kept as a draft) with what was paid
 * up front; a saved one keeps its state, which the database writes.
 */
export function useSupplierOrderEditor({
  brandId,
  order,
  catalog,
  lang,
  onSaved,
}: {
  brandId: string;
  order: SupplierOrder | null;
  catalog: SupplierCatalog;
  lang: "ar" | "en";
  onSaved: (orderId: string) => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [form, setForm] = useState<SupplierOrderForm>(() =>
    order ? formFromOrder(order) : emptyForm(),
  );
  const [paidNow, setPaidNow] = useState("");
  const [shownProblems, setShownProblems] = useState<FormProblem[]>([]);
  const [saving, setSaving] = useState(false);
  const [paidProblem, setPaidProblem] = useState(false);
  const figures = useMemo(() => formFigures(form), [form]);

  const addProduct = (productId: string) => {
    const sizes = catalog.sizes.get(productId) ?? [];
    const cost = sizes.map((v) => catalog.shelf.get(v.id)?.cost ?? 0).find((c) => c > 0) ?? 0;
    const product: FormProduct = {
      key: formKey(),
      productId,
      // The cost it was last bought at, as a start: the supplier's price is usually the same.
      unitCost: cost > 0 ? String(cost) : "",
      sizes: Object.fromEntries(sizes.map((v) => [v.id, { quantity: "", received: 0 }])),
    };
    setForm((f) => ({ ...f, products: [...f.products, product] }));
  };

  const setProduct = (key: string, next: FormProduct) =>
    setForm((f) => ({ ...f, products: f.products.map((p) => (p.key === key ? next : p)) }));
  const removeProduct = (key: string) =>
    setForm((f) => ({ ...f, products: f.products.filter((p) => p.key !== key) }));

  const addCost = () =>
    setForm((f) => ({
      ...f,
      costs: [...f.costs, { key: formKey(), description: "", amount: "" }],
    }));
  const setCost = (key: string, patch: Partial<{ description: string; amount: string }>) =>
    setForm((f) => ({
      ...f,
      costs: f.costs.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  const removeCost = (key: string) =>
    setForm((f) => ({ ...f, costs: f.costs.filter((c) => c.key !== key) }));

  const save = async (place: boolean) => {
    const problems = formProblems(form);
    setShownProblems(problems);
    const paid = paidNow.trim() ? Number(paidNow) : 0;
    const paidProblem = !Number.isFinite(paid) || paid < 0 || paid > figures.total;
    setPaidProblem(paidProblem);
    if (problems.length > 0 || paidProblem) {
      toast.error(isAr ? "راجع الحقول المعلّمة." : "Check the marked fields.");
      return;
    }
    const plan = planSave(form, order?.items ?? [], {
      productName: (id) => catalog.productName(id),
      sizeName: (id) => catalog.sizeName(id),
    });
    setSaving(true);
    try {
      let id: string;
      if (order) {
        await updateSupplierOrder(brandId, order.id, plan);
        id = order.id;
      } else {
        id = await createSupplierOrder(brandId, plan, { place });
        if (paid > 0) {
          try {
            await recordSupplierPayment(id, {
              amount: paid,
              paidOn: localToday(),
              requestId: crypto.randomUUID(),
              note: isAr ? "دفعة مقدمة" : "Paid up front",
            });
          } catch {
            // The order is saved; only the payment is missing, and it can be recorded on it.
            toast.error(
              isAr
                ? "حُفظت الطلبية، لكن لم تُسجَّل الدفعة المقدمة. سجّلها من صفحة الطلبية."
                : "The order is saved, but the payment up front was not recorded. Record it on the order.",
            );
          }
        }
      }
      await invalidateSupplierOrders(qc, brandId);
      toast.success(isAr ? "حُفظت الطلبية" : "Order saved");
      onSaved(id);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  return {
    form,
    setForm,
    figures,
    paidNow,
    setPaidNow,
    paidProblem,
    problems: shownProblems,
    saving,
    addProduct,
    setProduct,
    removeProduct,
    addCost,
    setCost,
    removeCost,
    save,
  };
}
