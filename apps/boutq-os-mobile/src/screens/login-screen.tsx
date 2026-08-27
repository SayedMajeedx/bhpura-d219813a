import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Field, PrimaryButton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors } from "@/theme";

export function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await auth.signIn(email.trim(), password);
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.mark}>
          <Text style={styles.markText}>B</Text>
        </View>
        <Text style={styles.eyebrow}>BOUTQ OS</Text>
        <Text style={styles.title}>إدارة متجرك، من أي مكان</Text>
        <Text style={styles.subtitle}>استخدم نفس حساب الأدمن الموجود في الموقع.</Text>
        <View style={styles.form}>
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            secureTextEntry
            placeholder="كلمة المرور"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
          />
          {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
          <PrimaryButton
            title="تسجيل الدخول"
            onPress={() => void submit()}
            loading={submitting}
            disabled={!email.trim() || !password}
          />
        </View>
        <Text style={styles.security}>دخول مشفّر • الصلاحيات مطابقة للنظام الحالي</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 26 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    marginBottom: 18,
  },
  markText: { color: "#fff", fontSize: 30, fontWeight: "900" },
  eyebrow: {
    color: colors.brand,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "right",
    marginBottom: 9,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 42,
    fontWeight: "900",
    textAlign: "right",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    textAlign: "right",
    marginTop: 8,
    marginBottom: 28,
  },
  form: { gap: 12 },
  error: { color: colors.danger, textAlign: "right", fontWeight: "700" },
  security: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 24 },
});
