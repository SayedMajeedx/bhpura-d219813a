import React, { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { AppIcon } from "@/components/icons";
import {
  Card,
  EmptyState,
  IconButton,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatTimeAgo } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius, shadow } from "@/theme";

type OrderDetail = {
  id: string;
  brand_id: string;
  invoice_number: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  fulfillment_method: string;
  payment_method: string | null;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  customer_email_snapshot: string | null;
  delivery_address: string | null;
  subtotal: number;
  shipping: number;
  discount: number;
  discount_code: string | null;
  tax_amount: number;
  total: number;
  total_amount?: number;
  paid_amount: number;
  advance_paid: number;
  notes: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  currency: string;
  created_at: string;
  customers?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  shipping_address?: any;
};

type OrderItem = {
  id: string;
  product_id?: string | null;
  variant_id?: string | null;
  description?: string;
  product_name_ar?: string;
  product_name_en?: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
  total_price?: number;
  selected_variant?: {
    size?: string | null;
    color?: string | null;
    sku?: string | null;
  } | null;
  custom_field_values?: Array<{
    label_ar?: string | null;
    label_en?: string | null;
    value: string;
  }> | null;
  image_url?: string | null;
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeBrand, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Modal Sheet states
  const [orderStatusModal, setOrderStatusModal] = useState(false);
  const [paymentStatusModal, setPaymentStatusModal] = useState(false);
  const [fulfillmentStatusModal, setFulfillmentStatusModal] = useState(false);
  const [courierDispatchModal, setCourierDispatchModal] = useState(false);
  const [customerMessageModal, setCustomerMessageModal] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    try {
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select(
          "*, customers(id,name,phone,email)",
        )
        .eq("id", id)
        .maybeSingle();

      if (orderErr) throw orderErr;
      if (!orderData) {
        setOrder(null);
        return;
      }
      setOrder(orderData as OrderDetail);

      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);

      if (itemsErr) throw itemsErr;
      setItems((itemsData ?? []) as OrderItem[]);
    } catch (err: any) {
      Alert.alert(isAr ? "خطأ" : "Error", err.message || "Failed to load order details");
    } finally {
      setLoading(false);
    }
  }, [id, isAr]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const updateOrderFields = async (fields: Partial<OrderDetail>, successMsg?: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      const { error } = await supabase.from("orders").update(fields).eq("id", order.id);
      if (error) throw error;
      setOrder((prev) => (prev ? { ...prev, ...fields } : null));
      if (successMsg) {
        Alert.alert(isAr ? "تم التحديث" : "Updated", successMsg);
      }
    } catch (err: any) {
      Alert.alert(isAr ? "خطأ في التحديث" : "Update Error", err.message || "Failed to update");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState
          title={isAr ? "الطلب غير موجود" : "Order Not Found"}
          description={
            isAr
              ? "قد يكون تم حذف هذا الطلب أو أنك لا تملك صلاحية الوصول إليه."
              : "This order might have been removed or you do not have permission to view it."
          }
        />
      </View>
    );
  }

  const customerName =
    order.customer_name_snapshot || order.customers?.name || (isAr ? "عميل بدون اسم" : "Guest Customer");
  const customerPhone = order.customer_phone_snapshot || order.customers?.phone || "";
  const formattedAddress = order.delivery_address || "—";
  const grandTotal = Number(order.total || order.total_amount || 0);
  const balanceDue = Math.max(0, grandTotal - Number(order.paid_amount || 0));
  const isPaid = balanceDue <= 0.001 || order.payment_status === "paid";
  const storeName = isAr
    ? activeBrand?.name_ar || activeBrand?.name_en || "متجرنا"
    : activeBrand?.name_en || activeBrand?.name_ar || "Our Store";

  const handleCall = () => {
    if (!customerPhone) return;
    const clean = customerPhone.replace(/[^0-9]/g, "");
    void Linking.openURL(`tel:${clean}`);
  };

  const handleWhatsApp = (text?: string) => {
    if (!customerPhone) return;
    const clean = customerPhone.replace(/[^0-9]/g, "");
    const msg = text ? encodeURIComponent(text) : "";
    void Linking.openURL(`https://wa.me/${clean}?text=${msg}`);
  };

  const handleCopyAddress = async () => {
    if (formattedAddress && formattedAddress !== "—") {
      await Clipboard.setStringAsync(formattedAddress);
      Alert.alert(isAr ? "تم النسخ" : "Copied", isAr ? "تم نسخ عنوان التوصيل بنجاح" : "Address copied to clipboard");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Order Header Summary */}
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.invoiceBadge}>
              <Text style={styles.invoiceText}>#{order.invoice_number}</Text>
            </View>
            <Text style={styles.orderDate}>
              {new Date(order.created_at).toLocaleDateString(isAr ? "ar-BH" : "en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>

          <View style={styles.statusPillsRow}>
            <Pressable onPress={() => setOrderStatusModal(true)}>
              <StatusPill status={order.status} />
            </Pressable>
            <Pressable onPress={() => setPaymentStatusModal(true)}>
              <StatusPill status={order.payment_status} />
            </Pressable>
            <Pressable onPress={() => setFulfillmentStatusModal(true)}>
              <StatusPill status={order.fulfillment_status} />
            </Pressable>
          </View>
        </Card>

        {/* Customer Information Card */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.contactActions}>
              {customerPhone ? (
                <>
                  <Pressable onPress={handleCall} style={styles.actionCircle}>
                    <AppIcon name="call" size={16} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => setCustomerMessageModal(true)}
                    style={[styles.actionCircle, { backgroundColor: "#DCF8C6" }]}
                  >
                    <AppIcon name="logo-whatsapp" size={16} color="#25D366" />
                  </Pressable>
                </>
              ) : null}
            </View>
            <Text style={styles.sectionTitle}>{t("customers.title")}</Text>
          </View>

          <View style={styles.customerDetails}>
            <Text style={styles.customerNameText}>{customerName}</Text>
            {customerPhone ? <Text style={styles.customerInfoText}>{customerPhone}</Text> : null}
            {order.customer_email_snapshot ? (
              <Text style={styles.customerInfoText}>{order.customer_email_snapshot}</Text>
            ) : null}
          </View>
        </Card>

        {/* Delivery / Pickup Address Card */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            {formattedAddress && formattedAddress !== "—" ? (
              <Pressable onPress={handleCopyAddress} style={styles.copyBtn}>
                <AppIcon name="copy" size={14} color={colors.primary} />
                <Text style={styles.copyBtnText}>{t("common.copy")}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.sectionTitle}>
              {order.fulfillment_method === "pickup"
                ? (isAr ? "📍 الاستلام من الفرع" : "📍 In-Store Pickup")
                : (isAr ? "🚚 عنوان التوصيل" : "🚚 Delivery Address")}
            </Text>
          </View>

          <Text style={styles.addressText}>{formattedAddress}</Text>

          {order.customer_notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>
                {isAr ? "ملاحظات التوصيل من العميل:" : "Customer Delivery Notes:"}
              </Text>
              <Text style={styles.notesText}>{order.customer_notes}</Text>
            </View>
          ) : null}
        </Card>

        {/* Order Items Breakdown */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.itemCountBadge}>
              {items.length} {isAr ? "منتجات" : "items"}
            </Text>
            <Text style={styles.sectionTitle}>
              {isAr ? "المنتجات المطلوبة" : "Ordered Items"}
            </Text>
          </View>

          {items.length === 0 ? (
            <Text style={styles.emptyItemsText}>
              {isAr ? "لا توجد عناصر مسجلة في هذا الطلب." : "No items recorded in this order."}
            </Text>
          ) : (
            <View style={styles.itemsList}>
              {items.map((item, idx) => {
                const title = isAr
                  ? item.product_name_ar || item.product_name_en || item.description || "منتج"
                  : item.product_name_en || item.product_name_ar || item.description || "Product";
                const lineTotal = item.line_total || item.total_price || item.unit_price * item.quantity;

                return (
                  <View
                    key={item.id || idx}
                    style={[styles.itemRow, idx !== 0 && styles.itemRowBorder]}
                  >
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemTitle}>{title}</Text>
                      {item.selected_variant ? (
                        <Text style={styles.itemVariant}>
                          {[
                            item.selected_variant.size ? `${isAr ? "المقاس: " : "Size: "}${item.selected_variant.size}` : null,
                            item.selected_variant.color ? `${isAr ? "اللون: " : "Color: "}${item.selected_variant.color}` : null,
                            item.selected_variant.sku ? `SKU: ${item.selected_variant.sku}` : null,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.itemPriceWrap}>
                      <Text style={styles.itemLineTotal}>
                        {formatMoney(lineTotal, order.currency || currency)}
                      </Text>
                      <Text style={styles.itemUnitPrice}>
                        {item.quantity} × {formatMoney(item.unit_price, order.currency || currency)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Financial Breakdown & Balances */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {isAr ? "الحسابات والمدفوعات" : "Financial Summary"}
          </Text>

          <View style={styles.financialRows}>
            <View style={styles.finRow}>
              <Text style={styles.finLabel}>{isAr ? "المجموع الفرعي" : "Subtotal"}</Text>
              <Text style={styles.finValue}>
                {formatMoney(order.subtotal || grandTotal, order.currency || currency)}
              </Text>
            </View>

            {Number(order.shipping || 0) > 0 ? (
              <View style={styles.finRow}>
                <Text style={styles.finLabel}>{isAr ? "رسوم التوصيل" : "Delivery Fee"}</Text>
                <Text style={styles.finValue}>
                  {formatMoney(order.shipping, order.currency || currency)}
                </Text>
              </View>
            ) : null}

            {Number(order.discount || 0) > 0 ? (
              <View style={styles.finRow}>
                <Text style={styles.finLabel}>
                  {isAr ? "الخصم" : "Discount"} {order.discount_code ? `(${order.discount_code})` : ""}
                </Text>
                <Text style={[styles.finValue, { color: colors.success }]}>
                  - {formatMoney(order.discount, order.currency || currency)}
                </Text>
              </View>
            ) : null}

            <View style={[styles.finRow, styles.finTotalRow]}>
              <Text style={styles.finTotalLabel}>{isAr ? "الإجمالي النهائي" : "Grand Total"}</Text>
              <Text style={styles.finTotalValue}>
                {formatMoney(grandTotal, order.currency || currency)}
              </Text>
            </View>

            <View style={[styles.finRow, styles.finBalanceRow]}>
              <Text style={styles.finBalanceLabel}>
                {isPaid
                  ? (isAr ? "حالة السداد" : "Payment Status")
                  : (isAr ? "المتبقي للتحصيل (COD)" : "Balance Due (COD)")}
              </Text>
              <Text style={[styles.finBalanceValue, isPaid && { color: colors.success }]}>
                {isPaid ? (isAr ? "مدفوع بالكامل" : "Fully Paid") : formatMoney(balanceDue, order.currency || currency)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Action Triggers Bar */}
        <View style={styles.actionTriggers}>
          <PrimaryButton
            title={isAr ? "إرسال للمندوب عبر واتساب" : "Dispatch Courier via WhatsApp"}
            onPress={() => setCourierDispatchModal(true)}
          />
          <View style={styles.dualActionRow}>
            <SecondaryButton
              title={isAr ? "تعديل حالة الطلب" : "Update Status"}
              onPress={() => setOrderStatusModal(true)}
              style={{ flex: 1 }}
            />
            <SecondaryButton
              title={isAr ? "تعديل مرحلة التجهيز" : "Update Fulfillment"}
              onPress={() => setFulfillmentStatusModal(true)}
              style={{ flex: 1 }}
            />
          </View>
          {!isPaid ? (
            <PrimaryButton
              title={isAr ? "تسجيل سداد المبلغ كاملاً" : "Mark as Fully Paid"}
              onPress={() =>
                updateOrderFields(
                  { payment_status: "paid", paid_amount: grandTotal },
                  isAr ? "تم تسجيل سداد الطلب بالكامل بنجاح" : "Order marked as paid",
                )
              }
            />
          ) : null}
        </View>
      </ScrollView>

      {/* 1. Modal: Order Status Updater */}
      <ModalSheet
        visible={orderStatusModal}
        onClose={() => setOrderStatusModal(false)}
        title={isAr ? "تحديث حالة الطلب" : "Update Order Status"}
      >
        <View style={styles.modalOptionList}>
          {[
            { key: "pending", label: isAr ? "قيد الانتظار" : "Pending" },
            { key: "confirmed", label: isAr ? "مؤكد" : "Confirmed" },
            { key: "processing", label: isAr ? "قيد التجهيز" : "Processing" },
            { key: "shipped", label: isAr ? "جاري التوصيل" : "Shipped" },
            { key: "delivered", label: isAr ? "تم التسليم" : "Delivered" },
            { key: "completed", label: isAr ? "مكتمل" : "Completed" },
            { key: "cancelled", label: isAr ? "ملغي" : "Cancelled" },
          ].map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => {
                void updateOrderFields({ status: opt.key }, isAr ? `تم تحديث الحالة إلى: ${opt.label}` : `Status updated to ${opt.label}`);
                setOrderStatusModal(false);
              }}
              style={[styles.modalOption, order.status === opt.key && styles.modalOptionSelected]}
            >
              <Text
                style={[
                  styles.modalOptionText,
                  order.status === opt.key && styles.modalOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {order.status === opt.key ? <AppIcon name="checkmark" size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      </ModalSheet>

      {/* 2. Modal: Payment Status Updater */}
      <ModalSheet
        visible={paymentStatusModal}
        onClose={() => setPaymentStatusModal(false)}
        title={isAr ? "تحديث حالة الدفع" : "Update Payment Status"}
      >
        <View style={styles.modalOptionList}>
          {[
            { key: "paid", label: isAr ? "مدفوع بالكامل" : "Paid in Full", paidAmount: grandTotal },
            { key: "cod_pending", label: isAr ? "الدفع عند الاستلام (COD)" : "Cash on Delivery (COD)", paidAmount: 0 },
            { key: "pending", label: isAr ? "في انتظار الدفع" : "Pending Payment", paidAmount: 0 },
            { key: "refunded", label: isAr ? "مسترجع" : "Refunded", paidAmount: 0 },
            { key: "failed", label: isAr ? "فشل الدفع" : "Failed", paidAmount: 0 },
          ].map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => {
                void updateOrderFields(
                  { payment_status: opt.key, paid_amount: opt.paidAmount },
                  isAr ? `تم تحديث الدفع إلى: ${opt.label}` : `Payment updated to ${opt.label}`,
                );
                setPaymentStatusModal(false);
              }}
              style={[
                styles.modalOption,
                order.payment_status === opt.key && styles.modalOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.modalOptionText,
                  order.payment_status === opt.key && styles.modalOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {order.payment_status === opt.key ? (
                <AppIcon name="checkmark" size={18} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </ModalSheet>

      {/* 3. Modal: Fulfillment Status Updater */}
      <ModalSheet
        visible={fulfillmentStatusModal}
        onClose={() => setFulfillmentStatusModal(false)}
        title={isAr ? "تحديث مرحلة التجهيز والشحن" : "Update Fulfillment Stage"}
      >
        <View style={styles.modalOptionList}>
          {[
            { key: "pending", label: isAr ? "بانتظار التجهيز" : "Pending Preparation" },
            { key: "packing", label: isAr ? "جاري التجهيز والتغليف" : "Packing" },
            { key: "sent_to_tailor", label: isAr ? "عند الخياط للتفصيل" : "Sent to Tailor" },
            { key: "received_from_tailor", label: isAr ? "مستلم من الخياط" : "Received from Tailor" },
            { key: "ready_for_pickup", label: isAr ? "جاهز للاستلام من الفرع" : "Ready for Pickup" },
            { key: "out_for_delivery", label: isAr ? "خرج مع المندوب للتوصيل" : "Out for Delivery" },
            { key: "delivered", label: isAr ? "تم تسليم الشحنة للعميل" : "Delivered" },
          ].map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => {
                void updateOrderFields(
                  { fulfillment_status: opt.key },
                  isAr ? `تم تحديث التجهيز إلى: ${opt.label}` : `Fulfillment updated to ${opt.label}`,
                );
                setFulfillmentStatusModal(false);
              }}
              style={[
                styles.modalOption,
                order.fulfillment_status === opt.key && styles.modalOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.modalOptionText,
                  order.fulfillment_status === opt.key && styles.modalOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {order.fulfillment_status === opt.key ? (
                <AppIcon name="checkmark" size={18} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </ModalSheet>

      {/* 4. Modal: WhatsApp Courier Dispatch */}
      <ModalSheet
        visible={courierDispatchModal}
        onClose={() => setCourierDispatchModal(false)}
        title={isAr ? "إرسال بيانات الشحنة للمندوب" : "Dispatch Courier Details"}
      >
        <View style={{ gap: 14 }}>
          <Text style={styles.dispatchPreviewLabel}>
            {isAr ? "معاينة نص الرسالة للمندوب:" : "Courier Message Preview:"}
          </Text>
          <View style={styles.dispatchBox}>
            <Text style={styles.dispatchText}>
              {`📦 طلب جديد للتوصيل\nمتجر: ${storeName}\nرقم الفاتورة: #${order.invoice_number}\nالعميل: ${customerName}\nالهاتف: ${customerPhone}\nالعنوان: ${formattedAddress}\nالمبلغ للتحصيل: ${formatMoney(balanceDue, order.currency || currency)}`}
            </Text>
          </View>
          <PrimaryButton
            title={isAr ? "نسخ النص وفتح واتساب" : "Copy & Open WhatsApp"}
            onPress={async () => {
              const text = `📦 طلب جديد للتوصيل\nمتجر: ${storeName}\nرقم الفاتورة: #${order.invoice_number}\nالعميل: ${customerName}\nالهاتف: ${customerPhone}\nالعنوان: ${formattedAddress}\nالمبلغ للتحصيل: ${formatMoney(balanceDue, order.currency || currency)}`;
              await Clipboard.setStringAsync(text);
              setCourierDispatchModal(false);
              void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
            }}
          />
        </View>
      </ModalSheet>

      {/* 5. Modal: Customer WhatsApp Message Presets */}
      <ModalSheet
        visible={customerMessageModal}
        onClose={() => setCustomerMessageModal(false)}
        title={isAr ? "مراسلة العميل عبر واتساب" : "Message Customer on WhatsApp"}
      >
        <View style={{ gap: 12 }}>
          <Text style={styles.dispatchPreviewLabel}>
            {isAr ? "اختر قالباً للإرسال:" : "Select Message Template:"}
          </Text>
          <Pressable
            style={styles.messagePresetBtn}
            onPress={() => {
              const msg = isAr
                ? `مرحباً ${customerName} 🌸\nتم تأكيد طلبك رقم #${order.invoice_number} بنجاح لدى متجر ${storeName}.\nشكراً لتسوقك معنا!`
                : `Hello ${customerName} 🌸\nYour order #${order.invoice_number} is confirmed at ${storeName}.\nThank you for shopping with us!`;
              handleWhatsApp(msg);
              setCustomerMessageModal(false);
            }}
          >
            <Text style={styles.presetTitle}>✅ {isAr ? "تأكيد استلام الطلب" : "Order Confirmed"}</Text>
            <Text style={styles.presetSubtitle}>
              {isAr ? "إشعار العميل بتأكيد طلبه وبدء التجهيز" : "Notify customer of order confirmation"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.messagePresetBtn}
            onPress={() => {
              const msg = isAr
                ? `مرحباً ${customerName} 🚗\nشحنتك للطلب #${order.invoice_number} خرجت الآن للتوصيل مع المندوب.\nالمبلغ للتحصيل: ${formatMoney(balanceDue, order.currency || currency)}.\nنتمنى لك يوماً جميلاً!`
                : `Hello ${customerName} 🚗\nYour order #${order.invoice_number} is out for delivery with our courier.\nBalance due: ${formatMoney(balanceDue, order.currency || currency)}.\nHave a wonderful day!`;
              handleWhatsApp(msg);
              setCustomerMessageModal(false);
            }}
          >
            <Text style={styles.presetTitle}>🚚 {isAr ? "خرج للتوصيل مع المندوب" : "Out for Delivery"}</Text>
            <Text style={styles.presetSubtitle}>
              {isAr ? "إشعار العميل بأن الشحنة في الطريق إليه" : "Notify customer that courier is on the way"}
            </Text>
          </Pressable>
        </View>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 60,
  },
  headerCard: {
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  invoiceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
  },
  invoiceText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  orderDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statusPillsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  sectionCard: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  contactActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  customerDetails: {
    gap: 4,
  },
  customerNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  customerInfoText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  addressText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  notesBox: {
    backgroundColor: colors.bgSoft,
    padding: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  notesText: {
    fontSize: 13,
    color: colors.text,
  },
  itemCountBadge: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyItemsText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  itemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  itemDetails: {
    flex: 1,
    marginRight: 10,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  itemVariant: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemPriceWrap: {
    alignItems: "flex-end",
  },
  itemLineTotal: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  itemUnitPrice: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  financialRows: {
    gap: 8,
  },
  finRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  finLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  finValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  finTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  finTotalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  finTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  finBalanceRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  finBalanceLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  finBalanceValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.danger,
  },
  actionTriggers: {
    gap: 10,
    marginTop: 8,
  },
  dualActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  modalOptionList: {
    gap: 8,
    paddingVertical: 6,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
  },
  modalOptionSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  modalOptionTextActive: {
    fontWeight: "800",
    color: colors.primary,
  },
  dispatchPreviewLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  dispatchBox: {
    backgroundColor: colors.bgSoft,
    padding: 14,
    borderRadius: radius.md,
  },
  dispatchText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  messagePresetBtn: {
    backgroundColor: colors.bgSoft,
    padding: 14,
    borderRadius: radius.md,
    gap: 4,
  },
  presetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  presetSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
