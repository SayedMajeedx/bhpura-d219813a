import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, StatusPill } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { colors, radius } from "@/theme";

export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, isAr } = useI18n();

  const gateways = [
    {
      id: "benefit",
      name: "BenefitPay Gateway",
      nameAr: "بوابة بنفت بي (BenefitPay)",
      descAr: "الدفع المباشر عبر تطبيق بنفت بي في البحرين.",
      descEn: "Direct mobile payment via BenefitPay in Bahrain.",
      icon: "card",
      status: "connected",
    },
    {
      id: "tap",
      name: "Tap Payments",
      nameAr: "بوابة تاب (Tap Payments)",
      descAr: "قبول بطاقات فيزا، ماستركارد ومدى الخليجية.",
      descEn: "Accept Visa, MasterCard, and GCC Mada cards.",
      icon: "wallet",
      status: "connected",
    },
    {
      id: "apple_pay",
      name: "Apple Pay",
      nameAr: "أبل باي (Apple Pay)",
      descAr: "الدفع السريع بلمسة واحدة لأجهزة iOS.",
      descEn: "One-touch express checkout for iOS devices.",
      icon: "phone-portrait",
      status: "connected",
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      <Card style={styles.introCard}>
        <AppIcon name="shield-checkmark" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.introTitle}>
            {isAr ? "بوابات الدفع الإلكتروني المؤمّنة" : "Secure Payment Gateways"}
          </Text>
          <Text style={styles.introDesc}>
            {isAr
              ? "يتم تسوية وتأمين عمليات الدفع للطلبات عبر البوابات المرتبطة بنظام بوتيك تلقائياً."
              : "Order payments are processed and reconciled automatically via connected payment providers."}
          </Text>
        </View>
      </Card>

      <Text style={styles.sectionHeader}>
        {isAr ? "البوابات النشطة" : "Active Gateways"}
      </Text>

      {gateways.map((g) => (
        <Card key={g.id} style={styles.gatewayCard}>
          <View style={styles.gatewayHeader}>
            <View style={styles.iconBox}>
              <AppIcon name={g.icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gatewayName}>{isAr ? g.nameAr : g.name}</Text>
              <Text style={styles.gatewayDesc}>{isAr ? g.descAr : g.descEn}</Text>
            </View>
            <StatusPill
              status="مكتمل"
              customLabel={isAr ? "متصل ومفعّل" : "Active"}
            />
          </View>
        </Card>
      ))}
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
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.brandSoft,
    borderColor: colors.primary,
  },
  introTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  introDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  gatewayCard: {
    gap: 10,
  },
  gatewayHeader: {
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
  gatewayName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  gatewayDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
