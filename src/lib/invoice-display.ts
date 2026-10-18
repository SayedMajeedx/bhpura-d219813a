import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-phone";

/**
 * How an invoice states its facts: what was paid, the date, a phone number and whether it has a
 * tax line. The store chooses how its invoice looks (colours, fonts, template); these rules only
 * decide what the words and figures say, the same on the customer's page and the store's preview.
 */

export type InvoicePayment =
  /** Paid in full: one line says so; no "advance" and no "0.000 remaining". */
  | { kind: "paid"; paid: number }
  /** A real part payment: what was paid now and what is still due. */
  | { kind: "part_paid"; paid: number; remaining: number }
  /** Nothing collected yet. */
  | { kind: "unpaid" }
  /** Refunded or voided: no balance is owed. */
  | { kind: "closed" };

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * What an invoice says was paid. The database records a full payment as `advance_paid` equal to
 * the total (`trg_orders_payment_amounts`), so every paid order read as "Advance paid − 54.000,
 * remaining due 0.000" beside a PAID badge. Part payment is only an advance below the total.
 */
export function invoicePayment(order: {
  payment_status?: string | null;
  total?: number | string | null;
  advance_paid?: number | string | null;
}): InvoicePayment {
  const status = String(order.payment_status ?? "").toLowerCase();
  const total = Math.max(0, num(order.total));
  const advance = Math.max(0, num(order.advance_paid));
  if (status === "refunded" || status === "voided") return { kind: "closed" };
  if (status === "paid" || (total > 0 && advance >= total)) return { kind: "paid", paid: total };
  if (advance > 0) return { kind: "part_paid", paid: advance, remaining: total - advance };
  return { kind: "unpaid" };
}

/** An invoice's date written out: "30 Aug 2026" or «30 أغسطس 2026», Western digits in both. */
export function invoiceDate(value: string | Date | null | undefined, lang: "ar" | "en"): string {
  if (!value) return "—";
  let date: Date;
  if (value instanceof Date) date = value;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // A day without a time is that day on the reader's calendar, not midnight UTC.
    const [y, m, d] = value.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: lang === "ar" ? "long" : "short",
    year: "numeric",
  }).format(date);
}

/** Local digits after the country code, grouped as people read them aloud. */
const GROUPS: Record<string, number[]> = {
  "973": [4, 4], // Bahrain
  "974": [4, 4], // Qatar
  "965": [4, 4], // Kuwait
  "968": [4, 4], // Oman
  "966": [2, 3, 4], // Saudi Arabia
  "971": [2, 3, 4], // UAE
};

/**
 * A phone number as a reader takes it in: "+973 3995 0016", not "97339950016". A Bahraini number
 * kept as its 8 digits gains +973 (the same rule as the WhatsApp links); a number this cannot
 * place is shown with a + and its digits, never changed.
 */
export function displayPhone(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const digits = normalizePhoneForWhatsApp(value);
  if (digits.length < 7) return value.trim();
  for (const [code, groups] of Object.entries(GROUPS)) {
    const local = digits.slice(code.length);
    if (digits.startsWith(code) && local.length === groups.reduce((a, b) => a + b, 0)) {
      const parts: string[] = [];
      let at = 0;
      for (const size of groups) {
        parts.push(local.slice(at, at + size));
        at += size;
      }
      return `+${code} ${parts.join(" ")}`;
    }
  }
  return `+${digits}`;
}

/**
 * Whether the invoice has a VAT line: when tax was charged, or the store is registered for VAT
 * (its number is on the invoice). A store with neither showed "VAT (0%) 0.000" on every invoice,
 * as if it were registered.
 */
export function showsTaxLine(
  order: { tax_amount?: number | string | null; tax_rate?: number | string | null },
  vatNumber: string | null | undefined,
): boolean {
  return num(order.tax_amount) > 0 || num(order.tax_rate) > 0 || Boolean(vatNumber?.trim());
}

/** The invoice's title: the store's own words, else "Tax invoice" when it is VAT registered. */
export function invoiceTitle(
  custom: string | null | undefined,
  vatNumber: string | null | undefined,
  lang: "ar" | "en",
): string {
  if (custom?.trim()) return custom.trim();
  if (vatNumber?.trim()) return lang === "ar" ? "فاتورة ضريبية" : "TAX INVOICE";
  return lang === "ar" ? "فاتورة" : "INVOICE";
}

/** Browsers inside social apps cannot print (Save as PDF does nothing there). */
const IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|BytedanceWebview/i;

/**
 * How "Download PDF" makes the file: the browser's own print to PDF (real text, every page,
 * Arabic shaped by the browser) where it can print, else a picture of the page as before.
 */
export function invoicePdfMethod(userAgent: string): "print" | "image" {
  return IN_APP_BROWSER.test(userAgent) ? "image" : "print";
}
