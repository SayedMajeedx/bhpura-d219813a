import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Card, StatusPill } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

type OrderDetail = {
  invoice_number: number;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  customer_email_snapshot: string | null;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  fulfillment_method: string;
  payment_method: string | null;
  subtotal: number;
  shipping: number;
  discount: number;
  tax_amount: number;
  total: number;
  currency: string;
  created_at: string;
  notes: string | null;
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("orders")
      .select(
        "invoice_number,customer_name_snapshot,customer_phone_snapshot,customer_email_snapshot,status,payment_status,fulfillment_status,fulfillment_method,payment_method,subtotal,shipping,discount,tax_amount,total,currency,created_at,notes",
      )
      .eq("id", id)
      .maybeSingle();
    setOrder(data as OrderDetail | null);
    setLoading(false);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  if (!order)
    return (
      <View style={styles.loading}>
        <Text style={styles.muted}>الطلب غير موجود أو لا تملك صلاحية عرضه.</Text>
      </View>
    );
  const phone = (order.customer_phone_snapshot ?? "").replace(/\D/g, "");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <StatusPill status={order.status} />
        <View>
          <Text style={styles.invoice}>طلب #{order.invoice_number}</Text>
          <Text style={styles.muted}>{new Date(order.created_at).toLocaleString("ar-BH")}</Text>
        </View>
      </View>
      <Card>
        <Text style={styles.title}>العميل</Text>
        <Text style={styles.value}>{order.customer_name_snapshot || "عميل"}</Text>
        {phone ? (
          <Pressable onPress={() => void Linking.openURL(`https://wa.me/${phone}`)}>
            <Text style={styles.whatsapp}>مراسلة {order.customer_phone_snapshot} عبر واتساب</Text>
          </Pressable>
        ) : null}
        {order.customer_email_snapshot ? (
          <Text style={styles.muted}>{order.customer_email_snapshot}</Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.title}>الحالة والتنفيذ</Text>
        <Detail label="حالة الدفع" value={order.payment_status} />
        <Detail label="حالة التجهيز" value={order.fulfillment_status} />
        <Detail label="طريقة التسليم" value={order.fulfillment_method} />
        <Detail label="طريقة الدفع" value={order.payment_method || "—"} />
      </Card>
      <Card>
        <Text style={styles.title}>ملخص المبلغ</Text>
        <Detail
          label="المجموع الفرعي"
          value={`${Number(order.subtotal).toFixed(3)} ${order.currency}`}
        />
        <Detail label="التوصيل" value={`${Number(order.shipping).toFixed(3)} ${order.currency}`} />
        <Detail label="الخصم" value={`${Number(order.discount).toFixed(3)} ${order.currency}`} />
        <Detail
          label="الضريبة"
          value={`${Number(order.tax_amount).toFixed(3)} ${order.currency}`}
        />
        <View style={styles.totalRow}>
          <Text style={styles.total}>
            {Number(order.total).toFixed(3)} {order.currency}
          </Text>
          <Text style={styles.totalLabel}>الإجمالي</Text>
        </View>
      </Card>
      {order.notes ? (
        <Card>
          <Text style={styles.title}>ملاحظات</Text>
          <Text style={styles.note}>{order.notes}</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailValue}>{value.replaceAll("_", " ")}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 13 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  invoice: { color: colors.brand, fontSize: 24, fontWeight: "900", textAlign: "right" },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
    marginBottom: 13,
  },
  value: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "right" },
  muted: { color: colors.muted, textAlign: "right", marginTop: 5 },
  whatsapp: { color: colors.success, fontWeight: "800", textAlign: "right", marginTop: 12 },
  detail: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailValue: { color: colors.text, fontWeight: "700" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 15,
  },
  total: { color: colors.brand, fontSize: 21, fontWeight: "900" },
  totalLabel: { color: colors.text, fontSize: 17, fontWeight: "900" },
  note: { color: colors.text, textAlign: "right", lineHeight: 24 },
});
