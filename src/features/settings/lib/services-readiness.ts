import { CalendarCheck, HelpCircle, ImageOff, Phone, type LucideIcon } from "lucide-react";
import { normalizeWhatsAppDigits } from "@/lib/storefront-mode";
import type { BookingPolicy } from "@/lib/bookings/policies";
import { arNoun } from "@/lib/arabic-count";

/**
 * What a services store needs before it opens, beyond the shop's steps (go-live review of Aurora,
 * 2026-10-26: it read 5 of 6 while a customer could not reach it and it had no booking terms):
 * a way for a customer to reach it, its booking terms, a few answers to what customers ask, and a
 * photo for every service and package. Each step opens where it is done.
 */

/** How many questions a services store's page should answer before it opens. */
export const MIN_FAQ = 3;

export type ServicesReadinessFacts = {
  whatsappNumber?: string | null;
  phone?: string | null;
  /** The store's booking terms (`booking_policies`), or null when it has written none. */
  policy?: BookingPolicy | null;
  /** How many questions it answers (`store_faq_items`). */
  faqCount: number;
  /** Its active services and packages with no photo at all (`hasProductPhoto`). */
  withoutPhoto: number;
};

export type ServicesReadinessItem = {
  id: "contact" | "booking_terms" | "faq" | "service_photos";
  icon: LucideIcon;
  title: string;
  description: string;
  isComplete: boolean;
  /** Where the step is done: a settings tab and group, or an admin page under the store. */
  tab?: { tabId: "identity"; group: string };
  page?: "bookings" | "inventory";
};

/** Whether the store wrote any booking terms: a balance day, a move limit, or its own text. */
export function hasBookingTerms(policy: BookingPolicy | null | undefined): boolean {
  if (!policy) return false;
  return (
    policy.balance_due_days !== null ||
    policy.reschedule_months !== null ||
    Boolean(policy.terms_ar?.trim()) ||
    Boolean(policy.terms_en?.trim())
  );
}

export function servicesReadinessItems(
  facts: ServicesReadinessFacts,
  isAr: boolean,
): ServicesReadinessItem[] {
  const reachable =
    normalizeWhatsAppDigits(facts.whatsappNumber).length > 0 || Boolean(facts.phone?.trim());
  const terms = hasBookingTerms(facts.policy);
  const answers = facts.faqCount >= MIN_FAQ;
  const photos = facts.withoutPhoto === 0;
  return [
    {
      id: "contact",
      icon: Phone,
      title: isAr
        ? "رقم واتساب أو هاتف يصلك عليه العملاء"
        : "A WhatsApp or phone number customers can reach",
      description: reachable
        ? isAr
          ? "يظهر للعملاء ليسألوا قبل الحجز"
          : "Shown to customers so they can ask before booking"
        : isAr
          ? "بلا رقم لا يستطيع العميل السؤال قبل أن يحجز"
          : "Without one, a customer cannot ask anything before booking",
      isComplete: reachable,
      tab: { tabId: "identity", group: "contact" },
    },
    {
      id: "booking_terms",
      icon: CalendarCheck,
      title: isAr
        ? "شروط الحجز: الإلغاء والعربون والنقل"
        : "Booking terms: cancelling, the deposit, moving",
      description: terms
        ? isAr
          ? "تظهر في صفحة الحجز وفي الفاتورة"
          : "Shown on the booking page and the invoice"
        : isAr
          ? "من صفحة الحجوزات: الإعداد ← شروط الحجز"
          : "From the bookings page: Set up → Booking terms",
      isComplete: terms,
      page: "bookings",
    },
    {
      id: "faq",
      icon: HelpCircle,
      title: isAr
        ? `${arNoun(MIN_FAQ, "question")} على الأقل في الأسئلة الشائعة`
        : `At least ${MIN_FAQ} questions answered`,
      description: isAr
        ? `لديك الآن: ${arNoun(facts.faqCount, "question")}`
        : `You have ${facts.faqCount} now`,
      isComplete: answers,
      page: "bookings",
    },
    {
      id: "service_photos",
      icon: ImageOff,
      title: isAr ? "صورة لكل خدمة وباقة" : "A photo for every service and package",
      description: photos
        ? isAr
          ? "لكل خدمة صورتها"
          : "Every service has its photo"
        : isAr
          ? `بلا صورة: ${arNoun(facts.withoutPhoto, "service")}`
          : `${facts.withoutPhoto} without a photo`,
      isComplete: photos,
      page: "inventory",
    },
  ];
}
