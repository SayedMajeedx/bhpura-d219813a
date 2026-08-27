import React from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { colors, shadow } from "@/theme";
import { AppIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function TabLayout() {
  const { isCourier } = useAuth();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.dashboard"),
          href: isCourier ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="grid" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t("nav.orders"),
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="receipt" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: t("nav.inventory"),
          href: isCourier ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="cube" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t("nav.customers"),
          href: isCourier ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="people" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("nav.more"),
          tabBarIcon: ({ color, size }) => (
            <AppIcon name="menu" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    height: Platform.OS === "ios" ? 86 : 68,
    paddingBottom: Platform.OS === "ios" ? 28 : 10,
    paddingTop: 8,
    ...shadow.card,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  tabItem: {
    paddingVertical: 2,
  },
});
