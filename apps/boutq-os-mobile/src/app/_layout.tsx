import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTitleAlign: "center",
            headerTintColor: "#330A0A",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: "#FFF9F7" },
            contentStyle: { backgroundColor: "#FFF9F7" },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="orders" options={{ title: "الطلبات" }} />
          <Stack.Screen name="order/[id]" options={{ title: "تفاصيل الطلب" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
