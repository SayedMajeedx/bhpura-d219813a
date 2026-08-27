import React, { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { AppTopBar } from "@/components/topbar";
import { Card, EmptyState, SearchInput } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius, shadow } from "@/theme";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city?: string | null;
  area?: string | null;
  total_orders?: number;
  total_spent?: number;
};

export default function CustomersScreen() {
  const { activeBrandId, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!activeBrandId) return;

    try {
      // 1. Fetch customers
      const { data: custData, error: cErr } = await supabase
        .from("customers")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (cErr) throw cErr;

      // 2. Fetch orders to calculate totals
      const { data: ordersData } = await supabase
        .from("orders")
        .select("customer_id, total_amount, status")
        .eq("brand_id", activeBrandId);

      const orderCountMap = new Map<string, { count: number; spent: number }>();
      (ordersData ?? []).forEach((o) => {
        if (!o.customer_id) return;
        const current = orderCountMap.get(o.customer_id) ?? { count: 0, spent: 0 };
        current.count += 1;
        if (o.status !== "cancelled") {
          current.spent += Number(o.total_amount || 0);
        }
        orderCountMap.set(o.customer_id, current);
      });

      const enriched: Customer[] = (custData ?? []).map((c) => {
        const stats = orderCountMap.get(c.id) ?? { count: 0, spent: 0 };
        return {
          ...c,
          total_orders: stats.count,
          total_spent: stats.spent,
        };
      });

      setCustomers(enriched);
    } catch (err: any) {
      Alert.alert(isAr ? "خطأ" : "Error", err.message || "Failed to load customers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeBrandId, isAr]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
    }, [loadCustomers]),
  );

  const needle = search.trim().toLowerCase();
  const filtered = customers.filter((c) => {
    if (!needle) return true;
    const matchName = (c.name || "").toLowerCase().includes(needle);
    const matchPhone = (c.phone || "").includes(needle);
    const matchEmail = (c.email || "").toLowerCase().includes(needle);
    return matchName || matchPhone || matchEmail;
  });

  const handleCall = (phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, "");
    void Linking.openURL(`https://wa.me/${clean}`);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <AppTopBar title={t("nav.customers")} />

      <View style={styles.filterSection}>
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("customers.searchPh")}
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
                void loadCustomers();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("customers.noCustomers")}
              description={
                isAr
                  ? "لا يوجد عملاء يطابقون معايير البحث الحالية."
                  : "No customers match your search query."
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/customer/${item.id}` as any)}
              style={({ pressed }) => [styles.cardWrapper, pressed && { opacity: 0.85 }]}
            >
              <Card style={styles.customerCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(item.name || "C").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>{item.name}</Text>
                    <Text style={styles.customerPhone}>{item.phone || "-"}</Text>
                    {item.city || item.area ? (
                      <Text style={styles.locationText}>📍 {item.city || item.area}</Text>
                    ) : null}
                  </View>

                  {/* Action dock */}
                  {item.phone ? (
                    <View style={styles.quickActions}>
                      <Pressable
                        onPress={() => handleCall(item.phone!)}
                        style={styles.iconAction}
                      >
                        <AppIcon name="call" size={16} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleWhatsApp(item.phone!)}
                        style={[styles.iconAction, { backgroundColor: "#DCF8C6" }]}
                      >
                        <AppIcon name="logo-whatsapp" size={16} color="#25D366" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.ordersCountText}>
                    {item.total_orders ?? 0} {isAr ? "طلبات سابقة" : "orders"}
                  </Text>
                  <Text style={styles.totalSpentText}>
                    {formatMoney(item.total_spent ?? 0, currency)}
                  </Text>
                </View>
              </Card>
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
  customerCard: {
    gap: 10,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primaryFg,
    fontSize: 18,
    fontWeight: "800",
  },
  customerName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  customerPhone: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  locationText: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  quickActions: {
    flexDirection: "row",
    gap: 6,
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  ordersCountText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  totalSpentText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
});
