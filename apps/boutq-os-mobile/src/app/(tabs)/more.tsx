import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { AppTopBar } from "@/components/topbar";
import { Card, ModalSheet, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { colors, radius, shadow } from "@/theme";

type HubItem = {
  id: string;
  titleKey: string;
  descKey: string;
  icon: string;
  route: string;
  badge?: string;
  adminOnly?: boolean;
  permission?: string;
};

export default function MoreHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, activeBrand, brands, setActiveBrandId, signOut, isAdmin, hasPermission } = useAuth();
  const { t, isAr, lang, toggleLang } = useI18n();
  const [brandModalOpen, setBrandModalOpen] = useState(false);

  const sections: { titleAr: string; titleEn: string; items: HubItem[] }[] = [
    {
      titleAr: "نظرة عامة والتقارير",
      titleEn: "Overview & Analytics",
      items: [
        {
          id: "reports",
          titleKey: "nav.reports",
          descKey: "reports.salesSummary",
          icon: "bar-chart",
          route: "/more/reports",
        },
      ],
    },
    {
      titleAr: "العمليات والمنتجات",
      titleEn: "Operations & Catalog",
      items: [
        {
          id: "categories",
          titleKey: "nav.categories",
          descKey: "categories.title",
          icon: "tag",
          route: "/more/categories",
        },
        {
          id: "incubators",
          titleKey: "nav.incubators",
          descKey: "incubators.locations",
          icon: "cube",
          route: "/more/incubators",
        },
        {
          id: "reviews",
          titleKey: "nav.reviews",
          descKey: "reviews.title",
          icon: "star",
          route: "/more/reviews",
        },
      ],
    },
    {
      titleAr: "النمو والمالية",
      titleEn: "Growth & Finance",
      items: [
        {
          id: "discounts",
          titleKey: "nav.discounts",
          descKey: "discounts.title",
          icon: "percent",
          route: "/more/discounts",
        },
        {
          id: "campaigns",
          titleKey: "nav.campaigns",
          descKey: "campaigns.templates",
          icon: "send",
          route: "/more/campaigns",
        },
        {
          id: "expenses",
          titleKey: "nav.expenses",
          descKey: "expenses.monthSummary",
          icon: "receipt",
          route: "/more/expenses",
        },
      ],
    },
    {
      titleAr: "المتجر والإعدادات",
      titleEn: "Storefront & Settings",
      items: [
        {
          id: "settings",
          titleKey: "nav.settings",
          descKey: "settings.title",
          icon: "settings",
          route: "/more/settings",
        },
        {
          id: "team",
          titleKey: "nav.team",
          descKey: "team.subtitle",
          icon: "people",
          route: "/more/team",
          adminOnly: true,
        },
        {
          id: "integrations",
          titleKey: "nav.integrations",
          descKey: "integrations.title",
          icon: "swap-horizontal",
          route: "/more/integrations",
          adminOnly: true,
        },
        {
          id: "pages",
          titleKey: "nav.pages",
          descKey: "pages.title",
          icon: "document-text",
          route: "/more/pages",
        },
      ],
    },
  ];

  const handleSignOut = () => {
    Alert.alert(
      isAr ? "تسجيل الخروج" : "Sign Out",
      isAr ? "هل أنت متأكد من تسجيل الخروج من الحساب؟" : "Are you sure you want to sign out?",
      [
        { text: isAr ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isAr ? "تسجيل الخروج" : "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/");
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppTopBar
        title={t("nav.more")}
        showBrandSwitcher={true}
        onOpenBrandSwitcher={() => setBrandModalOpen(true)}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.profileAvatar}>
              <Text style={styles.avatarLetter}>
                {(profile?.name || profile?.full_name || profile?.email || "U").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile?.name || profile?.full_name || profile?.email || "Staff Member"}
              </Text>
              <Text style={styles.profileEmail}>{profile?.email}</Text>
              <View style={styles.roleBadgeRow}>
                <StatusPill
                  status={profile?.role === "super_admin" || profile?.role === "admin" ? "مكتمل" : "نشط"}
                  customLabel={profile?.role?.toUpperCase()}
                />
              </View>
            </View>
          </View>
        </Card>

        {/* Quick Language Toggle Card */}
        <Pressable onPress={toggleLang} style={styles.langBanner}>
          <View style={styles.langBannerContent}>
            <AppIcon name="globe" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.langBannerTitle}>
                {isAr ? "تغيير لغة التطبيق" : "Change App Language"}
              </Text>
              <Text style={styles.langBannerSubtitle}>
                {isAr ? "الحالية: العربية (اضغط للتحويل إلى English)" : "Current: English (Tap to switch to العربية)"}
              </Text>
            </View>
          </View>
          <AppIcon name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>

        {/* Categorized Hub Sections */}
        {sections.map((sec, idx) => {
          const visibleItems = sec.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.permission && !hasPermission(item.permission)) return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <View key={idx} style={styles.sectionContainer}>
              <Text style={styles.sectionHeader}>
                {isAr ? sec.titleAr : sec.titleEn}
              </Text>
              <Card style={styles.sectionCard}>
                {visibleItems.map((item, itemIdx) => (
                  <React.Fragment key={item.id}>
                    <Pressable
                      onPress={() => router.push(item.route as any)}
                      style={({ pressed }) => [
                        styles.itemRow,
                        pressed && { backgroundColor: colors.bgSoft },
                      ]}
                    >
                      <View style={styles.itemIconBox}>
                        <AppIcon name={item.icon} size={20} color={colors.primary} />
                      </View>
                      <View style={styles.itemTextBox}>
                        <Text style={styles.itemTitle}>{t(item.titleKey)}</Text>
                        <Text style={styles.itemDesc}>{t(item.descKey)}</Text>
                      </View>
                      <AppIcon
                        name={isAr ? "chevron-back" : "chevron-forward"}
                        size={16}
                        color={colors.textMuted}
                      />
                    </Pressable>
                    {itemIdx < visibleItems.length - 1 && <View style={styles.itemDivider} />}
                  </React.Fragment>
                ))}
              </Card>
            </View>
          );
        })}

        {/* Sign Out Button */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && { opacity: 0.8 },
          ]}
        >
          <AppIcon name="log-out" size={18} color={colors.danger} />
          <Text style={styles.signOutText}>{t("nav.signOut")}</Text>
        </Pressable>
      </ScrollView>

      {/* Brand Switcher Modal Sheet */}
      <ModalSheet
        visible={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        title={isAr ? "اختر المتجر أو العلامة التجارية" : "Select Brand / Storefront"}
      >
        <View style={styles.brandList}>
          {brands.map((b) => {
            const isSelected = b.id === activeBrand?.id;
            return (
              <Pressable
                key={b.id}
                onPress={() => {
                  setActiveBrandId(b.id);
                  setBrandModalOpen(false);
                }}
                style={[
                  styles.brandOption,
                  isSelected && styles.brandOptionSelected,
                ]}
              >
                <View style={styles.brandOptionAvatar}>
                  <Text style={styles.brandOptionAvatarText}>
                    {(b.name_ar || b.name_en || "B").slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.brandOptionName, isSelected && { color: colors.primary }]}>
                    {isAr ? b.name_ar || b.name_en : b.name_en || b.name_ar}
                  </Text>
                  <Text style={styles.brandOptionSlug}>@{b.slug}</Text>
                </View>
                {isSelected && (
                  <AppIcon name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
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
    gap: 16,
  },
  profileCard: {
    padding: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: colors.primaryFg,
    fontSize: 20,
    fontWeight: "800",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  roleBadgeRow: {
    marginTop: 6,
    flexDirection: "row",
  },
  langBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  langBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  langBannerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  sectionContainer: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: 4,
  },
  sectionCard: {
    padding: 0,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    minHeight: 56,
  },
  itemIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTextBox: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  itemDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 62,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.danger,
  },
  brandList: {
    gap: 10,
    paddingVertical: 8,
  },
  brandOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 12,
  },
  brandOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.brandSoft,
  },
  brandOptionAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandOptionAvatarText: {
    color: colors.primaryFg,
    fontWeight: "700",
    fontSize: 15,
  },
  brandOptionName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  brandOptionSlug: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
