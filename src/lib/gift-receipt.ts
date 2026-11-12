import { lineSize, madeToMeasure } from "@/lib/made-to-measure";
import { orderLineName, type NamedOrderLine } from "@/lib/order-line-name";
import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";
import type { OrderGift } from "@/lib/gift-order";

/**
 * A gift receipt (step three of the gift orders plan): the page that goes in the box of a gift
 * order. It names what is inside and the order to bring for an exchange, and **never a price, an
 * amount, a payment or the buyer's contact**: the delivery note says what to collect, so it never
 * goes with a gift. A gift's own lines (the card, a bouquet) are what came with it, not pieces to
 * exchange, so they are left out.
 */

export type GiftReceiptLine = NamedOrderLine & {
  quantity?: number | null;
  gift_line?: string | null;
  location?: string | null;
  selected_variant?: {
    size?: string | null;
    color?: string | null;
    made_to_measure?: boolean;
  } | null;
  custom_field_values?: Array<{ key?: string | null; value?: unknown }> | null;
};

export type GiftReceiptPiece = { name: string; detail: string | null; quantity: number };

/** The pieces in the box: every line that is not one of the gift's own, by its name and options. */
export function giftReceiptPieces(
  lines: readonly GiftReceiptLine[],
  lang: "ar" | "en",
): GiftReceiptPiece[] {
  return lines
    .filter((line) => !line.gift_line)
    .map((line) => {
      const size = lineSize(line);
      const parts = [
        madeToMeasure(line) ? (lang === "ar" ? "مفصّلة على المقاس" : "Made to measure") : size,
        line.selected_variant?.color?.trim() || null,
      ].filter(Boolean);
      return {
        name: orderLineName(line, lang),
        detail: parts.length > 0 ? parts.join(" · ") : null,
        quantity: Math.max(1, Number(line.quantity ?? 1)),
      };
    })
    .filter((piece) => piece.name);
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type GiftReceiptInput = {
  storeName: string;
  logoUrl?: string | null;
  orderNumber: number | string | null;
  numberFormat?: OrderNumberFormat | null;
  orderDate?: string | null;
  gift: Pick<OrderGift, "recipient" | "from">;
  pieces: GiftReceiptPiece[];
  /** How to reach the store for an exchange (its WhatsApp or phone), when it has one. */
  contact?: string | null;
  lang: "ar" | "en";
};

/** The A4 page, in one language, with nothing on it that says what anything cost. */
export function giftReceiptHtml(input: GiftReceiptInput): string {
  const ar = input.lang === "ar";
  const words = ar
    ? {
        title: "إيصال هدية",
        forYou: input.gift.recipient ? `هدية إلى ${input.gift.recipient}` : "هدية لك",
        from: input.gift.from ? `من ${input.gift.from}` : null,
        piece: "القطعة",
        quantity: "الكمية",
        order: "رقم الطلب",
        exchange: "للاستبدال، تواصل مع المتجر واذكر رقم الطلب. لا يظهر في هذا الإيصال أي سعر.",
        contact: "للتواصل",
      }
    : {
        title: "Gift receipt",
        forYou: input.gift.recipient ? `A gift for ${input.gift.recipient}` : "A gift for you",
        from: input.gift.from ? `From ${input.gift.from}` : null,
        piece: "Piece",
        quantity: "Qty",
        order: "Order",
        exchange:
          "To exchange, contact the store with the order number. This receipt shows no prices.",
        contact: "Contact",
      };
  const number = orderNumberLabel(input.orderNumber, input.numberFormat ?? null);
  const rows = input.pieces
    .map(
      (piece) => `
      <tr>
        <td><div class="name" dir="auto">${escapeHtml(piece.name)}</div>${
          piece.detail ? `<div class="detail" dir="auto">${escapeHtml(piece.detail)}</div>` : ""
        }</td>
        <td class="qty">${piece.quantity}</td>
      </tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html dir="${ar ? "rtl" : "ltr"}" lang="${input.lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(words.title)} ${escapeHtml(number)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif; color: #111; margin: 0; font-size: 13px; }
    header { text-align: center; border-bottom: 1px solid #d4d4d4; padding-bottom: 16px; margin-bottom: 20px; }
    header img { max-height: 56px; max-width: 160px; object-fit: contain; }
    .store { font-size: 18px; font-weight: 700; margin-top: 6px; }
    .title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b; margin-top: 4px; }
    .for { text-align: center; font-size: 20px; font-weight: 600; margin: 8px 0 2px; }
    .from { text-align: center; color: #555; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: start; font-size: 11px; color: #6b6b6b; border-bottom: 1px solid #d4d4d4; padding: 8px 4px; }
    td { padding: 10px 4px; border-bottom: 1px solid #ececec; vertical-align: top; }
    .name { font-weight: 600; }
    .detail { color: #6b6b6b; font-size: 12px; margin-top: 2px; }
    .qty { text-align: center; width: 60px; font-weight: 600; }
    th.qty { text-align: center; }
    footer { margin-top: 24px; font-size: 12px; color: #444; }
    .order { font-family: monospace; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    ${input.logoUrl ? `<img src="${escapeHtml(input.logoUrl)}" alt="" />` : ""}
    <div class="store">${escapeHtml(input.storeName)}</div>
    <div class="title">${escapeHtml(words.title)}</div>
  </header>
  <div class="for" dir="auto">${escapeHtml(words.forYou)}</div>
  ${words.from ? `<div class="from" dir="auto">${escapeHtml(words.from)}</div>` : `<div class="from"></div>`}
  <table>
    <thead><tr><th>${escapeHtml(words.piece)}</th><th class="qty">${escapeHtml(words.quantity)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>
    <div>${escapeHtml(words.order)}: <span class="order" dir="ltr">${escapeHtml(number)}</span>${
      input.orderDate ? ` · ${escapeHtml(input.orderDate)}` : ""
    }</div>
    ${input.contact ? `<div>${escapeHtml(words.contact)}: <span dir="ltr">${escapeHtml(input.contact)}</span></div>` : ""}
    <p>${escapeHtml(words.exchange)}</p>
  </footer>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body>
</html>`;
}
