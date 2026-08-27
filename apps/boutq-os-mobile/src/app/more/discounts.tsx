import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, EmptyState, Field, ModalSheet, PrimaryButton, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function DiscountsScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");

  const loadPromos = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPromos(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPromos();
  }, [activeBrandId]);

  const togglePromoActive = async (id: string, current: boolean) => {
    try {
      setPromos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_active: !current } : p)),
      );
      const { error } = await supabase
        .from("promo_codes")
        .update({ is_active: !current })
        .eq("id", id);
      if (error) throw error;
    } catch (e) {
      Alert.alert(isAr ? "خطأ" : "Error", isAr ? "فشل تحديث الكود" : "Failed to update promo code");
      void loadPromos();
    }
  };

  const handleCreatePromo = async () => {
    if (!code.trim() || !discountValue.trim()) {
      Alert.alert(
        isAr ? "بيانات ناقصة" : "Missing fields",
        isAr ? "يرجى كتابة كود الخصم وقيمة الخصم" : "Please enter code and discount value",
      );
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from("promo_codes").insert({
        brand_id: activeBrandId,
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        minimum_order_amount: minOrder ? parseFloat(minOrder) : null,
        maximum_discount_amount: maxDiscount ? parseFloat(maxDiscount) : null,
        is_active: true,
      });

      if (error) throw error;

      setModalOpen(false);
      setCode("");
      setDiscountValue("");
      setMinOrder("");
      setMaxDiscount("");
      void loadPromos();
    } catch (e: any) {
      Alert.alert(isAr ? "خطأ" : "Error", e.message || "Failed to create promo code");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={promos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadPromos();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>{t("discounts.title")}</Text>
              <Text style={styles.subtitleText}>
                {promos.length} {isAr ? "كود مسجل" : "promo codes"}
              </Text>
            </View>
            <Pressable onPress={() => setModalOpen(true)} style={styles.addButton}>
              <AppIcon name="add" size={20} color={colors.primaryFg} />
              <Text style={styles.addButtonText}>{t("common.add")}</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              title={t("discounts.noDiscounts")}
              description={
                isAr
                  ? "أنشئ كود خصم جديد لزيادة مبيعات متجرك ومكافأة العملاء."
                  : "Create a discount code to boost sales and reward customers."
              }
              actionLabel={t("discounts.addDiscount")}
              onAction={() => setModalOpen(true)}
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.promoCard}>
            <View style={styles.promoHeader}>
              <View style={styles.codeBadge}>
                <AppIcon name="pricetag" size={16} color={colors.primary} />
                <Text style={styles.codeText}>{item.code}</Text>
              </View>
              <Switch
                value={item.is_active}
                onValueChange={() => togglePromoActive(item.id, item.is_active)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={styles.promoDetails}>
              <Text style={styles.discountValueText}>
                {item.discount_type === "percentage"
                  ? `${item.discount_value}% ${isAr ? "خصم" : "OFF"}`
                  : `${formatMoney(item.discount_value, currency)} ${isAr ? "خصم ثابت" : "Fixed OFF"}`}
              </Text>
              {item.minimum_order_amount ? (
                <Text style={styles.promoSub}>
                  {isAr ? "الحد الأدنى للطلب: " : "Min Order: "}
                  {formatMoney(item.minimum_order_amount, currency)}
                </Text>
              ) : null}
              {item.maximum_discount_amount ? (
                <Text style={styles.promoSub}>
                  {isAr ? "أقصى خصم: " : "Max Discount: "}
                  {formatMoney(item.maximum_discount_amount, currency)}
                </Text>
              ) : null}
            </View>
          </Card>
        )}
      />

      {/* Create Promo Modal Sheet */}
      <ModalSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t("discounts.addDiscount")}
      >
        <View style={styles.form}>
          <Field
            label={t("discounts.code")}
            value={code}
            onChangeText={setCode}
            placeholder="e.g. SUMMER20"
            autoCapitalize="characters"
          />

          <View style={styles.typeRow}>
            <Pressable
              onPress={() => setDiscountType("percentage")}
              style={[
                styles.typeOption,
                discountType === "percentage" && styles.typeOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.typeOptionText,
                  discountType === "percentage" && styles.typeOptionTextSelected,
                ]}
              >
                {t("discounts.percentage")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDiscountType("fixed")}
              style={[
                styles.typeOption,
                discountType === "fixed" && styles.typeOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.typeOptionText,
                  discountType === "fixed" && styles.typeOptionTextSelected,
                ]}
              >
                {t("discounts.fixed")} ({currency})
              </Text>
            </Pressable>
          </View>

          <Field
            label={t("discounts.value")}
            value={discountValue}
            onChangeText={setDiscountValue}
            placeholder={discountType === "percentage" ? "e.g. 15" : "e.g. 5.000"}
            keyboardType="decimal-pad"
          />

          <Field
            label={t("discounts.minOrder")}
            value={minOrder}
            onChangeText={setMinOrder}
            placeholder={`e.g. 20.000 (${currency})`}
            keyboardType="decimal-pad"
          />

          <Field
            label={t("discounts.maxDiscount")}
            value={maxDiscount}
            onChangeText={setMaxDiscount}
            placeholder={`e.g. 10.000 (${currency})`}
            keyboardType="decimal-pad"
          />

          <PrimaryButton
            title={t("common.save")}
            onPress={handleCreatePromo}
            loading={saving}
          />
        </View>
      </ModalSheet>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  titleText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  subtitleText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addButtonText: {
    color: colors.primaryFg,
    fontSize: 14,
    fontWeight: "700",
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  promoCard: {
    gap: 10,
  },
  promoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  codeText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  promoDetails: {
    gap: 4,
  },
  discountValueText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  promoSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  form: {
    gap: 14,
    paddingVertical: 8,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  typeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.brandSoft,
  },
  typeOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  typeOptionTextSelected: {
    color: colors.primary,
  },
});
