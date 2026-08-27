import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, Field, PrimaryButton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrand, activeBrandId } = useAuth();
  const { t, isAr } = useI18n();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [currency, setCurrency] = useState("BHD");
  const [deliveryFee, setDeliveryFee] = useState("1.500");
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);

  useEffect(() => {
    if (activeBrand) {
      setNameAr(activeBrand.name_ar || "");
      setNameEn(activeBrand.name_en || "");
    }
  }, [activeBrand]);

  const loadBusinessSettings = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      const { data } = await supabase
        .from("business_settings")
        .select("*")
        .eq("brand_id", activeBrandId)
        .maybeSingle();

      if (data) {
        if (data.currency) setCurrency(data.currency);
        if (data.phone) setPhone(data.phone);
        if (data.delivery_fee !== undefined) setDeliveryFee(String(data.delivery_fee));
        if (data.delivery_enabled !== undefined) setDeliveryEnabled(data.delivery_enabled);
        if (data.pickup_enabled !== undefined) setPickupEnabled(data.pickup_enabled);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBusinessSettings();
  }, [activeBrandId]);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      // Update brands table
      const { error: brandErr } = await supabase
        .from("brands")
        .update({
          name_ar: nameAr.trim(),
          name_en: nameEn.trim(),
        })
        .eq("id", activeBrandId);

      if (brandErr) throw brandErr;

      // Upsert business_settings table
      const { error: setErr } = await supabase.from("business_settings").upsert(
        {
          brand_id: activeBrandId,
          currency,
          phone: phone.trim() || null,
          delivery_fee: deliveryFee ? parseFloat(deliveryFee) : 0,
          delivery_enabled: deliveryEnabled,
          pickup_enabled: pickupEnabled,
        },
        { onConflict: "brand_id" },
      );

      if (setErr) throw setErr;

      Alert.alert(
        isAr ? "تم الحفظ" : "Saved",
        isAr ? "تم تحديث إعدادات المتجر بنجاح" : "Storefront settings updated successfully",
      );
    } catch (e: any) {
      Alert.alert(isAr ? "خطأ" : "Error", e.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {/* Store Brand Identity */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <AppIcon name="storefront" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>
                {isAr ? "هوية المتجر والعلامة" : "Storefront Identity"}
              </Text>
            </View>

            <Field
              label={isAr ? "اسم المتجر بالعربية" : "Arabic Store Name"}
              value={nameAr}
              onChangeText={setNameAr}
              placeholder="مثال: بوتيك الأناقة"
            />
            <Field
              label={isAr ? "اسم المتجر بالإنجليزية" : "English Store Name"}
              value={nameEn}
              onChangeText={setNameEn}
              placeholder="e.g. Elegance Boutique"
            />
            <Field
              label={isAr ? "العملة الأساسية" : "Base Currency"}
              value={currency}
              onChangeText={setCurrency}
              placeholder="BHD"
              autoCapitalize="characters"
            />
          </Card>

          {/* Contact & Hotlines */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <AppIcon name="call" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>
                {isAr ? "بيانات التواصل وخدمة العملاء" : "Contact & Hotlines"}
              </Text>
            </View>

            <Field
              label={isAr ? "هاتف الاتصال" : "Customer Phone"}
              value={phone}
              onChangeText={setPhone}
              placeholder="97339000000"
              keyboardType="phone-pad"
            />
            <Field
              label={isAr ? "رقم الواتساب للطلبات" : "WhatsApp Hotline"}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="97339000000"
              keyboardType="phone-pad"
            />
          </Card>

          {/* Fulfillment & Delivery */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <AppIcon name="car" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>
                {isAr ? "الشحن والتوصيل" : "Delivery & Pickup"}
              </Text>
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>
                  {isAr ? "تفعيل خيار التوصيل للعملاء" : "Enable Home Delivery"}
                </Text>
                <Text style={styles.switchSubtitle}>
                  {isAr ? "إتاحة اختيار التوصيل للمنازل بالمتجر" : "Allow customers to choose home delivery"}
                </Text>
              </View>
              <Switch
                value={deliveryEnabled}
                onValueChange={setDeliveryEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            {deliveryEnabled && (
              <Field
                label={isAr ? "رسوم التوصيل الافتراضية" : "Default Delivery Fee"}
                value={deliveryFee}
                onChangeText={setDeliveryFee}
                placeholder={`1.500 (${currency})`}
                keyboardType="decimal-pad"
              />
            )}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>
                  {isAr ? "تفعيل الاستلام من الفرع" : "Enable Branch Pickup"}
                </Text>
                <Text style={styles.switchSubtitle}>
                  {isAr ? "إتاحة استلام العميل للطلب من المتجر" : "Allow in-store order pickup"}
                </Text>
              </View>
              <Switch
                value={pickupEnabled}
                onValueChange={setPickupEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </Card>

          {/* Save Button */}
          <PrimaryButton
            title={t("common.save")}
            onPress={handleSaveSettings}
            loading={saving}
          />
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
  centerBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  sectionCard: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  switchSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
