import React, { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { AppTopBar } from "@/components/topbar";
import {
  BrandAvatar,
  Card,
  EmptyState,
  MetricCard,
  ModalSheet,
  SegmentedControl,
  StatusPill,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatTimeAgo } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius, shadow } from "@/theme";

type OrderRow = {
  id: string;
  invoice_number: number;
  customer_name_snapshot: string | null;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  fulfillment_method: string;
  total: number;
  currency: string;
  created_at: string;
};

type DashboardMetrics = {
  todaySales: number;
  todayOrdersCount: number;
  pendingActionCount: number;
  readyForDeliveryCount: number;
  lowStockCount: number;
};

export function DashboardScreen() {
  const {
    profile,
    brands,
    activeBrand,
    activeBrandId,
    setActiveBrandId,
    currency,
    canViewFinancials,
  } = useAuth();
  const { t, isAr } = useI18n();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todaySales: 0,
    todayOrdersCount: 0,
    pendingActionCount: 0,
    readyForDeliveryCount: 0,
    lowStockCount: 0,
  });
  const [scope, setScope] = useState<"overview" | "operations" | "financials">("overview");
  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeBrandId) return;
    setError(null);

    try {
      // 1. Fetch recent 20 orders
      const { data: recentOrders, error: ordersError } = await supabase
        .from("orders")
        .select(
          "id,invoice_number,customer_name_snapshot,status,payment_status,fulfillment_status,fulfillment_method,total,currency,created_at",
        )
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (ordersError) throw ordersError;
      const orderList = (recentOrders ?? []) as OrderRow[];
      setOrders(orderList);

      // 2. Fetch today's date boundary
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: todayOrders } = await supabase
        .from("orders")
        .select("total, status, payment_status")
        .eq("brand_id", activeBrandId)
        .gte("created_at", startOfDay.toISOString());

      const todayList = todayOrders ?? [];
      const todaySales = todayList
        .filter(
          (o) =>
            o.payment_status === "paid" || o.status === "completed" || o.status === "delivered",
        )
        .reduce((sum, o) => sum + Number(o.total || 0), 0);

      // 3. Count Pending Action orders
      const { count: pendingActionCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", activeBrandId)
        .in("status", ["draft", "confirmed", "processing", "in_tailoring", "pending"]);

      // 4. Count Ready For Delivery orders
      const { count: readyForDeliveryCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", activeBrandId)
        .or("fulfillment_status.eq.ready_for_delivery,status.eq.ready_for_delivery");

      // 5. Count Low Stock variants (stock <= 5)
      const { count: lowStockCount } = await supabase
        .from("product_variants")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", activeBrandId)
        .lte("stock", 5);

      setMetrics({
        todaySales,
        todayOrdersCount: todayList.length,
        pendingActionCount: pendingActionCount ?? 0,
        readyForDeliveryCount: readyForDeliveryCount ?? 0,
        lowStockCount: lowStockCount ?? 0,
      });
    } catch (err: any) {
      console.error("Failed to load dashboard data:", err);
      setError(err?.message || (isAr ? "تعذر تحميل البيانات" : "Failed to load data"));
    } finally {
      setRefreshing(false);
    }
  }, [activeBrandId, isAr]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <AppTopBar
        showBrandSwitcher={true}
        onOpenBrandSwitcher={() => setBrandModalVisible(true)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Scope Switcher */}
        <SegmentedControl
          options={[
            { label: t("dashboard.scopeAll"), value: "overview" },
            { label: t("dashboard.scopeOperations"), value: "operations" },
            { label: t("dashboard.scopeFinancials"), value: "financials" },
          ]}
          value={scope}
          onChange={(val) => setScope(val as any)}
        />

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {/* 1. Overview KPIs */}
        {scope === "overview" && (
          <View style={styles.kpiGrid}>
            {canViewFinancials ? (
              <MetricCard
                label={t("dashboard.todaySales")}
                value={formatMoney(metrics.todaySales, currency)}
                tone="primary"
                subtext={`${metrics.todayOrdersCount} ${isAr ? "طلبات اليوم" : "orders today"}`}
              />
            ) : null}
            <MetricCard
              label={t("dashboard.pendingFulfillment")}
              value={String(metrics.pendingActionCount)}
              tone="warning"
              subtext={isAr ? "تتطلب تجهيز وخياطة" : "Needs tailoring / preparation"}
            />
            <MetricCard
              label={isAr ? "جاهزة للتوصيل والتسليم" : "Ready for Delivery"}
              value={String(metrics.readyForDeliveryCount)}
              tone="info"
              subtext={isAr ? "بانتظار المندوب أو الاستلام" : "Awaiting courier pickup"}
            />
            <MetricCard
              label={t("dashboard.lowStock")}
              value={String(metrics.lowStockCount)}
              tone="danger"
              subtext={isAr ? "قطع متبقية ≤ 5" : "Units remaining ≤ 5"}
            />
          </View>
        )}

        {/* 2. Operations KPIs */}
        {scope === "operations" && (
          <View style={styles.kpiGrid}>
            <MetricCard
              label={t("dashboard.pendingFulfillment")}
              value={String(metrics.pendingActionCount)}
              tone="warning"
              subtext={isAr ? "تتطلب تجهيز أو تفصيل" : "Requires preparation"}
            />
            <MetricCard
              label={isAr ? "جاهزة للشحن مع المندوب" : "Ready for Delivery"}
              value={String(metrics.readyForDeliveryCount)}
              tone="info"
              subtext={isAr ? "جاهزة للتسليم" : "Ready for dispatch"}
            />
            <MetricCard
              label={t("dashboard.lowStock")}
              value={String(metrics.lowStockCount)}
              tone="danger"
              subtext={isAr ? "تتطلب إعادة طلب وتوريد" : "Reorder required"}
            />
          </View>
        )}

        {/* 3. Financials KPIs */}
        {scope === "financials" && (
          <View style={styles.kpiGrid}>
            <MetricCard
              label={t("dashboard.todaySales")}
              value={formatMoney(metrics.todaySales, currency)}
              tone="primary"
              subtext={`${metrics.todayOrdersCount} ${isAr ? "طلبات اليوم" : "orders today"}`}
            />
            <MetricCard
              label={isAr ? "إجمالي مبيعات الفترة" : "Recent Orders Value"}
              value={formatMoney(
                orders.reduce((acc, o) => acc + Number(o.total || 0), 0),
                currency,
              )}
              tone="success"
              subtext={`${orders.length} ${isAr ? "طلب مسجل" : "orders listed"}`}
            />
          </View>
        )}

        {/* Quick Action Dock */}
        <Card style={styles.quickDock}>
          <Text style={styles.sectionHeaderTitle}>{t("dashboard.quickActions")}</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable
              onPress={() => router.push("/(tabs)/orders")}
              style={styles.quickActionItem}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.brandSoft }]}>
                <AppIcon name="receipt" size={20} color={colors.primary} />
              </View>
              <Text style={styles.quickActionLabel}>{t("nav.orders")}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(tabs)/inventory")}
              style={styles.quickActionItem}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.brandSoft }]}>
                <AppIcon name="cube" size={20} color={colors.primary} />
              </View>
              <Text style={styles.quickActionLabel}>{t("nav.inventory")}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(tabs)/customers")}
              style={styles.quickActionItem}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.brandSoft }]}>
                <AppIcon name="people" size={20} color={colors.primary} />
              </View>
              <Text style={styles.quickActionLabel}>{t("nav.customers")}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/more/reports")}
              style={styles.quickActionItem}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.brandSoft }]}>
                <AppIcon name="bar-chart" size={20} color={colors.primary} />
              </View>
              <Text style={styles.quickActionLabel}>{t("nav.reports")}</Text>
            </Pressable>
          </View>
        </Card>

        {/* Urgent Action Banner */}
        {metrics.pendingActionCount > 0 && (
          <Pressable
            onPress={() => router.push("/(tabs)/orders")}
            style={({ pressed }) => [styles.urgentBanner, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.urgentIcon}>
              <AppIcon name="alert-circle" size={20} color={colors.warning} />
            </View>
            <View style={styles.urgentTextWrapper}>
              <Text style={styles.urgentTitle}>
                {metrics.pendingActionCount} {isAr ? "طلبات تتطلب إجراء وتجهيز" : "orders need action"}
              </Text>
              <Text style={styles.urgentSubtitle}>
                {isAr ? "اضغط لعرض وفرز الطلبات المعلقة" : "Tap to view pending queue"}
              </Text>
            </View>
            <AppIcon
              name={isAr ? "chevron-back" : "chevron-forward"}
              size={18}
              color={colors.warning}
            />
          </Pressable>
        )}

        {/* Recent Orders List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("dashboard.recentOrders")}</Text>
          <Pressable onPress={() => router.push("/(tabs)/orders")}>
            <Text style={styles.viewAllText}>{t("common.all")} ({orders.length})</Text>
          </Pressable>
        </View>

        {orders.length === 0 ? (
          <EmptyState
            title={t("dashboard.noOrders")}
            description={
              isAr
                ? "ستظهر الطلبات الجديدة هنا فور تسجيلها عبر المتجر الإلكتروني أو الفروع."
                : "New orders will appear here automatically."
            }
          />
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() => router.push(`/order/${order.id}`)}
                style={({ pressed }) => [styles.orderCardWrapper, pressed && { opacity: 0.85 }]}
              >
                <Card style={styles.orderCard}>
                  <View style={styles.orderCardHeader}>
                    <View style={styles.orderNumberBlock}>
                      <Text style={styles.orderInvoiceText}>#{order.invoice_number}</Text>
                      <Text style={styles.orderCustomerText} numberOfLines={1}>
                        {order.customer_name_snapshot || (isAr ? "عميل زائر" : "Guest Customer")}
                      </Text>
                    </View>
                    <View style={styles.orderBadges}>
                      <StatusPill status={order.status} />
                    </View>
                  </View>

                  <View style={styles.orderCardFooter}>
                    <View style={styles.orderMetaRow}>
                      <Text style={styles.orderTimeText}>
                        {formatTimeAgo(order.created_at)}
                      </Text>
                      <Text style={styles.orderDot}>•</Text>
                      <Text style={styles.orderFulfillmentText}>
                        {order.fulfillment_method === "delivery"
                          ? (isAr ? "🚗 توصيل" : "🚗 Delivery")
                          : (isAr ? "🛍️ استلام" : "🛍️ Pickup")}
                      </Text>
                    </View>

                    <Text style={styles.orderAmountText}>
                      {formatMoney(order.total, order.currency || currency)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Brand Switcher Modal Sheet */}
      <ModalSheet
        visible={brandModalVisible}
        onClose={() => setBrandModalVisible(false)}
        title={isAr ? "اختر المتجر أو الفرع" : "Select Brand / Branch"}
      >
        <View style={styles.brandList}>
          {brands.map((b) => {
            const isSelected = b.id === activeBrandId;
            return (
              <Pressable
                key={b.id}
                onPress={() => {
                  setActiveBrandId(b.id);
                  setBrandModalVisible(false);
                }}
                style={[
                  styles.brandOption,
                  isSelected && styles.brandOptionSelected,
                ]}
              >
                <BrandAvatar
                  name={(isAr ? b.name_ar || b.name_en : b.name_en || b.name_ar) || "Brand"}
                  logoUrl={b.logo_url}
                  size={36}
                />
                <View style={styles.brandOptionText}>
                  <Text style={[styles.brandOptionName, isSelected && { color: colors.primary }]}>
                    {isAr ? b.name_ar || b.name_en : b.name_en || b.name_ar}
                  </Text>
                  <Text style={styles.brandOptionSlug}>@{b.slug}</Text>
                </View>
                {isSelected && (
                  <AppIcon name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ModalSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  errorCard: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
  },
  kpiGrid: {
    gap: 10,
  },
  quickDock: {
    gap: 12,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  quickActionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickActionItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  urgentBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
  },
  urgentIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  urgentTextWrapper: {
    flex: 1,
  },
  urgentTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#92400E",
  },
  urgentSubtitle: {
    fontSize: 12,
    color: "#B45309",
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  ordersList: {
    gap: 10,
  },
  orderCardWrapper: {
    ...shadow.card,
  },
  orderCard: {
    gap: 10,
  },
  orderCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  orderNumberBlock: {
    flex: 1,
    marginRight: 8,
  },
  orderInvoiceText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  orderCustomerText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  orderBadges: {
    flexDirection: "row",
    gap: 4,
  },
  orderCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderTimeText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  orderDot: {
    fontSize: 12,
    color: colors.border,
  },
  orderFulfillmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  orderAmountText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary,
  },
  brandList: {
    gap: 10,
    paddingVertical: 8,
  },
  brandOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 12,
  },
  brandOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.brandSoft,
  },
  brandOptionText: {
    flex: 1,
  },
  brandOptionName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  brandOptionSlug: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
