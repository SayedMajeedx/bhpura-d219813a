import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { colors, radius, shadow } from "@/theme";

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[] | any;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string; style?: any }) {
  return (
    <View style={styles.fieldContainer}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.field, props.multiline && styles.fieldMultiline, style]}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = "ابحث هنا...",
  onClear,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.searchContainer, style]}>
      <View style={styles.searchIcon}>
        <AppIcon name="search" size={18} color={colors.muted} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable onPress={onClear || (() => onChangeText(""))} style={styles.searchClear}>
          <AppIcon name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  style,
  variant = "brand",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  variant?: "brand" | "success" | "danger" | "dark";
}) {
  const bgStyle =
    variant === "success"
      ? styles.btnSuccess
      : variant === "danger"
        ? styles.btnDanger
        : variant === "dark"
          ? styles.btnDark
          : styles.btnBrand;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        bgStyle,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
          <Text style={styles.primaryButtonText}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.secondaryPressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.buttonContent}>
        {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
        <Text style={styles.secondaryButtonText}>{title}</Text>
      </View>
    </Pressable>
  );
}

export function IconButton({
  onPress,
  icon,
  style,
  disabled,
  variant = "subtle",
}: {
  onPress: () => void;
  icon: ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
  variant?: "subtle" | "brand" | "danger" | "success";
}) {
  const bg =
    variant === "brand"
      ? styles.iconBtnBrand
      : variant === "danger"
        ? styles.iconBtnDanger
        : variant === "success"
          ? styles.iconBtnSuccess
          : styles.iconBtnSubtle;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        bg,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

export function StatusPill({
  status,
  label,
  customLabel,
  tone,
}: {
  status?: string;
  label?: string;
  customLabel?: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral" | "primary";
}) {
  const text = customLabel || label || (status ? status.replaceAll("_", " ") : "—");
  const normalized = (status || "").toLowerCase();

  let resolvedTone = tone;
  if (!resolvedTone) {
    if (["paid", "completed", "delivered", "مكتمل"].includes(normalized)) resolvedTone = "success";
    else if (["pending", "cod_pending", "packing", "نشط"].includes(normalized)) resolvedTone = "warning";
    else if (["failed", "cancelled", "canceled", "returned", "ملغى", "معطل"].includes(normalized))
      resolvedTone = "danger";
    else if (
      ["confirmed", "processing", "shipped", "out_for_delivery", "ready_for_pickup"].includes(
        normalized,
      )
    )
      resolvedTone = "info";
    else resolvedTone = "neutral";
  }

  const pillStyle =
    resolvedTone === "success"
      ? styles.pillSuccess
      : resolvedTone === "warning"
        ? styles.pillWarning
        : resolvedTone === "danger"
          ? styles.pillDanger
          : resolvedTone === "info"
            ? styles.pillInfo
            : styles.pillNeutral;

  const textStyle =
    resolvedTone === "success"
      ? styles.textSuccess
      : resolvedTone === "warning"
        ? styles.textWarning
        : resolvedTone === "danger"
          ? styles.textDanger
          : resolvedTone === "info"
            ? styles.textInfo
            : styles.textNeutral;

  return (
    <View style={[styles.pill, pillStyle]}>
      <Text style={[styles.pillText, textStyle]}>{text}</Text>
    </View>
  );
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key?: T; value?: T; label: string; count?: number }>;
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.segmentedScroll}
    >
      {options.map((option) => {
        const itemVal = (option.value ?? option.key) as T;
        const active = itemVal === value;
        return (
          <Pressable
            key={String(itemVal)}
            onPress={() => onChange(itemVal)}
            style={[styles.segmentChip, active && styles.segmentChipActive]}
          >
            {option.count !== undefined ? (
              <View style={[styles.segmentBadge, active && styles.segmentBadgeActive]}>
                <Text style={[styles.segmentBadgeText, active && styles.segmentBadgeTextActive]}>
                  {option.count}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MetricCard({
  title,
  label,
  value,
  subtitle,
  subtext,
  icon,
  tone,
  highlight,
  style,
  onPress,
}: {
  title?: string;
  label?: string;
  value: string | number;
  subtitle?: string;
  subtext?: string;
  icon?: ReactNode;
  tone?: "primary" | "warning" | "danger" | "success" | "info";
  highlight?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const displayTitle = label || title || "";
  const displaySub = subtext || subtitle;

  const isPrimary = highlight || tone === "primary";

  const content = (
    <View style={[styles.metricCard, isPrimary && styles.metricHighlight, style]}>
      <View style={styles.metricHeader}>
        {icon ? <View style={styles.metricIconWrap}>{icon}</View> : null}
        <Text style={[styles.metricTitle, isPrimary && styles.metricHighlightText]}>
          {displayTitle}
        </Text>
      </View>
      <Text style={[styles.metricValue, isPrimary && styles.metricHighlightValue]}>{value}</Text>
      {displaySub ? (
        <Text style={[styles.metricSubtitle, isPrimary && styles.metricHighlightSubtitle]}>
          {displaySub}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export function EmptyState({
  title,
  description,
  icon,
  actionTitle,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionTitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const btnLabel = actionLabel || actionTitle;
  return (
    <View style={styles.emptyState}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {btnLabel && onAction ? (
        <SecondaryButton title={btnLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

export function BrandAvatar({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  const initial = (name || "B").trim().charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandSoft,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.brand, fontWeight: "900", fontSize: size * 0.45 }}>
        {initial}
      </Text>
    </View>
  );
}

export function ModalSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.modalCloseBtn}>
              <AppIcon name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow.card,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  fieldContainer: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: "#fff",
    fontSize: 14,
  },
  fieldMultiline: {
    minHeight: 88,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  fieldError: {
    fontSize: 12,
    color: colors.danger,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 8,
  },
  searchIcon: {},
  searchClear: {
    padding: 4,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    ...shadow.subtle,
  },
  btnBrand: { backgroundColor: colors.brand },
  btnSuccess: { backgroundColor: colors.success },
  btnDanger: { backgroundColor: colors.danger },
  btnDark: { backgroundColor: "#1F1A1A" },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryPressed: {
    backgroundColor: colors.bgSubtle,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSubtle: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnBrand: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  iconBtnSuccess: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.success,
  },
  iconBtnDanger: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonIcon: {},
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillSuccess: { backgroundColor: colors.successBg },
  pillWarning: { backgroundColor: colors.warningBg },
  pillDanger: { backgroundColor: colors.dangerBg },
  pillInfo: { backgroundColor: colors.infoBg },
  pillNeutral: { backgroundColor: "#F0EEEE" },
  pillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
  textDanger: { color: colors.danger },
  textInfo: { color: colors.info },
  textNeutral: { color: colors.muted },
  segmentedScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  segmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#fff",
  },
  segmentBadge: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  segmentBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  segmentBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
  },
  segmentBadgeTextActive: {
    color: "#fff",
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow.card,
  },
  metricHighlight: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricIconWrap: {
    padding: 4,
  },
  metricTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  metricHighlightText: {
    color: "#DDBFBA",
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  metricHighlightValue: {
    color: "#fff",
  },
  metricSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  metricHighlightSubtitle: {
    color: "#F5E8E5",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
  },
  emptyIcon: {
    marginBottom: 14,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyAction: {
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "85%",
    paddingBottom: 30,
    ...shadow.floating,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
});
