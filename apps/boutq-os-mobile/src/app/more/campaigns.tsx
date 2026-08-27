import React, { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, Field, PrimaryButton, SecondaryButton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { colors, radius } from "@/theme";

type TemplateItem = {
  id: string;
  titleKey: string;
  defaultTextAr: string;
  defaultTextEn: string;
};

const TEMPLATES: TemplateItem[] = [
  {
    id: "confirm",
    titleKey: "campaigns.orderConfirmation",
    defaultTextAr:
      "مرحباً {اسم_العميل} 🌸\nتم استلام وتأكيد طلبك رقم #{رقم_الطلب} بنجاح لدى {اسم_المتجر}.\nالمبلغ الإجمالي: {المبلغ}.\nشكراً لتسوقك معنا!",
    defaultTextEn:
      "Hello {customer_name} 🌸\nYour order #{order_number} has been confirmed at {store_name}.\nTotal: {total}.\nThank you for shopping with us!",
  },
  {
    id: "dispatch",
    titleKey: "campaigns.deliveryDispatch",
    defaultTextAr:
      "مرحباً {اسم_العميل} 🚗\nشحنتك للطلب #{رقم_الطلب} خرجت الآن للتوصيل مع المندوب.\nيرجى تجهيز المبلغ المتبقي {المبلغ_المتبقي}.\nنتمنى لك يوماً جميلاً!",
    defaultTextEn:
      "Hello {customer_name} 🚗\nYour order #{order_number} is out for delivery with our courier.\nRemaining amount: {remaining_due}.\nHave a wonderful day!",
  },
  {
    id: "pickup",
    titleKey: "campaigns.readyPickup",
    defaultTextAr:
      "مرحباً {اسم_العميل} 🛍️\nطلبك رقم #{رقم_الطلب} جاهز الآن للاستلام من فرعنا.\nأوقات العمل: من 10 صباحاً إلى 10 مساءً.\nأهلاً بك!",
    defaultTextEn:
      "Hello {customer_name} 🛍️\nYour order #{order_number} is ready for pickup at our branch.\nWorking hours: 10 AM - 10 PM.\nWelcome anytime!",
  },
  {
    id: "promo",
    titleKey: "campaigns.promotional",
    defaultTextAr:
      "مرحباً {اسم_العميل} ✨\nيسرنا إهدائك كود خصم خاص {كود_الخصم} بنسبة 15% على جميع التشكيلات الجديدة في متجر {اسم_المتجر}.\nتسوق الآن من الرابط!",
    defaultTextEn:
      "Hello {customer_name} ✨\nEnjoy an exclusive 15% discount code {discount_code} across all new collections at {store_name}.\nShop now!",
  },
];

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrand } = useAuth();
  const { t, isAr } = useI18n();

  const [testPhone, setTestPhone] = useState("");

  const copyTemplate = async (text: string) => {
    const storeName = isAr
      ? activeBrand?.name_ar || activeBrand?.name_en || "متجرنا"
      : activeBrand?.name_en || activeBrand?.name_ar || "Our Store";

    const filled = text
      .replace(/{اسم_المتجر}|{store_name}/g, storeName)
      .replace(/{اسم_العميل}|{customer_name}/g, "سارة")
      .replace(/{رقم_الطلب}|{order_number}/g, "1042")
      .replace(/{المبلغ}|{total}/g, "35.000 BHD")
      .replace(/{المبلغ_المتبقي}|{remaining_due}/g, "0.000 BHD")
      .replace(/{كود_الخصم}|{discount_code}/g, "SUMMER15");

    await Clipboard.setStringAsync(filled);
    Alert.alert(isAr ? "تم النسخ" : "Copied", isAr ? "تم نسخ نص الرسالة بنجاح" : "Template copied to clipboard");
  };

  const testWhatsApp = (text: string) => {
    const cleanPhone = testPhone.replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      Alert.alert(
        isAr ? "رقم الهاتف مطلوب" : "Phone required",
        isAr ? "يرجى كتابة رقم هاتف لإرسال الرسالة التجريبية" : "Enter a phone number to test WhatsApp message",
      );
      return;
    }

    const storeName = isAr
      ? activeBrand?.name_ar || activeBrand?.name_en || "متجرنا"
      : activeBrand?.name_en || activeBrand?.name_ar || "Our Store";

    const filled = text
      .replace(/{اسم_المتجر}|{store_name}/g, storeName)
      .replace(/{اسم_العميل}|{customer_name}/g, "سارة")
      .replace(/{رقم_الطلب}|{order_number}/g, "1042")
      .replace(/{المبلغ}|{total}/g, "35.000 BHD")
      .replace(/{المبلغ_المتبقي}|{remaining_due}/g, "0.000 BHD")
      .replace(/{كود_الخصم}|{discount_code}/g, "SUMMER15");

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(filled)}`;
    void Linking.openURL(url);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      <Card style={styles.testCard}>
        <Text style={styles.testCardTitle}>
          {isAr ? "اختبار إرسال الرسائل عبر واتساب" : "Test WhatsApp Dispatch"}
        </Text>
        <Field
          label={isAr ? "رقم هاتف التجربة" : "Test Phone Number"}
          value={testPhone}
          onChangeText={setTestPhone}
          placeholder="e.g. 97339000000"
          keyboardType="phone-pad"
        />
      </Card>

      <Text style={styles.sectionHeader}>{t("campaigns.templates")}</Text>

      {TEMPLATES.map((tmpl) => {
        const text = isAr ? tmpl.defaultTextAr : tmpl.defaultTextEn;
        return (
          <Card key={tmpl.id} style={styles.templateCard}>
            <View style={styles.tmplHeader}>
              <View style={styles.iconBox}>
                <AppIcon name="logo-whatsapp" size={20} color="#25D366" />
              </View>
              <Text style={styles.tmplTitle}>{t(tmpl.titleKey)}</Text>
            </View>

            <Text style={styles.tmplText}>{text}</Text>

            <View style={styles.tmplActions}>
              <SecondaryButton
                title={t("common.copy")}
                onPress={() => copyTemplate(text)}
              />
              <Pressable
                onPress={() => testWhatsApp(text)}
                style={styles.waButton}
              >
                <AppIcon name="paper-plane" size={16} color="#FFFFFF" />
                <Text style={styles.waButtonText}>{isAr ? "إرسال تجريبي" : "Send Test"}</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
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
  testCard: {
    gap: 12,
  },
  testCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  templateCard: {
    gap: 12,
  },
  tmplHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: "#DCF8C6",
    alignItems: "center",
    justifyContent: "center",
  },
  tmplTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  tmplText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.bgSoft,
    padding: 12,
    borderRadius: radius.md,
  },
  tmplActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  waButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25D366",
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  waButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
