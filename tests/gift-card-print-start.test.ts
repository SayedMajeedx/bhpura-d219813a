import { describe, expect, it } from "vitest";
import { cardPrintStart } from "../src/features/gift-cards/lib/card-print";

// A card bought on the storefront prints as its buyer chose it (the owner's report of 2026-11-11:
// from the Cards tab it printed the buyer's own name as "from", no message, and the season's
// design). The card row holds the buyer's name and no message; the purchase holds the rest.

const card = {
  code: "FS8A-XUJ5-KGD6",
  balance: "30.000",
  currency: "BHD",
  expires_on: "2027-11-11",
  recipient_name: "زوجتي و رفيقة دربي",
  purchaser_name: "Sayed Majeed Alawi",
  note: null,
};
const purchase = {
  recipient_name: "زوجتي و رفيقة دربي",
  message: "كل عام وانتي بخير",
  lang: "ar",
  design: {
    design: "block:white",
    from: "زوجك",
    language: "ar",
    occasion: "just_because",
    orientation: "portrait",
    photo: null,
    print: false,
  },
};

describe("a card to print", () => {
  it("opens a storefront card on its buyer's design, from and message", () => {
    const { details, initial } = cardPrintStart(card, purchase, "ar");
    expect(initial.design).toBe("block:white");
    expect(initial.occasion).toBe("just_because");
    expect(initial.from).toBe("زوجك");
    expect(details.message).toBe("كل عام وانتي بخير");
    expect(details.to).toBe("زوجتي و رفيقة دربي");
    expect(details.amount).toBe(30);
    expect(details.code).toBe("FS8A-XUJ5-KGD6");
  });

  it("never writes the buyer's own name as from when the buyer left it empty", () => {
    const { initial } = cardPrintStart(
      card,
      { ...purchase, design: { ...purchase.design, from: "" } },
      "ar",
    );
    expect(initial.from).toBeNull();
  });

  it("opens a card issued in the store on the season, from its purchaser, with its note", () => {
    const { details, initial } = cardPrintStart(
      { ...card, note: "مع التحية", purchaser_name: "مريم" },
      null,
      "en",
      new Date("2026-11-11T12:00:00Z"),
    );
    expect(initial.from).toBe("مريم");
    expect(initial.language).toBe("en");
    expect(details.message).toBe("مع التحية");
  });
});
