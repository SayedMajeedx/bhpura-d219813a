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
import { Card, EmptyState, Field, ModalSheet, PrimaryButton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId } = useAuth();
  const { t, isAr } = useI18n();

  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  const loadCategories = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setCategories(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, [activeBrandId]);

  const toggleCategoryActive = async (id: string, current: boolean) => {
    try {
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: !current } : c)),
      );
      const { error } = await supabase
        .from("categories")
        .update({ is_active: !current })
        .eq("id", id);
      if (error) throw error;
    } catch (e) {
      Alert.alert(isAr ? "خطأ" : "Error", isAr ? "فشل تحديث القسم" : "Failed to update category");
      void loadCategories();
    }
  };

  const handleCreateCategory = async () => {
    if (!nameAr.trim() && !nameEn.trim()) {
      Alert.alert(
        isAr ? "بيانات ناقصة" : "Missing fields",
        isAr ? "يرجى كتابة اسم القسم" : "Please enter category name",
      );
      return;
    }

    try {
      setSaving(true);
      const generatedSlug = slug.trim()
        ? slug.trim().toLowerCase().replace(/\s+/g, "-")
        : (nameEn || nameAr).trim().toLowerCase().replace(/\s+/g, "-");

      const { error } = await supabase.from("categories").insert({
        brand_id: activeBrandId,
        name_ar: nameAr.trim() || nameEn.trim(),
        name_en: nameEn.trim() || nameAr.trim(),
        slug: generatedSlug,
        sort_order: parseInt(sortOrder, 10) || 0,
        is_active: true,
      });

      if (error) throw error;

      setModalOpen(false);
      setNameAr("");
      setNameEn("");
      setSlug("");
      setSortOrder("0");
      void loadCategories();
    } catch (e: any) {
      Alert.alert(isAr ? "خطأ" : "Error", e.message || "Failed to create category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadCategories();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>{t("categories.title")}</Text>
              <Text style={styles.subtitleText}>
                {categories.length} {isAr ? "أقسام مسجلة" : "categories configured"}
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
              title={t("categories.noCategories")}
              description={
                isAr
                  ? "قسّم منتجاتك إلى تصنيفات وأقسام لتسهيل تصفحها."
                  : "Organize products into categories for seamless browsing."
              }
              actionLabel={t("categories.addCategory")}
              onAction={() => setModalOpen(true)}
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.catCard}>
            <View style={styles.catRow}>
              <View style={styles.catIconBox}>
                <AppIcon name="folder" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.catTitle}>
                  {isAr ? item.name_ar || item.name_en : item.name_en || item.name_ar}
                </Text>
                <Text style={styles.catSlug}>/{item.slug}</Text>
              </View>
              <Switch
                value={item.is_active ?? true}
                onValueChange={() => toggleCategoryActive(item.id, item.is_active ?? true)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </Card>
        )}
      />

      {/* Add Category Modal Sheet */}
      <ModalSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t("categories.addCategory")}
      >
        <View style={styles.form}>
          <Field
            label={t("categories.nameAr")}
            value={nameAr}
            onChangeText={setNameAr}
            placeholder="مثال: عبايات يومية"
          />
          <Field
            label={t("categories.nameEn")}
            value={nameEn}
            onChangeText={setNameEn}
            placeholder="e.g. Daily Abayas"
          />
          <Field
            label={t("categories.slug")}
            value={slug}
            onChangeText={setSlug}
            placeholder="e.g. daily-abayas"
            autoCapitalize="none"
          />
          <Field
            label={t("categories.sortOrder")}
            value={sortOrder}
            onChangeText={setSortOrder}
            placeholder="0"
            keyboardType="number-pad"
          />
          <PrimaryButton
            title={t("common.save")}
            onPress={handleCreateCategory}
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
  catCard: {
    padding: 12,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  catIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  catSlug: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  form: {
    gap: 14,
    paddingVertical: 8,
  },
});
