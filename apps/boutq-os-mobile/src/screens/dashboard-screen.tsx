import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

type OrderSummary = {
  id: string;
  invoice_number: number;
  customer_name_snapshot: string | null;
  status: string;
  total: number;
  currency: string;
  created_at: string;
};

export function DashboardScreen() {
  const { profile, signOut, brands, activeBrandId, setActiveBrandId } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBrandId) return;
    setError(null);
    const { data, error: queryError } = await supabase
      .from("orders")
      .select("id,invoice_number,customer_name_snapshot,status,total,currency,created_at")
      .eq("brand_id", activeBrandId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (queryError) setError(queryError.message);
    else setOrders((data ?? []) as OrderSummary[]);
  }, [activeBrandId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const openOrders = () => router.push("/orders");
  const pending = orders.filter(
    (order) => !["completed", "cancelled", "delivered"].includes(order.status.toLowerCase()),
  ).length;
  const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={styles.header}>
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.logout}>خروج</Text>
          </Pressable>
          <View>
            <Text style={styles.hello}>
              هلا، {profile?.full_name || profile?.name || "مدير المتجر"}
            </Text>
            <Text style={styles.role}>{profile?.role || "admin"}</Text>
          </View>
        </View>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>مركز القيادة</Text>
          <Text style={styles.heroTitle}>لوحة Boutq OS</Text>
          <Text style={styles.heroText}>متابعة سريعة للطلبات والمبيعات من الجوال.</Text>
        </View>
        {brands.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brands}
          >
            {brands.map((brand) => (
              <Pressable
                key={brand.id}
                onPress={() => setActiveBrandId(brand.id)}
                style={[styles.brandChip, activeBrandId === brand.id && styles.brandChipActive]}
              >
                <Text
                  style={[
                    styles.brandChipText,
                    activeBrandId === brand.id && styles.brandChipTextActive,
                  ]}
                >
                  {brand.name_ar || brand.name_en}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.metrics}>
          <Card>
            <Text style={styles.metricLabel}>أحدث الطلبات</Text>
            <Text style={styles.metricValue}>{orders.length}</Text>
          </Card>
          <Card>
            <Text style={styles.metricLabel}>تتطلب متابعة</Text>
            <Text style={styles.metricValue}>{pending}</Text>
          </Card>
        </View>
        <Card>
          <Text style={styles.metricLabel}>قيمة أحدث الطلبات</Text>
          <Text style={styles.money}>{total.toFixed(3)} د.ب.</Text>
        </Card>
        <View style={styles.sectionHeader}>
          <Pressable onPress={openOrders}>
            <Text style={styles.link}>عرض الكل ←</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>أحدث الطلبات</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.list}>
          {orders.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
              style={styles.order}
            >
              <View>
                <Text style={styles.amount}>
                  {Number(order.total).toFixed(3)} {order.currency}
                </Text>
                <StatusPill status={order.status} />
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.invoice}>#{order.invoice_number}</Text>
                <Text style={styles.customer}>{order.customer_name_snapshot || "عميل"}</Text>
                <Text style={styles.date}>
                  {new Date(order.created_at).toLocaleDateString("ar-BH")}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hello: { color: colors.text, fontWeight: "900", fontSize: 18, textAlign: "right" },
  role: { color: colors.muted, textAlign: "right", marginTop: 2 },
  logout: { color: colors.brand, fontWeight: "800", paddingVertical: 10 },
  hero: { backgroundColor: colors.brand, borderRadius: 26, padding: 22 },
  heroLabel: { color: "#DDBFBA", fontWeight: "800", textAlign: "right" },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "right", marginTop: 7 },
  heroText: { color: "#F5E8E5", textAlign: "right", marginTop: 8 },
  metrics: { flexDirection: "row", gap: 12 },
  metricLabel: { color: colors.muted, textAlign: "right", fontWeight: "700" },
  metricValue: {
    color: colors.text,
    textAlign: "right",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8,
  },
  money: { color: colors.brand, textAlign: "right", fontSize: 26, fontWeight: "900", marginTop: 8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  link: { color: colors.brand, fontWeight: "800" },
  list: { gap: 10 },
  brands: { gap: 8 },
  brandChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  brandChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  brandChipText: { color: colors.text, fontWeight: "800" },
  brandChipTextActive: { color: "#fff" },
  order: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 15,
  },
  orderRight: { alignItems: "flex-end" },
  invoice: { color: colors.brand, fontWeight: "900", fontSize: 16 },
  customer: { color: colors.text, fontWeight: "700", marginTop: 4 },
  date: { color: colors.muted, fontSize: 12, marginTop: 3 },
  amount: { color: colors.text, fontWeight: "900", marginBottom: 8 },
  error: { color: colors.danger, textAlign: "right" },
});
