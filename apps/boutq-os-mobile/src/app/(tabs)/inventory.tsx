import React, { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { AppTopBar } from "@/components/topbar";
import { Card, EmptyState, SearchInput, SegmentedControl } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius, shadow } from "@/theme";

type Variant = {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  barcode: string | null;
  selling_price: number;
  cost_price: number | null;
  stock: number;
  stock_main?: number;
  stock_incubator?: number;
};

type ProductWithVariants = {
  id: string;
  name: string;
  name_ar: string | null;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  variants: Variant[];
};

type InventoryFilter = "all" | "low_stock" | "out_of_stock";

export default function InventoryScreen() {
  const { activeBrandId, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    if (!activeBrandId) return;

    try {
      // 1. Fetch products
      const { data: prods, error: pErr } = await supabase
        .from("products")
        .select("id,name,name_ar,category,image_url,is_active")
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false });

      if (pErr) throw pErr;

      // 2. Fetch variants
      const { data: vars, error: vErr } = await supabase
        .from("product_variants")
        .select(
          "id,product_id,size,color,sku,barcode,selling_price,cost_price,stock",
        )
        .eq("brand_id", activeBrandId);

      if (vErr) throw vErr;

      const variantMap = new Map<string, Variant[]>();
      (vars ?? []).forEach((v) => {
        const list = variantMap.get(v.product_id) ?? [];
        list.push(v as Variant);
        variantMap.set(v.product_id, list);
      });

      const combined: ProductWithVariants[] = (prods ?? []).map((p) => ({
        ...p,
        variants: variantMap.get(p.id) ?? [],
      }));

      setProducts(combined);
    } catch (err: any) {
      Alert.alert(isAr ? "خطأ" : "Error", err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeBrandId, isAr]);

  useFocusEffect(
    useCallback(() => {
      void loadInventory();
    }, [loadInventory]),
  );

  const adjustStock = async (variantId: string, delta: number) => {
    try {
      setAdjustingId(variantId);

      // Optimistic update
      setProducts((prev) =>
        prev.map((p) => ({
          ...p,
          variants: p.variants.map((v) => {
            if (v.id === variantId) {
              const nextStock = Math.max(0, (v.stock ?? 0) + delta);
              return { ...v, stock: nextStock };
            }
            return v;
          }),
        })),
      );

      // Find current stock
      let currentStock = 0;
      for (const p of products) {
        const v = p.variants.find((v) => v.id === variantId);
        if (v) {
          currentStock = v.stock ?? 0;
          break;
        }
      }

      const newStock = Math.max(0, currentStock + delta);
      const { error } = await supabase
        .from("product_variants")
        .update({ stock: newStock })
        .eq("id", variantId);

      if (error) throw error;
    } catch (err: any) {
      Alert.alert(isAr ? "خطأ" : "Error", err.message || "Failed to adjust stock");
      void loadInventory();
    } finally {
      setAdjustingId(null);
    }
  };

  const needle = search.trim().toLowerCase();
  const filteredProducts = products.filter((p) => {
    // Search match
    if (needle) {
      const matchName = (p.name || "").toLowerCase().includes(needle);
      const matchNameAr = (p.name_ar || "").toLowerCase().includes(needle);
      const matchCategory = (p.category || "").toLowerCase().includes(needle);
      const matchSku = p.variants.some(
        (v) =>
          (v.sku && v.sku.toLowerCase().includes(needle)) ||
          (v.barcode && v.barcode.toLowerCase().includes(needle)),
      );
      if (!matchName && !matchNameAr && !matchCategory && !matchSku) return false;
    }

    // Filter match
    const totalStock = p.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
    if (filter === "low_stock") {
      return totalStock > 0 && totalStock <= 5;
    }
    if (filter === "out_of_stock") {
      return totalStock === 0;
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <AppTopBar title={t("nav.inventory")} />

      <View style={styles.filterSection}>
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("inventory.searchPh")}
        />

        <SegmentedControl
          options={[
            { label: t("inventory.filterAll"), value: "all" },
            { label: t("inventory.filterLow"), value: "low_stock" },
            { label: t("inventory.filterOut"), value: "out_of_stock" },
          ]}
          value={filter}
          onChange={(val) => setFilter(val as InventoryFilter)}
        />
      </View>

      {/* Quick shortcuts to categories and incubators */}
      <View style={styles.quickShortcuts}>
        <Pressable
          onPress={() => router.push("/more/categories")}
          style={styles.shortcutBtn}
        >
          <AppIcon name="tag" size={16} color={colors.primary} />
          <Text style={styles.shortcutText}>{t("nav.categories")}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/more/incubators")}
          style={styles.shortcutBtn}
        >
          <AppIcon name="cube" size={16} color={colors.primary} />
          <Text style={styles.shortcutText}>{t("nav.incubators")}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadInventory();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("inventory.noProducts")}
              description={
                isAr
                  ? "لا توجد منتجات تطابق معايير البحث الحالية في المخزون."
                  : "No products match your current filters."
              }
            />
          }
          renderItem={({ item }) => {
            const totalStock = item.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
            return (
              <Card style={styles.productCard}>
                <View style={styles.productHeader}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.productImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.productImageFallback}>
                      <AppIcon name="cube" size={24} color={colors.textMuted} />
                    </View>
                  )}

                  <View style={styles.productInfo}>
                    <Text style={styles.productTitle}>
                      {isAr ? item.name_ar || item.name : item.name || item.name_ar}
                    </Text>
                    {item.category ? (
                      <Text style={styles.productCategory}>{item.category}</Text>
                    ) : null}
                    <Text style={styles.totalStockText}>
                      {isAr ? "إجمالي المخزون: " : "Total stock: "}
                      <Text
                        style={{
                          color:
                            totalStock === 0
                              ? colors.danger
                              : totalStock <= 5
                                ? colors.warning
                                : colors.success,
                          fontWeight: "800",
                        }}
                      >
                        {totalStock} {isAr ? "قطعة" : "units"}
                      </Text>
                    </Text>
                  </View>
                </View>

                {/* Variants List with Live Steppers */}
                <View style={styles.variantsList}>
                  {item.variants.map((v) => {
                    const isBusy = adjustingId === v.id;
                    return (
                      <View key={v.id} style={styles.variantRow}>
                        <View style={styles.variantDetails}>
                          <Text style={styles.variantSpecs}>
                            {[v.size, v.color].filter(Boolean).join(" / ") || (isAr ? "المقاس القياسي" : "Standard")}
                          </Text>
                          {v.sku ? <Text style={styles.variantSku}>SKU: {v.sku}</Text> : null}
                          <Text style={styles.variantPrice}>
                            {formatMoney(v.selling_price, currency)}
                          </Text>
                        </View>

                        {/* Inline Stepper Controls */}
                        <View style={styles.stepperContainer}>
                          <Pressable
                            onPress={() => adjustStock(v.id, -1)}
                            disabled={isBusy || (v.stock ?? 0) <= 0}
                            style={({ pressed }) => [
                              styles.stepBtn,
                              ((v.stock ?? 0) <= 0 || isBusy) && styles.stepBtnDisabled,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <AppIcon
                              name="remove"
                              size={16}
                              color={(v.stock ?? 0) <= 0 ? colors.border : colors.text}
                            />
                          </Pressable>

                          <View style={styles.stockCountBox}>
                            {isBusy ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Text
                                style={[
                                  styles.stockCountText,
                                  (v.stock ?? 0) === 0 && { color: colors.danger },
                                ]}
                              >
                                {v.stock ?? 0}
                              </Text>
                            )}
                          </View>

                          <Pressable
                            onPress={() => adjustStock(v.id, 1)}
                            disabled={isBusy}
                            style={({ pressed }) => [
                              styles.stepBtn,
                              styles.stepBtnAdd,
                              isBusy && styles.stepBtnDisabled,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <AppIcon name="add" size={16} color={colors.primaryFg} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            );
          }}
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
    paddingBottom: 10,
    gap: 10,
    backgroundColor: colors.bg,
  },
  quickShortcuts: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
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
  productCard: {
    gap: 12,
  },
  productHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
  },
  productImageFallback: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  productCategory: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  totalStockText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  variantsList: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  variantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  variantDetails: {
    flex: 1,
  },
  variantSpecs: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  variantSku: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  variantPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgSoft,
    borderRadius: radius.md,
    padding: 3,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnAdd: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  stockCountBox: {
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stockCountText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
});
