import React, { useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, EmptyState, Field, ModalSheet, PrimaryButton, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function IncubatorsScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId } = useAuth();
  const { t, isAr } = useI18n();

  const [incubators, setIncubators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [commissionRate, setCommissionRate] = useState("");

  const loadIncubators = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("incubators")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setIncubators(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadIncubators();
  }, [activeBrandId]);

  const handleCreateIncubator = async () => {
    if (!name.trim()) {
      Alert.alert(
        isAr ? "بيانات ناقصة" : "Missing fields",
        isAr ? "يرجى كتابة اسم الحاضنة أو المحل" : "Please enter incubator name",
      );
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from("incubators").insert({
        brand_id: activeBrandId,
        name: name.trim(),
        location: location.trim() || null,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        commission_rate: commissionRate ? parseFloat(commissionRate) : 0,
        is_active: true,
      });

      if (error) throw error;

      setModalOpen(false);
      setName("");
      setLocation("");
      setContactPerson("");
      setPhone("");
      setCommissionRate("");
      void loadIncubators();
    } catch (e: any) {
      Alert.alert(isAr ? "خطأ" : "Error", e.message || "Failed to create incubator");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={incubators}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadIncubators();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>{t("incubators.title")}</Text>
              <Text style={styles.subtitleText}>
                {incubators.length} {isAr ? "مواقع ومحلات عُهد" : "consignment spots"}
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
              title={t("incubators.noIncubators")}
              description={
                isAr
                  ? "أضف مواقع الحاضنات والمحلات الشريكة لتتبع المخزون والمبيعات والعُهد."
                  : "Add consignment stores and incubators to track stock and sales."
              }
              actionLabel={t("common.add")}
              onAction={() => setModalOpen(true)}
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.incubatorCard}>
            <View style={styles.cardHeader}>
              <View style={styles.iconBox}>
                <AppIcon name="business" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.incubatorName}>{item.name}</Text>
                {item.location ? (
                  <Text style={styles.locationText}>{item.location}</Text>
                ) : null}
              </View>
              <StatusPill
                status={item.is_active ? "مكتمل" : "ملغى"}
                customLabel={item.is_active ? (isAr ? "نشط" : "Active") : (isAr ? "متوقف" : "Inactive")}
              />
            </View>

            <View style={styles.cardMeta}>
              {item.contact_person ? (
                <View style={styles.metaRow}>
                  <AppIcon name="person" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{item.contact_person}</Text>
                </View>
              ) : null}
              {item.phone ? (
                <View style={styles.metaRow}>
                  <AppIcon name="call" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{item.phone}</Text>
                </View>
              ) : null}
              {item.commission_rate ? (
                <View style={styles.metaRow}>
                  <AppIcon name="pricetag" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>
                    {isAr ? "نسبة العمولة: " : "Commission: "}
                    {item.commission_rate}%
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        )}
      />

      {/* Add Incubator Modal Sheet */}
      <ModalSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isAr ? "إضافة موقع حاضنة أو عهدة" : "Add Consignment Location"}
      >
        <View style={styles.form}>
          <Field
            label={isAr ? "اسم الحاضنة أو المتجر" : "Incubator / Store Name"}
            value={name}
            onChangeText={setName}
            placeholder="مثال: بوتيك الأفينوز"
          />
          <Field
            label={isAr ? "الموقع / العنوان" : "Location / Area"}
            value={location}
            onChangeText={setLocation}
            placeholder="مثال: مجمع السيف - بوابة ٢"
          />
          <Field
            label={isAr ? "الشخص المسؤول" : "Contact Person"}
            value={contactPerson}
            onChangeText={setContactPerson}
            placeholder="مثال: سارة"
          />
          <Field
            label={isAr ? "رقم الهاتف" : "Phone Number"}
            value={phone}
            onChangeText={setPhone}
            placeholder="مثال: 97339000000"
            keyboardType="phone-pad"
          />
          <Field
            label={isAr ? "نسبة العمولة (%)" : "Commission Rate (%)"}
            value={commissionRate}
            onChangeText={setCommissionRate}
            placeholder="مثال: 10"
            keyboardType="decimal-pad"
          />
          <PrimaryButton
            title={t("common.save")}
            onPress={handleCreateIncubator}
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
  incubatorCard: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  incubatorName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  locationText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardMeta: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: colors.text,
  },
  form: {
    gap: 14,
    paddingVertical: 8,
  },
});
