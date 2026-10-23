import { formatMoney } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";

/**
 * The WhatsApp messages staff send a customer about a booking: the reminder
 * the day before and the news that it moved. A person sends each one (the
 * page opens the chat with the message written); the system sends nothing.
 */

type MessageFacts = {
  isAr: boolean;
  brandName: string;
  customerName?: string | null;
  reference: string;
  /** "Thursday 8 October". */
  dayLabel: string;
  /** "6:00 PM – 9:00 PM". */
  timeLabel: string;
  /** The booking's place, when it recorded one. */
  place?: string | null;
  /** The public invoice, when the booking has one. */
  link?: string | null;
};

const greeting = (isAr: boolean, name?: string | null) =>
  name ? (isAr ? `مرحباً ${name}،` : `Hello ${name},`) : "";

/** "A reminder of your booking tomorrow": when, where, and the balance still to pay. */
export function bookingReminderMessage(
  facts: MessageFacts & { balance: number; currency: string; tomorrow: boolean },
): string {
  const { isAr, brandName, reference, dayLabel, timeLabel, place, link, balance } = facts;
  const owed = balance > 0 ? formatMoney(balance, facts.currency, isAr ? "ar" : "en") : null;
  const lines = isAr
    ? [
        `تذكير من ${brandName} بموعد حجزك${facts.tomorrow ? " غداً" : ""} (${reference})`,
        `الموعد: ${dayLabel} · ${timeLabel}`,
        place ? `المكان: ${place}` : "",
        owed ? `المتبقي للدفع: ${owed}` : "",
      ]
    : [
        `A reminder from ${brandName} of your booking${facts.tomorrow ? " tomorrow" : ""} (${reference})`,
        `When: ${dayLabel} · ${timeLabel}`,
        place ? `Where: ${place}` : "",
        owed ? `Still to pay: ${owed}` : "",
      ];
  return [greeting(isAr, facts.customerName), ...lines, link ?? ""].filter(Boolean).join("\n");
}

/** "Your booking has moved": the new day and time. */
export function bookingMovedMessage(facts: MessageFacts): string {
  const { isAr, brandName, reference, dayLabel, timeLabel, link } = facts;
  const lines = isAr
    ? [`تم نقل حجزك لدى ${brandName} (${reference})`, `الموعد الجديد: ${dayLabel} · ${timeLabel}`]
    : [
        `Your booking with ${brandName} (${reference}) has moved`,
        `New date: ${dayLabel} · ${timeLabel}`,
      ];
  return [greeting(isAr, facts.customerName), ...lines, link ?? ""].filter(Boolean).join("\n");
}

/** The customer's chat with the message ready, or null when there is no number to reach. */
export function customerChatLink(phone: string | null | undefined, text: string): string | null {
  const chat = whatsappChatUrl(phone);
  return chat ? `${chat}?text=${encodeURIComponent(text)}` : null;
}
