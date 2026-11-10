/**
 * A gift order's details, as the storefront's checkout writes them at the top of the order's
 * notes (the shopper ticks "Is this order a gift?" in the cart): who it is for and the message to
 * write on the card. Written and read here, so the order page can print the gift message card
 * (`PrintGiftMessageButton`) from what the shopper typed.
 */

const HEADER = "🎁 [طلب إهداء / Gift Order]";
const RECIPIENT = "المستلم: ";
const MESSAGE = "رسالة الإهداء: ";
const NO_RECIPIENT = "غير محدد";
const NO_MESSAGE = "بدون رسالة";

/** The note the checkout puts first in the order's notes. */
export function giftOrderNote(
  recipient: string | null | undefined,
  message: string | null | undefined,
) {
  return `${HEADER}\n${RECIPIENT}${recipient?.trim() || NO_RECIPIENT}\n${MESSAGE}${message?.trim() || NO_MESSAGE}`;
}

export type GiftOrderDetails = { recipient: string | null; message: string | null };

/**
 * The gift details in an order's notes, or null when it is not a gift order. A recipient or a
 * message the shopper left empty is null; a message runs to the end of its paragraph, so a
 * message typed over several lines keeps them, and the shopper's own notes after it stay out.
 */
export function readGiftOrderNote(notes: string | null | undefined): GiftOrderDetails | null {
  if (!notes) return null;
  const start = notes.indexOf(HEADER);
  if (start < 0) return null;
  const block = notes.slice(start + HEADER.length).split(/\n\s*\n/)[0] ?? "";
  const lines = block.split("\n");
  const recipientLine = lines.find((line) => line.startsWith(RECIPIENT));
  const messageAt = lines.findIndex((line) => line.startsWith(MESSAGE));
  const recipient = recipientLine?.slice(RECIPIENT.length).trim() ?? "";
  const message =
    messageAt < 0
      ? ""
      : [lines[messageAt].slice(MESSAGE.length), ...lines.slice(messageAt + 1)].join("\n").trim();
  return {
    recipient: recipient && recipient !== NO_RECIPIENT ? recipient : null,
    message: message && message !== NO_MESSAGE ? message : null,
  };
}
