import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { colors, shadow } from "@/theme";

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} style={styles.field} {...props} />;
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const done = ["completed", "delivered", "paid"].includes(normalized);
  const warning = ["pending", "confirmed", "processing", "ready_for_pickup"].includes(normalized);
  return (
    <View style={[styles.pill, done ? styles.pillDone : warning ? styles.pillWarning : null]}>
      <Text style={[styles.pillText, done ? styles.doneText : warning ? styles.warningText : null]}>
        {status.replaceAll("_", " ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    ...shadow,
  },
  field: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: colors.text,
    backgroundColor: "#fff",
    textAlign: "right",
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#F0EEEE",
  },
  pillDone: { backgroundColor: "#E5F7EF" },
  pillWarning: { backgroundColor: "#FFF3DC" },
  pillText: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  doneText: { color: colors.success },
  warningText: { color: colors.warning },
});
