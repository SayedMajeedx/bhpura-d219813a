import { formatMoney } from "@/lib/format";
import { adminAddress, storeAddress } from "@/lib/platform-host";

/**
 * What a gift card purchase's emails say (the owner's review of 2026-10-31): to the buyer when they
 * chose to get the code by email, and to the store's admins and notification recipients, as for an
 * order. The Worker sends them from the outbox `gift_card_purchase_events`
 * (`processGiftCardNotices`); these build them, in the buyer's language for the buyer and in both
 * for the store. Subjects stay ASCII, as the order emails' do (some mail apps garble Arabic ones).
 *
 * - The buyer: a transfer received (the store checks it, the code follows), the card ready with
 *   its code, or the purchase declined with the store's reason. A card payment that is not
 *   finished writes nothing.
 * - The store: a transfer to check, and a card paid on the store (with who to send the code to
 *   when the buyer chose WhatsApp). A transfer the staff approved needs no email: they did it.
 */

export type NoticeEvent = {
  event_id: string;
  event: "placed" | "paid" | "cancelled";
  purchase_id: string;
  brand_id: string;
  slug: string;
  store_name: string;
  sender_name: string | null;
  amount: number;
  currency: string;
  payment_method: "card" | "benefit";
  delivery_channel: "whatsapp" | "email";
  lang: "ar" | "en";
  buyer_name: string;
  buyer_phone: string | null;
  buyer_email: string | null;
  recipient_name: string | null;
  message: string | null;
  cancel_reason: string | null;
  token: string;
  code: string | null;
  expires_on: string | null;
};

export type Email = { subject: string; html: string; text: string };

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The purchase's own page, where its code shows once paid (opened by its token). */
export function purchasePageUrl(e: Pick<NoticeEvent, "slug" | "purchase_id" | "token">): string {
  return `${storeAddress(e.slug)}/gift-card/${e.purchase_id}?t=${e.token}`;
}

const amountOf = (e: NoticeEvent, lang: "ar" | "en") =>
  // Plain spaces: a subject stays ASCII, and the formatter puts a non-breaking one by the code.
  formatMoney(Number(e.amount), e.currency, lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB").replace(
    /\u00a0|\u202f/g,
    " ",
  );

const dayOf = (day: string | null, lang: "ar" | "en") =>
  day
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

function page(
  lang: "ar" | "en",
  title: string,
  lines: string[],
  button?: { href: string; label: string },
) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const body = lines
    .map((line) => `<p style="margin:0 0 12px;line-height:1.6">${line}</p>`)
    .join("");
  const link = button
    ? `<p style="margin:20px 0 0"><a href="${esc(button.href)}" style="display:inline-block;background:#111827;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(button.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Tahoma,Arial,sans-serif;color:#111827"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#ffffff;border-radius:16px;padding:24px" dir="${dir}"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${body}${link}</div></div></body></html>`;
}

const codeBlock = (code: string) =>
  `<span dir="ltr" style="display:inline-block;font-family:Menlo,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:2px;background:#f3f4f6;border-radius:10px;padding:10px 14px">${esc(code)}</span>`;

