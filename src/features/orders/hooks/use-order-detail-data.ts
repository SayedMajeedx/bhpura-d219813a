import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBenefitReceiptViewUrl } from "@/lib/benefit-receipt.functions";
import { queryKeys } from "@/lib/query-keys";
import type { Order, SavedAddress } from "@/features/orders/types";

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
}: {
  id: string;
  brandId: string;
  isCourier: boolean;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const orderQ = useQuery({
    queryKey: ["order", id, isCourier ? "assigned-courier" : "office"],
    // A courier can be working from a phone with an intermittent realtime
    // socket. Keep both courier and office views synchronized regardless.
    refetchInterval: isCourier ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
    enabled: id !== "new",
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "*, customers(*), order_items(*), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*)",
        )
        .eq("id", id);
      if (isCourier) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        query = (query as any).eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Order not found. It may have been deleted.");
      return data as Order;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["order", id] });
          void qc.invalidateQueries({ queryKey: ["orders", brandId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `order_id=eq.${id}` },
        () => void qc.invalidateQueries({ queryKey: ["activity_logs"] }),
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
    queryKey: queryKeys.products.all(brandId),
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("products").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const variantsQ = useQuery({
    queryKey: queryKeys.variants.all(brandId),
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("product_variants").select("*").eq("brand_id", brandId)).data ?? [],
  });
  const bomItemsQ = useQuery({
    queryKey: ["product-bom-items-all", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_bom_items")
        .select("product_id, packaging_material_id, quantity_per_unit")
        .eq("brand_id", brandId);
      if (error) return [];
      return (data ?? []) as any[];
    },
  });
  const packagingMaterialsQ = useQuery({
    queryKey: ["packaging-materials", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packaging_materials")
        .select("*")
        .eq("brand_id", brandId);
      if (error) return [];
      return (data ?? []) as any[];
    },
  });
  const customersQ = useQuery({
    queryKey: ["customers", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (await supabase.from("customers").select("*").eq("brand_id", brandId).order("name")).data ??
      [],
  });
  const couriersQ = useQuery({
    queryKey: ["couriers", brandId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .eq("role", "courier")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
  const addressesQ = useQuery({
    queryKey: ["customer_addresses", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as SavedAddress[];
    },
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
    queryKey: ["branches", brandId],
    enabled: !isCourier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name_ar, name_en, location_ar, location_en")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const customQ = useQuery({
    queryKey: ["customizations", brandId],
    enabled: !isCourier,
    queryFn: async () =>
      (
        await supabase
          .from("customization_options")
          .select("*")
          .eq("brand_id", brandId)
          .order("name")
      ).data ?? [],
  });
  const settingsQ = useQuery({
    queryKey: queryKeys.brand.businessSettings(brandId),
    enabled: !isCourier,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      return data;
    },
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
