import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { LoginScreen } from "@/screens/login-screen";
import { DashboardScreen } from "@/screens/dashboard-screen";
import { colors } from "@/theme";

export default function IndexScreen() {
  const auth = useAuth();
  if (auth.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (!auth.session || !auth.profile) return <LoginScreen />;
  return <DashboardScreen />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