/** The buyer's email for this event, or none (they chose WhatsApp, or nothing is due). */
export function customerNotice(e: NoticeEvent): (Email & { to: string }) | null {
  if (e.delivery_channel !== "email" || !e.buyer_email) return null;
  const ar = e.lang === "ar";
  const amount = amountOf(e, e.lang);
  const url = purchasePageUrl(e);
  const hello = ar ? `مرحبًا ${e.buyer_name}،` : `Hello ${e.buyer_name},`;

  if (e.event === "placed") {
    if (e.payment_method !== "benefit") return null;
    const title = ar ? "وصلنا طلب بطاقة الهدية" : "We received your gift card request";
    const lines = ar
      ? [
          esc(hello),
          esc(`وصلنا طلب بطاقة هدية بقيمة ${amount} من ${e.store_name}، مع إيصال التحويل.`),
          esc("يتحقق المتجر من التحويل، ثم نرسل لك رمز البطاقة على هذا البريد."),
        ]
      : [
          esc(hello),
          esc(
            `We received your request for a ${amount} gift card from ${e.store_name}, with the transfer receipt.`,
          ),
          esc(
            "The store is checking the transfer; we will email you the card's code once it is approved.",
          ),
        ];
    return {
      to: e.buyer_email,
      subject: `Gift card request received - ${e.store_name}`,
      html: page(e.lang, title, lines, {
        href: url,
        label: ar ? "متابعة الطلب" : "Follow your request",
      }),
      text: [title, ...lines.map(stripTags), url].join("\n\n"),
    };
  }

  if (e.event === "paid" && e.code) {
    const expiry = dayOf(e.expires_on, e.lang);
    const title = ar ? "بطاقة الهدية جاهزة" : "Your gift card is ready";
    const lines = ar
      ? [
          esc(hello),
          esc(
            `بطاقة هدية من ${e.store_name} بقيمة ${amount}${e.recipient_name ? ` لـ ${e.recipient_name}` : ""}.`,
          ),
          `${esc("رمز البطاقة:")}<br>${codeBlock(e.code)}`,
          ...(expiry ? [esc(`صالحة حتى ${expiry}.`)] : []),
          esc("يُكتب الرمز عند الدفع في المتجر، ويُستخدم رصيدها على أكثر من طلب حتى ينفد."),
        ]
      : [
          esc(hello),
          esc(
            `A ${amount} gift card from ${e.store_name}${e.recipient_name ? ` for ${e.recipient_name}` : ""}.`,
          ),
          `${esc("Card code:")}<br>${codeBlock(e.code)}`,
          ...(expiry ? [esc(`Valid until ${expiry}.`)] : []),
          esc(
            "The code is typed at the store's checkout; its balance can pay several orders until it runs out.",
          ),
        ];
    return {
      to: e.buyer_email,
      subject: `Your gift card - ${e.store_name}`,
      html: page(e.lang, title, lines, { href: url, label: ar ? "عرض البطاقة" : "View the card" }),
      text: [title, ...lines.map(stripTags), e.code, url].join("\n\n"),
    };
  }

  if (e.event === "cancelled") {
    const title = ar ? "لم يُعتمد طلب بطاقة الهدية" : "Your gift card request was declined";
    const reason = e.cancel_reason?.trim();
    const lines = ar
      ? [
          esc(hello),
          esc(`لم يُعتمد طلبك لبطاقة الهدية بقيمة ${amount} من ${e.store_name}.`),
          ...(reason ? [esc(`السبب: ${reason}`)] : []),
          esc("تواصل مع المتجر إن كنت دفعت."),
        ]
      : [
          esc(hello),
          esc(`${e.store_name} did not approve your request for a ${amount} gift card.`),
          ...(reason ? [esc(`Reason: ${reason}`)] : []),
          esc("Please contact the store if you paid."),
        ];
    return {
      to: e.buyer_email,
      subject: `Gift card request declined - ${e.store_name}`,
      html: page(e.lang, title, lines),
      text: [title, ...lines.map(stripTags)].join("\n\n"),
    };
  }
  return null;
}

/** The store's email for this event, or none. */
export function adminNotice(e: NoticeEvent): Email | null {
  const transferToCheck = e.event === "placed" && e.payment_method === "benefit";
  const soldOnline = e.event === "paid" && e.payment_method === "card";
  if (!transferToCheck && !soldOnline) return null;
  const amount = amountOf(e, "en");
  const amountAr = amountOf(e, "ar");
  const deliveryEn =
    e.delivery_channel === "email"
      ? `By email to ${e.buyer_email} (sent automatically)`
      : `By WhatsApp to ${e.buyer_phone}: send the code from the Gift cards page`;
  const deliveryAr =
    e.delivery_channel === "email"
      ? `بالبريد إلى ${e.buyer_email} (يُرسل تلقائيًا)`
      : `على واتساب إلى ${e.buyer_phone}: أرسل الرمز من صفحة بطاقات الهدايا`;
  const title = transferToCheck
    ? "بطاقة هدية: تحويل بانتظار التحقق · Gift card: transfer to check"
    : "بيعت بطاقة هدية على المتجر · Gift card sold on the store";
  const rows: Array<[string, string]> = [
    ["المبلغ · Amount", `${amountAr} · ${amount}`],
    ["المشتري · Buyer", e.buyer_name],
    ...(e.buyer_phone ? ([["الهاتف · Phone", e.buyer_phone]] as Array<[string, string]>) : []),
    ...(e.buyer_email ? ([["البريد · Email", e.buyer_email]] as Array<[string, string]>) : []),
    ["إرسال الرمز · Code delivery", `${deliveryAr} · ${deliveryEn}`],
    ...(e.recipient_name ? ([["لمن · For", e.recipient_name]] as Array<[string, string]>) : []),
    ...(e.message ? ([["الرسالة · Note", e.message]] as Array<[string, string]>) : []),
    [
      "الدفع · Payment",
      e.payment_method === "benefit"
        ? "تحويل بنفت باي · BenefitPay transfer"
        : "بطاقة على المتجر · Card on the store",
    ],
  ];
  const table = `<table style="border-collapse:collapse;width:100%">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 8px;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 8px" dir="auto">${esc(value)}</td></tr>`,
    )
    .join("")}</table>`;
  const link = `${adminAddress(e.slug)}/gift-cards`;
  const note = transferToCheck
    ? esc(
        "افتح صفحة بطاقات الهدايا لمراجعة الإيصال واعتماده · Open the Gift cards page to review the receipt and approve it.",
      )
    : esc("صدرت البطاقة · The card was issued.");
  return {
    subject: `[Gift card] ${transferToCheck ? "Transfer to check" : "Sold online"} ${amount} - ${e.store_name}`,
    html: page("ar", title, [note, table], { href: link, label: "بطاقات الهدايا · Gift cards" }),
    text: [title, ...rows.map(([label, value]) => `${label}: ${value}`), link].join("\n"),
  };
}

function stripTags(value: string): string {
  return value
    .replace(/<br>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
