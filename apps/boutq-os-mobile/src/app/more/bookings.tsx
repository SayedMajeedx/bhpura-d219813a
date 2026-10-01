import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, EmptyState, SegmentedControl, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/format";
import { addDays, byDay, clockAt, dayTitle, phoneDigits, placeOf, todayIn } from "@/lib/bookings";
import { colors, radius } from "@/theme";

type Booking = {
  id: string;
  reference: string;
  status: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  location: unknown;
  total: number | string | null;
  discount_amount: number | string | null;
  discount_label_en: string | null;
  discount_label_ar: string | null;
  booking_items: Array<{
    name_en: string | null;
    name_ar: string | null;
    quantity: number;
    parent_item_id: string | null;
  }>;
};

const COLUMNS =
  "id, reference, status, event_date, starts_at, ends_at, customer_name, customer_phone, location, total, discount_amount, discount_label_en, discount_label_ar, booking_items(name_en, name_ar, quantity, parent_item_id)";

/**
 * Bookings in the merchant app: requests waiting (confirm or decline, the
 * day's place checked by the database) and the confirmed bookings coming up,
 * with a tap to call or message the customer.
 */
export function BookingsView({ embedded = false }: { embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const { activeBrandId } = useAuth();
  const { t, isAr } = useI18n();
  const [tab, setTab] = useState<"requests" | "upcoming">("requests");
  const [timezone, setTimezone] = useState("Asia/Bahrain");
  const [currency, setCurrency] = useState("BHD");
  const [requests, setRequests] = useState<Booking[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBrandId) return;
    try {
      const [{ data: settings }, { data: business }] = await Promise.all([
        supabase
          .from("booking_settings")
          .select("timezone")
          .eq("brand_id", activeBrandId)
          .maybeSingle(),
        supabase
          .from("business_settings")
          .select("currency")
          .eq("brand_id", activeBrandId)
          .maybeSingle(),
      ]);
      const tz = settings?.timezone || "Asia/Bahrain";
      setTimezone(tz);
      setCurrency(business?.currency || "BHD");
      const today = todayIn(tz);
      const [waiting, coming] = await Promise.all([
        supabase
          .from("bookings")
          .select(COLUMNS)
          .eq("brand_id", activeBrandId)
          .eq("status", "requested")
          .order("event_date", { ascending: true })
          .limit(100),
        supabase
          .from("bookings")
          .select(COLUMNS)
          .eq("brand_id", activeBrandId)
          .eq("status", "confirmed")
          .gte("event_date", today)
          .lte("event_date", addDays(today, 30))
          .order("starts_at", { ascending: true }),
      ]);
      setRequests((waiting.data ?? []) as Booking[]);
      setUpcoming((coming.data ?? []) as Booking[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeBrandId]);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = async (booking: Booking, status: "confirmed" | "cancelled") => {
    setBusyId(booking.id);
    const { error } = await supabase.rpc("set_booking_status", {
      p_booking_id: booking.id,
      p_status: status,
    });
    setBusyId(null);
    if (error) {
      Alert.alert(
        /BOOKING_DAY_(FULL|BLOCKED|CLOSED)/.test(error.message)
          ? t("bookings.dayFull")
          : t("bookings.failed"),
      );
      return;
    }
    Alert.alert(status === "confirmed" ? t("bookings.confirmed") : t("bookings.declined"));
    void load();
  };

  const services = (booking: Booking) =>
    booking.booking_items
      // The services a package includes are under it on the web; here the package reads once.
      .filter((item) => !item.parent_item_id)
      .map((item) => {
        const name = (isAr ? item.name_ar || item.name_en : item.name_en || item.name_ar) ?? "";
        return item.quantity > 1 ? `${name} × ${item.quantity}` : name;
      })
      .filter(Boolean)
      .join(isAr ? "، " : ", ");

  const renderBooking = (booking: Booking, withActions: boolean) => {
    const phone = phoneDigits(booking.customer_phone);
    const place = placeOf(booking.location);
    return (
      <Card key={booking.id} style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.time}>
            {clockAt(booking.starts_at, timezone, isAr)} –{" "}
            {clockAt(booking.ends_at, timezone, isAr)}
          </Text>
          <StatusPill status={booking.status} customLabel={booking.reference} />
        </View>
        {booking.customer_name ? (
          <Text style={styles.customer}>{booking.customer_name}</Text>
        ) : null}
        {services(booking) ? <Text style={styles.muted}>{services(booking)}</Text> : null}
        {place ? <Text style={styles.muted}>{place}</Text> : null}
        {Number(booking.discount_amount ?? 0) > 0 ? (
          <Text style={styles.muted}>
            {(isAr
              ? booking.discount_label_ar || booking.discount_label_en
              : booking.discount_label_en || booking.discount_label_ar) ?? t("bookings.discount")}
            {" · −"}
            {formatMoney(Number(booking.discount_amount), currency)}
          </Text>
        ) : null}
        <View style={styles.rowBetween}>
          <Text style={styles.total}>{formatMoney(Number(booking.total ?? 0), currency)}</Text>
          {phone ? (
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isAr ? "اتصال" : "Call"}
                style={styles.iconButton}
                onPress={() => void Linking.openURL(`tel:+${phone}`)}
              >
                <AppIcon name="call" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="WhatsApp"
                style={styles.iconButton}
                onPress={() => void Linking.openURL(`https://wa.me/${phone}`)}
              >
                <AppIcon name="logo-whatsapp" size={18} color={colors.primary} />
              </Pressable>
            </View>
          ) : null}
        </View>
        {withActions ? (
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              disabled={busyId === booking.id}
              style={[styles.action, styles.actionPrimary]}
              onPress={() => void answer(booking, "confirmed")}
            >
              <Text style={styles.actionPrimaryText}>{t("bookings.confirm")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busyId === booking.id}
              style={styles.action}
              onPress={() => void answer(booking, "cancelled")}
            >
              <Text style={styles.actionText}>{t("bookings.decline")}</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    );
  };

  const list = tab === "requests" ? requests : upcoming;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      {embedded ? null : <Text style={styles.title}>{t("nav.bookings")}</Text>}
      <Text style={styles.muted}>{t("bookings.subtitle")}</Text>
      <SegmentedControl
        options={[
          { value: "requests" as const, label: t("bookings.requests"), count: requests.length },
          { value: "upcoming" as const, label: t("bookings.upcoming"), count: upcoming.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : list.length === 0 ? (
        <EmptyState
          title={tab === "requests" ? t("bookings.noRequests") : t("bookings.noUpcoming")}
        />
      ) : (
        byDay(list).map(([day, bookings]) => (
          <View key={day} style={{ gap: 8 }}>
            <Text style={styles.day}>{dayTitle(day, isAr)}</Text>
            {bookings.map((booking) => renderBooking(booking, tab === "requests"))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  day: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 4 },
  card: { gap: 6 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  time: { fontSize: 15, fontWeight: "700", color: colors.text },
  customer: { fontSize: 14, fontWeight: "600", color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  total: { fontSize: 14, fontWeight: "700", color: colors.text },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSoft,
  },
  action: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { fontSize: 14, fontWeight: "600", color: colors.text },
  actionPrimaryText: { fontSize: 14, fontWeight: "700", color: colors.primaryFg },
});

export default function BookingsScreen() {
  return <BookingsView />;
}
