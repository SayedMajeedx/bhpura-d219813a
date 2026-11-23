import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBenefitReceiptViewUrl } from "@/lib/benefit-receipt.functions";
import { ordersKeys, ordersQueries } from "@/lib/data/orders";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { catalogQueries } from "@/lib/data/catalog";
import { profilesQueries } from "@/lib/data/profiles";
import { customersQueries, type CustomerRow } from "@/lib/data/customers";
import { invalidateActivityLogs } from "@/lib/data/activity-logs";
import { branchesQueries } from "@/lib/data/branches";
import { alterationQueries } from "@/lib/data/orders/alterations";
import { workshopQueries } from "@/lib/data/supplier-orders/workshop";
import { incubatorsQueries } from "@/lib/data/incubators";
import { returnsQueries } from "@/lib/data/returns";

/** The customer picker lists customers by name; the shared list is newest first. */
const byName = (customers: CustomerRow[]) =>
  [...customers].sort((a, b) => a.name.localeCompare(b.name));

/**
 * Everything the order editor reads: the order (polled, plus realtime updates),
 * and for office staff the catalog, customers, addresses, branches,
 * customizations, packaging BOM and business settings. Couriers only load the
 * order, and only if it is assigned to them.
 */
export function useOrderDetailData({
  id,
  brandId,
  isCourier,
  isAdmin,
  canManageOrders = false,
}: {
  id: string;
  brandId: string;
  isCourier: boolean;
  isAdmin: boolean;
  /** The caller may handle orders: the alteration and workshop cards read their data. */
  canManageOrders?: boolean;
}) {
  const qc = useQueryClient();
  const orderQ = useQuery({
    ...ordersQueries.detail(brandId, id, isCourier ? "assigned-courier" : "office"),
    enabled: id !== "new",
  });

  // The cards under the order read by its id alone: start them with the order, not once it has
  // arrived and the page has drawn them (a second wave, about half a second later; the speed
  // review of 2026-11-22). The same queries the cards use, so they find their answer waiting.
  const canSend = isAdmin || canManageOrders;
  useEffect(() => {
    if (isCourier || id === "new" || !brandId) return;
    void qc.prefetchQuery(returnsQueries.forOrder(brandId, id));
    void qc.prefetchQuery(incubatorsQueries.orderPickups(brandId, id));
    if (!canSend) return;
    void qc.prefetchQuery(alterationQueries.forOrder(brandId, id));
    void qc.prefetchQuery(workshopQueries.orderPieces(brandId, id));
  }, [qc, brandId, id, isCourier, canSend]);

  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `order_id=eq.${id}` },
        () => void invalidateActivityLogs(qc),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Handled gracefully, Supabase will auto-reconnect
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc, brandId]);

  const productsQ = useQuery({
    ...catalogQueries.products(brandId),
    enabled: !isCourier && Boolean(brandId),
  });
  const variantsQ = useQuery({
    ...catalogQueries.variants(brandId),
    enabled: !isCourier && Boolean(brandId),
  });
  const bomItemsQ = useQuery({
    ...catalogQueries.bomItems(brandId),
    enabled: !isCourier && Boolean(brandId),
  });
  const packagingMaterialsQ = useQuery({
    ...catalogQueries.packagingMaterials(brandId),
    enabled: !isCourier && Boolean(brandId),
  });
  const customersQ = useQuery({
    ...customersQueries.list(brandId),
    enabled: !isCourier && Boolean(brandId),
    select: byName,
  });
  const couriersQ = useQuery({
    ...profilesQueries.couriers(brandId),
    enabled: isAdmin && Boolean(brandId),
  });
  const addressesQ = useQuery({
    ...customersQueries.addresses(brandId),
    enabled: !isCourier && Boolean(brandId),
  });

  const receiptViewQ = useQuery({
    queryKey: ["benefit-receipt-view", id, orderQ.data?.benefit_receipt_key],
    enabled:
      !isCourier &&
      Boolean(orderQ.data?.payment_method === "benefit" && orderQ.data?.benefit_receipt_key),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    queryFn: async () => getBenefitReceiptViewUrl({ data: { orderId: id } }),
    retry: false,
  });
  const branchesQ = useQuery({
    ...branchesQueries.list(brandId),
    enabled: !isCourier && Boolean(brandId),
  });
  const customQ = useQuery({
    ...catalogQueries.customizations(brandId),
    enabled: !isCourier && Boolean(brandId),
  });
  const settingsQ = useQuery({
    ...businessSettingsQueries.detail(brandId),
    enabled: !isCourier && Boolean(brandId),
  });

  return {
    orderQ,
    productsQ,
    variantsQ,
    bomItemsQ,
    packagingMaterialsQ,
    customersQ,
    couriersQ,
    addressesQ,
    receiptViewQ,
    branchesQ,
    customQ,
    settingsQ,
  };
}

export type OrderDetailData = ReturnType<typeof useOrderDetailData>;
