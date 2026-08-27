import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

type OrderRow = {
  id: string;
  invoice_number: number;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  status: string;
  payment_status: string;
  total: number;
  currency: string;
  created_at: string;
};

export default function OrdersScreen() {
  const { activeBrandId } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeBrandId) return;
    const { data } = await supabase
      .from("orders")
      .select(
        "id,invoice_number,customer_name_snapshot,customer_phone_snapshot,status,payment_status,total,currency,created_at",
      )
      .eq("brand_id", activeBrandId)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as OrderRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [activeBrandId]);

  useEffect(() => {
    void load();
  }, [load]);
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      !needle ||
      String(row.invoice_number).includes(needle) ||
      (row.customer_name_snapshot ?? "").toLowerCase().includes(needle) ||
      (row.customer_phone_snapshot ?? "").includes(needle),
  );

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  return (
    <View style={styles.screen}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="ابحث برقم الطلب أو العميل"
        placeholderTextColor={colors.muted}
        style={styles.search}
        textAlign="right"
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load();
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>لا توجد طلبات مطابقة</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: item.id } })}
            style={styles.row}
          >
            <View style={styles.left}>
              <Text style={styles.amount}>
                {Number(item.total).toFixed(3)} {item.currency}
              </Text>
              <StatusPill status={item.payment_status} />
            </View>
            <View style={styles.right}>
              <Text style={styles.invoice}>#{item.invoice_number}</Text>
              <Text style={styles.customer}>{item.customer_name_snapshot || "عميل"}</Text>
              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleDateString("ar-BH")}
              </Text>
              <StatusPill status={item.status} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  search: {
    minHeight: 50,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    color: colors.text,
  },
  list: { paddingTop: 14, paddingBottom: 30, gap: 10 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  left: { alignItems: "flex-start", gap: 8 },
  right: { alignItems: "flex-end", flex: 1 },
  invoice: { color: colors.brand, fontWeight: "900", fontSize: 16 },
  customer: { color: colors.text, fontWeight: "800", marginVertical: 4 },
  date: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  amount: { color: colors.text, fontWeight: "900" },
  empty: { textAlign: "center", color: colors.muted, marginTop: 70 },
});
