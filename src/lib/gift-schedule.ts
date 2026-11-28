import { westernNumeralLocale } from "@/lib/intl-cache";

/**
 * A gift that arrives when the buyer chooses (migration 20261230100000): a day and a time, and how
 * it reaches the person it is for. By email the system sends the gift link from the store's
 * mailbox at that time; by WhatsApp a person at the store sends it once it is due (there is no
 * WhatsApp connection). The database holds the same bounds (`set_gift_card_purchase_schedule`):
 * from a few minutes ahead to a year.
 */

export type GiftSendChannel = "email" | "whatsapp";

export type GiftSchedule = {
  /** "now": the buyer sends the link themselves (as before); "later": on a day and time. */
  mode: "now" | "later";
  /** The day and time on the buyer's own clock, as the date and time fields give them. */
  date: string;
  time: string;
  channel: GiftSendChannel;
  email: string;
  phone: string;
};

export const emptyGiftSchedule = (): GiftSchedule => ({
  mode: "now",
  date: "",
  time: "09:00",
  channel: "email",
  email: "",
  phone: "",
});

/** The earliest a gift may be set for, and the latest. */
export const SCHEDULE_LEAD_MINUTES = 15;
export const SCHEDULE_MAX_DAYS = 365;

export type ScheduleProblem = "when" | "email" | "phone";

/** The moment the buyer picked, on their own clock (null: not a day and time). */
export function scheduledMoment(schedule: Pick<GiftSchedule, "date" | "time">): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date) || !/^\d{2}:\d{2}$/.test(schedule.time)) {
    return null;
  }
  const at = new Date(`${schedule.date}T${schedule.time}:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** What stops the schedule, or null when it can be sent (always null when sent now). */
export function scheduleProblem(schedule: GiftSchedule, now: Date): ScheduleProblem | null {
  if (schedule.mode === "now") return null;
  const at = scheduledMoment(schedule);
  if (
    !at ||
    at.getTime() < now.getTime() + SCHEDULE_LEAD_MINUTES * 60_000 ||
    at.getTime() > now.getTime() + SCHEDULE_MAX_DAYS * 86_400_000
  ) {
    return "when";
  }
  if (schedule.channel === "email") {
    const email = schedule.email.trim();
    return email.length <= 200 && EMAIL.test(email) ? null : "email";
  }
  const digits = schedule.phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? null : "phone";
}

/** What the server is sent, or undefined when the buyer sends the gift themselves. */
export function schedulePayload(
  schedule: GiftSchedule,
): { at: string; channel: GiftSendChannel; email?: string; phone?: string } | undefined {
  const at = schedule.mode === "later" ? scheduledMoment(schedule) : null;
  if (!at) return undefined;
  return schedule.channel === "email"
    ? { at: at.toISOString(), channel: "email", email: schedule.email.trim() }
    : { at: at.toISOString(), channel: "whatsapp", phone: schedule.phone.trim() };
}

/** "12 Dec at 9:00 am", on the reader's clock. */
export function scheduleMomentWords(at: string | Date, lang: "ar" | "en"): string {
  const when = typeof at === "string" ? new Date(at) : at;
  const tag = lang === "ar" ? "ar-BH" : "en-GB";
  const day = when.toLocaleDateString(westernNumeralLocale(tag), {
    day: "numeric",
    month: "short",
  });
  const time = when.toLocaleTimeString(westernNumeralLocale(tag), {
    hour: "numeric",
    minute: "2-digit",
  });
  return lang === "ar" ? `${day}، الساعة ${time}` : `${day} at ${time}`;
}

type Scheduled = {
  send_at?: string | null;
  send_channel?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  recipient_sent_at?: string | null;
};

/**
 * Where a scheduled gift stands, for the buyer and the store: "Arrives by email to … on …", or
 * "Sent to … on …" (null: not scheduled).
 */
export function giftScheduleLine(purchase: Scheduled, lang: "ar" | "en"): string | null {
  if (!purchase.send_at || !purchase.send_channel) return null;
  const email = purchase.send_channel === "email";
  const to = (email ? purchase.recipient_email : purchase.recipient_phone) ?? "";
  if (purchase.recipient_sent_at) {
    const at = scheduleMomentWords(purchase.recipient_sent_at, lang);
    return lang === "ar" ? `أُرسلت الهدية إلى ${to} يوم ${at}` : `Sent to ${to} on ${at}`;
  }
  const at = scheduleMomentWords(purchase.send_at, lang);
  if (lang === "ar") {
    return email
      ? `تصل بالبريد إلى ${to} يوم ${at}`
      : `يرسلها المتجر على واتساب إلى ${to} يوم ${at}`;
  }
  return email
    ? `Arrives by email to ${to} on ${at}`
    : `The store sends it on WhatsApp to ${to} on ${at}`;
}

/** How long past its time an email gift waits before the store is shown it to send by hand. */
export const EMAIL_GRACE_MINUTES = 30;

/**
 * A paid gift whose time has come and that no one has sent: by WhatsApp at once, by email only
 * once the system had its chance (a store with no mailbox, or an email that keeps failing).
 */
export function giftDue(
  purchase: Scheduled & { status?: string | null },
  now: Date,
): GiftSendChannel | null {
  if (purchase.status !== "paid" || !purchase.send_at || purchase.recipient_sent_at) return null;
  const at = new Date(purchase.send_at).getTime();
  if (purchase.send_channel === "whatsapp") return at <= now.getTime() ? "whatsapp" : null;
  if (purchase.send_channel === "email") {
    return at + EMAIL_GRACE_MINUTES * 60_000 <= now.getTime() ? "email" : null;
  }
  return null;
}
