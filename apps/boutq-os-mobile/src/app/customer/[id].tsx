import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, MetricCard, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeBrandId, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCustomer = async () => {
    if (!id || !activeBrandId) return;
    try {
      setLoading(true);
      const { data: custData, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (custErr) throw custErr;
      setCustomer(custData);

      // Load orders for this customer
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, invoice_number, total_amount, status, payment_status, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });

      setOrders(ordersData ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCustomer();
  }, [id, activeBrandId]);

  const handleCall = () => {
    if (!customer?.phone) return;
    void Linking.openURL(`tel:${customer.phone}`);
  };

  const handleWhatsApp = () => {
    if (!customer?.phone) return;
    const clean = customer.phone.replace(/[^0-9]/g, "");
    void Linking.openURL(`https://wa.me/${clean}`);
  };

  const totalSpend = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadCustomer();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Customer Profile Card */}
              <Card style={styles.profileCard}>
                <View style={styles.profileRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(customer?.name || "C").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>{customer?.name || "Customer"}</Text>
                    <Text style={styles.customerPhone}>{customer?.phone}</Text>
                    {customer?.city || customer?.area ? (
                      <Text style={styles.customerAddress}>
                        📍 {customer.city || customer.area}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Direct Action Buttons */}
                <View style={styles.actionRow}>
                  <Pressable onPress={handleCall} style={styles.callButton}>
                    <AppIcon name="call" size={16} color={colors.primary} />
                    <Text style={styles.callButtonText}>{t("common.call")}</Text>
                  </Pressable>
                  <Pressable onPress={handleWhatsApp} style={styles.waButton}>
                    <AppIcon name="logo-whatsapp" size={16} color="#FFFFFF" />
                    <Text style={styles.waButtonText}>{t("common.whatsapp")}</Text>
                  </Pressable>
                </View>
              </Card>

              {/* Metrics Grid */}
              <View style={styles.metricsGrid}>
                <MetricCard
                  label={t("customers.lifetimeSpend")}
                  value={formatMoney(totalSpend, currency)}
                  tone="primary"
                />
                <MetricCard
                  label={t("customers.ordersCount")}
                  value={String(orders.length)}
                  tone="info"
                />
              </View>

              <Text style={styles.sectionHeader}>{t("customers.history")}</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t("dashboard.noOrders")}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/order/${item.id}`)}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <Card style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.invoiceText}>#{item.invoice_number}</Text>
                  <StatusPill status={item.status} />
                </View>
                <View style={styles.orderFooter}>
                  <Text style={styles.dateText}>
                    {new Date(item.created_at).toLocaleDateString(isAr ? "ar-BH" : "en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                  <Text style={styles.amountText}>
                    {formatMoney(item.total_amount, currency)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBlock: {
    gap: 14,
    marginBottom: 8,
  },
  profileCard: {
    gap: 14,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primaryFg,
    fontSize: 20,
    fontWeight: "800",
  },
  customerName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  customerPhone: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  customerAddress: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  callButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  waButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: "#25D366",
  },
  waButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  metricsGrid: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: 6,
  },
  orderCard: {
    gap: 8,
    padding: 12,
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  invoiceText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  orderFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  amountText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
});
