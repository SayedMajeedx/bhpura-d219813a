import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n";
import { logActivityBatch } from "@/lib/activity-log";
import type { Order, OrderItem as Item, OrderSnapshot } from "@/features/orders/types";
import {
  normalizeOrderMin,
  orderItemFromRow,
  orderTotals,
} from "@/features/orders/lib/order-editor";
import {
  haveOrderItemsChanged,
  orderChangeLogs,
  orderItemRow,
  orderSaveBlocker,
  orderSavePayload,
} from "@/features/orders/lib/order-save";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import {
  createOrderWithItems,
  invalidateOrders,
  replaceOrderItems,
  updateOrder,
} from "@/lib/data/orders";
import { catalogKeys } from "@/lib/data/catalog";
import { invalidateActivityLogs } from "@/lib/data/activity-logs";
import { getCurrentUser } from "@/lib/auth/session";

/** Saves the order editor: creates a new order with its lines, or updates the order, replaces changed lines and logs status/payment changes. */
export function useSaveOrder({
  appliedPromo,
  brandId,
  currency,
  id,
  initialSnapshotRef,
  isReadOnly,
  items,
  lang,
  order,
  orderQ,
  qc,
  router,
  setEditingUnlocked,
  setHasSavedDraft,
  setItems,
  setOrder,
  setSaving,
  slug,
  t,
  totals,
}: {
  appliedPromo: { code: string; id: string; amount: number } | null;
  brandId: string;
  currency: string;
  id: string;
  initialSnapshotRef: React.MutableRefObject<OrderSnapshot | null>;
  isReadOnly: boolean;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order | null;
  orderQ: OrderDetailData["orderQ"];
  qc: ReturnType<typeof useQueryClient>;
  router: ReturnType<typeof useRouter>;
  setEditingUnlocked: Dispatch<SetStateAction<boolean>>;
  setHasSavedDraft: Dispatch<SetStateAction<boolean>>;
  setItems: Dispatch<SetStateAction<OrderItem[]>>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  slug: string;
  t: ReturnType<typeof useT>;
  totals: ReturnType<typeof orderTotals>;
}) {
  const save = async () => {
    if (isReadOnly || !order) return;
    const saveBlocker = orderSaveBlocker(order, items, id, lang);
    if (saveBlocker) return toast.error(saveBlocker);
    setSaving(true);
    const user = await getCurrentUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const orderPayload = orderSavePayload(order, totals, appliedPromo, currency);

    if (id === "new") {
      for (const it of items) {
        const isCustom = it.location === "custom" || !it.variant_id;
        if (isCustom && !it.location) {
          it.location = "custom";
        }
      }
      let createdId: string;
      try {
        createdId = await createOrderWithItems(
          brandId,
          { ...orderPayload, user_id: user.id, brand_id: brandId, invoice_number: 0 },
          (orderId) =>
            items.map((item) =>
              orderItemRow(item, { user_id: user.id, brand_id: brandId, order_id: orderId }),
            ),
        );
      } catch (createError) {
        setSaving(false);
        return toast.error(
          (createError as { message?: string } | null)?.message || "ORDER_CREATE_FAILED",
        );
      }
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
      toast.success(lang === "ar" ? "تم إنشاء الطلب بنجاح" : "Order created successfully");
      initialSnapshotRef.current = null;
      setOrder(null);
      setItems([]);
      router.navigate({ to: "/admin/b/$slug/orders/$id", params: { slug, id: createdId } });
      return;
    }

    try {
      await updateOrder(brandId, order.id, orderPayload);
    } catch (oe) {
      setSaving(false);
      return toast.error((oe as { message?: string }).message);
    }

    // ── Activity log: detect changes vs saved state
    const prev = (orderQ.data ?? {}) as any;
    const logs = orderChangeLogs(prev, order, totals.advancePaid, currency);

    // Only update order_items if they actually changed
    const originalItems = (orderQ.data?.order_items ?? []) as any[];
    const itemsModified = haveOrderItemsChanged(originalItems, items);

    if (itemsModified) {
      const itemsPayload = items.map((i) =>
        orderItemRow(i, { user_id: user.id, brand_id: brandId, order_id: order.id }),
      );

      const repErr = await replaceOrderItems(order.id, itemsPayload).then(
        () => null,
        (error: { message?: string }) => error,
      );

      if (repErr) {
        setSaving(false);
        if (repErr.message?.includes("INSUFFICIENT_STOCK")) {
          return toast.error(t("orderDetail.insufficientStock"));
        }
        return toast.error(repErr.message);
      }
    }

    if (logs.length > 0) await logActivityBatch(logs);

    // Refetch fresh order from Supabase to sync local state and snapshot
    const refetched = await orderQ.refetch();
    const freshOrder = refetched.data ?? order;
    setOrder(freshOrder);

    const loadedItems: Item[] = (freshOrder.order_items ?? []).map(orderItemFromRow);
    setItems(loadedItems);

    initialSnapshotRef.current = {
      order: normalizeOrderMin(freshOrder),
      items: loadedItems,
    };

    toast.success(lang === "ar" ? "تم الحفظ بنجاح" : "Saved successfully");
    try {
      localStorage.removeItem(`boutq_draft_${brandId}_${id}`);
      localStorage.removeItem(`boutq_draft_${brandId}_new`);
    } catch {
      // ignore storage errors
    }
    setHasSavedDraft(true);
    setEditingUnlocked(false);
    setSaving(false);
    invalidateOrders(qc, brandId);
    // Saving lines moves stock.
    qc.invalidateQueries({ queryKey: catalogKeys.variants(brandId) });
    invalidateActivityLogs(qc);
  };

  return {
    save,
  };
}
