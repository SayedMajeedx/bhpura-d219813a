/**
 * The alerts a device can take (Settings → Account → Mobile Apps, `OrderAlertsSettings`), in the
 * order a merchant thinks of them: what a customer just did first, then the store's own matters.
 * The keys are the push queue's event kinds (`push_notification_events`), and
 * `order_new_staff` is a new order a member of staff typed in themselves (migration
 * 20261028110000, read by the sender's `alertChoice`). New orders, booking requests and gift card
 * purchases (migration 20261105100000) are on by default; the rest wait to be chosen.
 */

export type AlertKind =
  | "order_new"
  | "booking_new"
  | "gift_card_new"
  | "order_new_staff"
  | "order_updated"
  | "review_completed"
  | "review_due"
  | "low_stock"
  | "system_failure";

type AlertKindDef = {
  key: AlertKind;
  label: { ar: string; en: string };
  hint: { ar: string; en: string };
  defaultOn: boolean;
  /** Shown only to a store with this module (a store that takes bookings). */
  module?: "bookings";
};

export const ALERT_KINDS: readonly AlertKindDef[] = [
  {
    key: "order_new",
    label: { ar: "طلب جديد من المتجر", en: "New order from the store" },
    hint: { ar: "كل طلب يضعه عميل", en: "Every order a customer places" },
    defaultOn: true,
  },
  {
    key: "booking_new",
    label: { ar: "طلب حجز جديد", en: "New booking request" },
    hint: { ar: "حجز ينتظر ردّك", en: "A booking waiting for your answer" },
    defaultOn: true,
    module: "bookings",
  },
  {
    key: "gift_card_new",
    label: { ar: "شراء بطاقة هدية", en: "Gift card purchase" },
    hint: {
      ar: "تحويل ينتظر التحقق، أو بطاقة دُفعت على المتجر",
      en: "A transfer to check, or a card paid on the store",
    },
    defaultOn: true,
  },
  {
    key: "order_new_staff",
    label: { ar: "طلب أضافه فريق العمل", en: "Order added by staff" },
    hint: { ar: "طلب كتبه أحد الفريق بنفسه", en: "An order a team member typed in" },
    defaultOn: false,
  },
  {
    key: "order_updated",
    label: { ar: "تحديث على طلب", en: "Order updates" },
    hint: { ar: "تغيّر الحالة أو الدفع أو المرحلة", en: "Status, payment or stage changes" },
    defaultOn: false,
  },
  {
    key: "review_completed",
    label: { ar: "تقييم جديد", en: "New review" },
    hint: { ar: "عميل قيّم طلبه", en: "A customer reviewed their order" },
    defaultOn: false,
  },
  {
    key: "review_due",
    label: { ar: "حان طلب التقييم", en: "Time to ask for a review" },
    hint: { ar: "بعد التسليم بثلاثة أيام", en: "Three days after delivery" },
    defaultOn: false,
  },
  {
    key: "low_stock",
    label: { ar: "مخزون منخفض", en: "Low stock" },
    hint: { ar: "منتج أو مادة تغليف قاربت على النفاد", en: "A product or packaging running low" },
    defaultOn: false,
  },
  {
    key: "system_failure",
    label: { ar: "تعذّر إرسال رسالة", en: "A message failed to send" },
    hint: { ar: "بريد طلب أو رسالة واتساب لم تصل", en: "An order email or WhatsApp message" },
    defaultOn: false,
  },
];

/** The kinds this store offers: a booking request only where the store takes bookings. */
export function alertKindsFor(modules: { bookings?: boolean } | null | undefined) {
  return ALERT_KINDS.filter((kind) => !kind.module || Boolean(modules?.[kind.module]));
}

/** Whether a kind is on for a device: its saved choice, else the kind's default. */
export function alertOn(choices: Record<string, unknown> | null | undefined, kind: AlertKindDef) {
  const saved = choices?.[kind.key];
  return typeof saved === "boolean" ? saved : kind.defaultOn;
}
