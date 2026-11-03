import { orderNumberLabel, orderNumberText, type OrderNumberFormat } from "@/lib/order-number";

/**
 * What a staff member sends the customer on WhatsApp when an order moves a stage. Pure: the
 * message is only written here. Nothing is ever sent automatically (there is no WhatsApp API
 * connection); a person opens WhatsApp with the message ready and presses send.
 */

/** A made-to-order piece has gone to the workshop: work on it has started. */
export function workStartedMessage({
  isAr,
  brandName,
  customerName,
  invoiceNumber,
  numberFormat,
  estimate,
}: {
  isAr: boolean;
  brandName: string;
  customerName?: string | null;
  invoiceNumber: number | string;
  /** How the store writes its order numbers (`orderNumberLabel`); none: "#1042". */
  numberFormat?: OrderNumberFormat | null;
  /** The store's own sentence about how long a made-to-order piece takes, if it wrote one. */
  estimate?: string | null;
}): string {
  const name = (customerName ?? "").trim();
  const hello = name ? (isAr ? `مرحباً ${name}،` : `Hello ${name},`) : isAr ? "مرحباً،" : "Hello,";
  const lines = isAr
    ? [
        hello,
        `بدأنا العمل على طلبك رقم ${orderNumberText(invoiceNumber, numberFormat)} من ${brandName}.`,
        (estimate ?? "").trim(),
        "سنتواصل معك فور جاهزيته. شكراً لك.",
      ]
    : [
        hello,
        `We have started making your order ${orderNumberLabel(invoiceNumber, numberFormat)} from ${brandName}.`,
        (estimate ?? "").trim(),
        "We will contact you as soon as it is ready. Thank you.",
      ];
  return lines.filter(Boolean).join("\n");
}

/**
 * A piece was received for an alteration or a fix: what is done to it, and when it is ready
 * (the alteration's due day, if one was set). The price, when there is one, is on the order.
 */
export function alterationReceivedMessage({
  isAr,
  brandName,
  customerName,
  piece,
  kind,
  readyOn,
}: {
  isAr: boolean;
  brandName: string;
  customerName?: string | null;
  piece: string;
  kind: "alteration" | "fix";
  /** The day it is ready, already written for the reader ("20/11/2026"). */
  readyOn?: string | null;
}): string {
  const name = (customerName ?? "").trim();
  const hello = name ? (isAr ? `مرحباً ${name}،` : `Hello ${name},`) : isAr ? "مرحباً،" : "Hello,";
  const what = piece.trim();
  const lines = isAr
    ? [
        hello,
        kind === "fix"
          ? `استلمنا ${what} لإصلاحها في ${brandName}، بدون أي تكلفة عليك.`
          : `استلمنا ${what} لتعديلها في ${brandName}.`,
        readyOn ? `ستكون جاهزة بتاريخ ${readyOn}.` : "",
        "سنتواصل معك فور جاهزيتها. شكراً لك.",
      ]
    : [
        hello,
        kind === "fix"
          ? `We have received your ${what} at ${brandName} to be fixed, at no charge to you.`
          : `We have received your ${what} at ${brandName} for its alteration.`,
        readyOn ? `It will be ready on ${readyOn}.` : "",
        "We will contact you as soon as it is ready. Thank you.",
      ];
  return lines.filter(Boolean).join("\n");
}
