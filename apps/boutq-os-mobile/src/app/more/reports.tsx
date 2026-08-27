import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, MetricCard, SegmentedControl } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

type PeriodFilter = "today" | "7d" | "30d" | "all";

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [period, setPeriod] = useState<PeriodFilter>("30d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);

  const loadData = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      let query = supabase
        .from("orders")
        .select("id,invoice_number,total_amount,payment_method,status,payment_status,created_at")
        .eq("brand_id", activeBrandId)
        .neq("status", "cancelled");

      const now = new Date();
      if (period === "today") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte("created_at", startOfDay);
      } else if (period === "7d") {
        const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", start7d);
      } else if (period === "30d") {
        const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", start30d);
      }

      const { data: ordersData, error: ordersErr } = await query.order("created_at", {
        ascending: false,
      });
      if (ordersErr) throw ordersErr;

      const loadedOrders = ordersData ?? [];
      setOrders(loadedOrders);

      if (loadedOrders.length > 0) {
        const orderIds = loadedOrders.map((o) => o.id);
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("id,product_name_ar,product_name_en,quantity,total_price,unit_price")
          .in("order_id", orderIds.slice(0, 100));

        setOrderItems(itemsData ?? []);
      } else {
        setOrderItems([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeBrandId, period]);

  const stats = useMemo(() => {
    const totalSales = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const count = orders.length;
    const avgOrder = count > 0 ? totalSales / count : 0;

    // Payment methods aggregation
    const paymentMap: Record<string, { count: number; total: number }> = {};
    orders.forEach((o) => {
      const pm = o.payment_method || (isAr ? "أخرى / غير محدد" : "Other / Unspecified");
      if (!paymentMap[pm]) paymentMap[pm] = { count: 0, total: 0 };
      paymentMap[pm].count += 1;
      paymentMap[pm].total += Number(o.total_amount || 0);
    });

    // Top products aggregation
    const productMap: Record<string, { name: string; qty: number; total: number }> = {};
    orderItems.forEach((item) => {
      const name = isAr
        ? item.product_name_ar || item.product_name_en || "منتج"
        : item.product_name_en || item.product_name_ar || "Product";
      if (!productMap[name]) productMap[name] = { name, qty: 0, total: 0 };
      productMap[name].qty += Number(item.quantity || 1);
      productMap[name].total += Number(item.total_price || item.unit_price || 0);
    });

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { totalSales, count, avgOrder, paymentMap, topProducts };
  }, [orders, orderItems, isAr]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadData();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Period Filter Selector */}
      <SegmentedControl
        options={[
          { label: t("reports.periodToday"), value: "today" },
          { label: t("reports.period7d"), value: "7d" },
          { label: t("reports.period30d"), value: "30d" },
          { label: t("reports.periodAll"), value: "all" },
        ]}
        value={period}
        onChange={(val) => setPeriod(val as PeriodFilter)}
      />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : (
        <>
          {/* Key Metric Highlights */}
          <View style={styles.metricsGrid}>
            <MetricCard
              label={t("reports.salesSummary")}
              value={formatMoney(stats.totalSales, currency)}
              tone="primary"
            />
            <MetricCard
              label={t("dashboard.activeOrders")}
              value={String(stats.count)}
              tone="info"
            />
            <MetricCard
              label={t("reports.averageOrder")}
              value={formatMoney(stats.avgOrder, currency)}
              tone="success"
            />
          </View>

          {/* Top Selling Products */}
          <Card>
            <View style={styles.cardHeader}>
              <AppIcon name="cube" size={20} color={colors.primary} />
              <Text style={styles.cardTitle}>{t("reports.topProducts")}</Text>
            </View>
            {stats.topProducts.length === 0 ? (
              <Text style={styles.emptyText}>{t("dashboard.noTopSelling")}</Text>
            ) : (
              <View style={styles.list}>
                {stats.topProducts.map((p, idx) => (
                  <View key={idx} style={styles.productRow}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.productQty}>
                        {p.qty} {isAr ? "قطع مباعة" : "units sold"}
                      </Text>
                    </View>
                    <Text style={styles.productTotal}>{formatMoney(p.total, currency)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Payment Method Distribution */}
          <Card>
            <View style={styles.cardHeader}>
              <AppIcon name="wallet" size={20} color={colors.primary} />
              <Text style={styles.cardTitle}>{t("reports.paymentBreakdown")}</Text>
            </View>
            {Object.keys(stats.paymentMap).length === 0 ? (
              <Text style={styles.emptyText}>{t("orders.noMatch")}</Text>
            ) : (
              <View style={styles.list}>
                {Object.entries(stats.paymentMap).map(([method, data], idx) => (
                  <View key={idx} style={styles.paymentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentMethodName}>{method}</Text>
                      <Text style={styles.paymentCount}>
                        {data.count} {isAr ? "طلبات" : "orders"}
                      </Text>
                    </View>
                    <Text style={styles.paymentTotal}>{formatMoney(data.total, currency)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  metricsGrid: {
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  list: {
    gap: 10,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  productName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  productQty: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  productTotal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  paymentMethodName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  paymentCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  paymentTotal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },
});
