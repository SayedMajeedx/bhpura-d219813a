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
