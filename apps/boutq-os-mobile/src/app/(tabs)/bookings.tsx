import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppTopBar } from "@/components/topbar";
import { useI18n } from "@/lib/i18n";
import { BookingsView } from "../more/bookings";

/** Bookings in a store that takes them: the tab bar's own screen. */
export default function BookingsTab() {
  const { t } = useI18n();
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <AppTopBar title={t("nav.bookings")} />
      <BookingsView embedded />
    </SafeAreaView>
  );
}
