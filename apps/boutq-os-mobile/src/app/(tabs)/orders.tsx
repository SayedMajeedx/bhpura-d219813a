import React, { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { AppTopBar } from "@/components/topbar";
import { EmptyState, SearchInput, SegmentedControl, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatTimeAgo } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius, shadow } from "@/theme";

type OrderRow = {
  id: string;
  invoice_number: number;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  fulfillment_method: string;
  total: number;
  currency: string;
  created_at: string;
};

type OrderFilter = "all" | "needs_action" | "delivery_ready" | "completed" | "cancelled";

export default function OrdersScreen() {
  const { activeBrandId, isCourier, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!activeBrandId) return;

    let query = supabase
      .from("orders")
      .select(
        "id,invoice_number,customer_name_snapshot,customer_phone_snapshot,status,payment_status,fulfillment_status,fulfillment_method,total,currency,created_at",
      )
      .eq("brand_id", activeBrandId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (isCourier) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        query = query.eq("assigned_to", user.id).eq("fulfillment_method", "delivery");
      }
    }

    const { data } = await query;
    setRows((data ?? []) as OrderRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [activeBrandId, isCourier]);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
    }, [loadOrders]),
  );

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    // 1. Text Search
    if (needle) {
      const matchInvoice = String(row.invoice_number).includes(needle);
      const matchName = (row.customer_name_snapshot ?? "").toLowerCase().includes(needle);
      const matchPhone = (row.customer_phone_snapshot ?? "").includes(needle);
      if (!matchInvoice && !matchName && !matchPhone) return false;
    }

    // 2. Status Segment Filter
    const s = (row.status || "").toLowerCase();
    const f = (row.fulfillment_status || "").toLowerCase();

    if (filter === "needs_action") {
      return (
        ["pending", "confirmed", "processing", "draft"].includes(s) ||
        ["pending", "packing"].includes(f)
      );
    }
    if (filter === "delivery_ready") {
      return (
        ["ready_for_delivery", "ready_for_pickup", "out_for_delivery", "shipped"].includes(f) ||
        ["ready_for_delivery", "ready_for_pickup"].includes(s)
      );
    }
    if (filter === "completed") {
      return ["completed", "delivered"].includes(s) || ["completed", "delivered"].includes(f);
    }
    if (filter === "cancelled") {
      return s === "cancelled" || f === "cancelled";
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <AppTopBar title={t("nav.orders")} />

      <View style={styles.filterSection}>
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("orders.searchPh")}
        />

        <SegmentedControl
          options={[
            { label: t("orders.tabAll"), value: "all" },
            { label: t("orders.tabAction"), value: "needs_action" },
            { label: t("orders.tabDelivery"), value: "delivery_ready" },
            { label: t("orders.tabCompleted"), value: "completed" },
            { label: t("orders.tabCancelled"), value: "cancelled" },
          ]}
          value={filter}
          onChange={(val) => setFilter(val as OrderFilter)}
        />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadOrders();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("orders.noMatch")}
              description={
                isAr
                  ? "لا توجد طلبات تطابق معايير البحث المحددة حالياً."
                  : "No orders match the selected filters."
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/order/${item.id}`)}
              style={({ pressed }) => [styles.cardWrapper, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.invoiceBlock}>
                    <Text style={styles.invoiceText}>#{item.invoice_number}</Text>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {item.customer_name_snapshot || (isAr ? "عميل زائر" : "Guest Customer")}
                    </Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <StatusPill status={item.status} />
                  </View>
                </View>

                {item.customer_phone_snapshot ? (
                  <Text style={styles.phoneText}>
                    📞 {item.customer_phone_snapshot}
                  </Text>
                ) : null}

                <View style={styles.cardFooter}>
                  <View style={styles.metaRow}>
                    <Text style={styles.timeText}>{formatTimeAgo(item.created_at)}</Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.fulfillmentText}>
                      {item.fulfillment_method === "delivery"
                        ? (isAr ? "🚗 توصيل" : "🚗 Delivery")
                        : (isAr ? "🛍️ استلام" : "🛍️ Pickup")}
                    </Text>
                  </View>

                  <Text style={styles.amountText}>
                    {formatMoney(item.total, item.currency || currency)}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  cardWrapper: {
    ...shadow.card,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  invoiceBlock: {
    flex: 1,
    marginRight: 8,
  },
  invoiceText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  customerName: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  phoneText: {
    fontSize: 12,
    color: colors.primary,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 4,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  dot: {
    fontSize: 12,
    color: colors.border,
  },
  fulfillmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  amountText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
});
