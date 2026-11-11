import type { CardDetails } from "@/features/gift-card-design/lib/content";
import {
  DEFAULT_DESIGN,
  readDesign,
  type CardDesign,
} from "@/features/gift-card-design/lib/design";
import { occasionsInOrder } from "@/features/gift-card-design/lib/occasions";

/** What a card to print starts from: its value, code and words, and the design to open on. */
export type CardPrintStart = { details: CardDetails; initial: CardDesign };

type PrintedCard = {
  code: string;
  balance: number | string;
  currency: string;
  expires_on: string | null;
  recipient_name: string | null;
  purchaser_name: string | null;
  note: string | null;
};

type BuyersChoice = {
  recipient_name: string | null;
  message: string | null;
  design: unknown;
  lang: string | null;
};

/**
 * A card to print. A card bought on the storefront opens on what its buyer chose: the design, who
 * it is from as they wrote it (never the buyer's own name, which the card keeps as its purchaser),
 * who it is for and their message. The card itself holds none of that (the owner's report of
 * 2026-11-11: the Cards tab printed the buyer's name, no message and the season's design). A card
 * issued in the store opens on the season's first occasion, from its purchaser, with its note.
 */
export function cardPrintStart(
  card: PrintedCard,
  purchase: BuyersChoice | null | undefined,
  lang: "ar" | "en",
  now: Date = new Date(),
): CardPrintStart {
  const details: CardDetails = {
    amount: Number(card.balance),
    code: card.code,
    to: purchase?.recipient_name ?? card.recipient_name,
    message: purchase ? (purchase.message ?? card.note) : card.note,
    expiresOn: card.expires_on,
  };
  if (purchase) {
    return { details, initial: readDesign(purchase.design, purchase.lang === "en" ? "en" : "ar") };
  }
  return {
    details,
    initial: {
      ...DEFAULT_DESIGN,
      occasion: occasionsInOrder(now, card.currency)[0].id,
      language: lang,
      from: card.purchaser_name ?? null,
    },
  };
}
