/**
 * A store's one launch checklist (the ease-of-use review of 2026-11-28). The dashboard said
 * "3 of 3, your store is set up" while Settings said "2 / 7": two lists that counted different
 * things. There is now one: the setup steps Settings checks (`evaluateStoreReadiness`, the
 * add-ons' own checks), then the two steps that take a store live, read here: its link shared,
 * and its first order (a first booking for a store that takes bookings). The dashboard and the
 * Settings page draw the same steps and the same count.
 */
import { CalendarCheck, ReceiptText, Share2 } from "lucide-react";
import { countOf } from "@/lib/arabic-count";
import type { ReadinessItem } from "@/features/launch/lib/setup-steps";

type Lang = "ar" | "en";

/** A step of the launch checklist: a setup step, or one of the two that take the store live. */
export type LaunchStep = ReadinessItem & {
  /** A step the merchant may also mark done by hand (nothing in the data can always tell). */
  manual?: "previewed" | "sale";
  /** A page outside the admin the step opens, in a new tab (the storefront). */
  external?: string;
};

/**
 * "Share your store" is done once the merchant says so (they previewed it, copied its link, or
 * marked it), or once the store has orders: shoppers found it, so it was shared. It once waited
 * for a tap on a store with 15 orders.
 */
export function shareStepDone({ marked, orders }: { marked: boolean; orders: number }) {
  return marked || orders > 0;
}

export function goLiveSteps({
  lang,
  services,
  previewed,
  saleMarked,
  orders,
  storefrontUrl,
}: {
  lang: Lang;
  /** A store that takes bookings: its first is a booking. */
  services: boolean;
  previewed: boolean;
  saleMarked: boolean;
  /** How many orders the store has had (a booking has its order too). */
  orders: number;
  storefrontUrl: string;
}): LaunchStep[] {
  const ar = lang === "ar";
  const shared = shareStepDone({ marked: previewed, orders });
  const sold = orders > 0 || saleMarked;
  return [
    {
      id: "share",
      icon: Share2,
      title: ar ? "عاين متجرك وشارك رابطه" : "Preview and share your store",
      description: shared
        ? ar
          ? "رابط متجرك جاهز للمشاركة مع عملائك"
          : "Your store's link is ready to share"
        : ar
          ? "شاهد كيف يبدو على الجوال، ثم شارك رابطه"
          : "See how it looks on a phone, then share its link",
      isComplete: shared,
      actionType: "link",
      external: storefrontUrl,
      manual: "previewed",
      actionLabel: ar ? "معاينة المتجر" : "Preview store",
      editLabel: ar ? "معاينة" : "Preview",
    },
    {
      id: "first-sale",
      icon: services ? CalendarCheck : ReceiptText,
      title: services
        ? ar
          ? "استقبل أول حجز"
          : "Receive your first booking"
        : ar
          ? "استقبل أول طلب"
          : "Receive your first order",
      description:
        orders > 0
          ? ar
            ? `حتى الآن: ${countOf(orders, services ? "booking" : "order", "ar")}`
            : `So far: ${countOf(orders, services ? "booking" : "order", "en")}`
          : services
            ? ar
              ? "شارك رابطك لتصلك الحجوزات، أو أضف حجزاً من التقويم"
              : "Share your link for bookings, or add one from the calendar"
            : ar
              ? "شارك رابطك لتصلك الطلبات، أو سجّل طلباً يدوياً"
              : "Share your link for orders, or record one by hand",
      isComplete: sold,
      actionType: "link",
      page: services ? "bookings" : "orders",
      manual: orders > 0 ? undefined : "sale",
      actionLabel: services ? (ar ? "الحجوزات" : "Bookings") : ar ? "الطلبات" : "Orders",
      editLabel: ar ? "فتح" : "Open",
    },
  ];
}

export type LaunchView = "full" | "line" | "hidden";

/**
 * How much room the checklist takes on the dashboard: the whole card for a new store, one line
 * once half its steps are done (as Settings folds it, `readinessFolded`), so a store's figures
 * come first, and none once it is launched or dismissed.
 */
export function launchView({
  completed,
  total,
  dismissed,
}: {
  completed: number;
  total: number;
  dismissed: boolean;
}): LaunchView {
  if (dismissed || total === 0 || completed >= total) return "hidden";
  return completed * 2 >= total ? "line" : "full";
}

/** The steps still to do, first in the list's own order: the dashboard shows the next few. */
export function nextSteps<T extends { isComplete: boolean }>(steps: readonly T[], count = 3): T[] {
  return steps.filter((step) => !step.isComplete).slice(0, count);
}
