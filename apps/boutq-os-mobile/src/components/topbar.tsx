import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { colors, radius } from "@/theme";
import { AppIcon } from "./icons";

interface AppTopBarProps {
  title?: string;
  subtitle?: string;
  showBrandSwitcher?: boolean;
  onOpenBrandSwitcher?: () => void;
  rightAction?: {
    icon: string;
    onPress: () => void;
  };
}

export function AppTopBar({
  title,
  subtitle,
  showBrandSwitcher = false,
  onOpenBrandSwitcher,
  rightAction,
}: AppTopBarProps) {
  const { activeBrand, brands } = useAuth();
  const { lang, toggleLang, isAr } = useI18n();

  const brandName = isAr
    ? activeBrand?.name_ar || activeBrand?.name_en || "بوتيك OS"
    : activeBrand?.name_en || activeBrand?.name_ar || "Boutq OS";

  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        {showBrandSwitcher ? (
          <Pressable
            onPress={onOpenBrandSwitcher}
            style={({ pressed }) => [
              styles.brandTrigger,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>
                {brandName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.brandTitles}>
              <View style={styles.brandRow}>
                <Text style={styles.brandTitle} numberOfLines={1}>
                  {brandName}
                </Text>
                {brands.length > 1 && (
                  <AppIcon name="chevron-down" size={14} color={colors.text} />
                )}
              </View>
              {subtitle ? (
                <Text style={styles.subtitleText}>{subtitle}</Text>
              ) : null}
            </View>
          </Pressable>
        ) : (
          <View>
            <Text style={styles.titleText}>{title}</Text>
            {subtitle ? (
              <Text style={styles.subtitleText}>{subtitle}</Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={toggleLang}
          style={({ pressed }) => [
            styles.langToggle,
            pressed && { opacity: 0.8 },
          ]}
        >
          <AppIcon name="globe" size={14} color={colors.primary} />
          <Text style={styles.langToggleText}>
            {lang === "ar" ? "EN" : "عربي"}
          </Text>
        </Pressable>

        {rightAction ? (
          <Pressable
            onPress={rightAction.onPress}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <AppIcon name={rightAction.icon} size={18} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  leftCol: {
    flex: 1,
    marginRight: 12,
  },
  brandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandBadgeText: {
    color: colors.primaryFg,
    fontSize: 16,
    fontWeight: "700",
  },
  brandTitles: {
    flex: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  titleText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  subtitleText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  langToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
