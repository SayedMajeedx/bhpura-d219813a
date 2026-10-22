import { describe, expect, it } from "vitest";
import {
  howToOrderSteps,
  type HowToOrderSettings,
} from "../src/features/content-studio/lib/how-to-order";
import { placeSteps } from "../src/features/content-studio/templates/how-to-order";
import { BATCH_TEMPLATES } from "../src/features/content-studio/lib/batch";
import { ENGINE_TEMPLATES } from "../src/features/content-studio/templates";

// How to Order: a story for the highlights that says how to order from this
// store, only from its own settings. Nothing a store did not set is said: no
// method it does not take, no fee or time it did not write.

const shop: HowToOrderSettings = {
  storefront_mode: "shop",
  card_enabled: true,
  benefit_enabled: true,
  cod_enabled: true,
  delivery_enabled: true,
  delivery_fee: 2,
  delivery_estimate_en: "1-2 days in Bahrain",
  delivery_estimate_ar: "يوم إلى يومين داخل البحرين",
  pickup_enabled: true,
  currency: "BHD",
};
const en = (settings: HowToOrderSettings, whatsapp: string | null = "+973 3300 0000") =>
  howToOrderSteps(settings, { lang: "en", currencyLabel: "BHD", whatsapp });
const zone = (countries: string[]) => ({
  id: countries.join(""),
  name_en: "",
  name_ar: "",
  countries,
  pricing_type: "flat",
  fee: 5,
});

describe("the steps", () => {
  it("names where to order, how to pay and how it arrives, from the settings", () => {
    expect(en(shop)).toEqual([
      {
        key: "choose",
        title: "Choose",
        lines: [["From the link in our bio"], ["Or on WhatsApp", "+973 3300 0000"]],
      },
      { key: "pay", title: "Pay", lines: [["Card  ·  BenefitPay  ·  Cash on delivery"]] },
      {
        key: "receive",
        title: "Receive",
        lines: [
          ["Delivery in Bahrain", "2.000 BHD"],
          ["1-2 days in Bahrain"],
          ["Or pick up from us"],
        ],
      },
    ]);
  });

  it("offers only the methods the store switched on", () => {
    const pay = en({ ...shop, card_enabled: false, cod_enabled: false }).find(
      (step) => step.key === "pay",
    );
    expect(pay?.lines).toEqual([["BenefitPay"]]);
    const none = en({ ...shop, card_enabled: false, benefit_enabled: false, cod_enabled: false });
    expect(none.map((step) => step.key)).toEqual(["choose", "receive"]);
  });

  it("calls a transfer a bank transfer outside Bahrain", () => {
    const steps = en({ ...shop, currency: "SAR", card_enabled: false, cod_enabled: false });
    expect(steps.find((step) => step.key === "pay")?.lines).toEqual([["Bank transfer"]]);
  });

  it("says the advance the store asks for, by what it reaches", () => {
    const advance = { ...shop, advance_payment_enabled: true, advance_payment_percent: 50 };
    const steps = en({ ...advance, advance_payment_scope: "made_to_order" });
    expect(steps.find((step) => step.key === "pay")?.lines[1]).toEqual([
      "50% to confirm a made-to-order piece",
    ]);
    // A store whose own rules decide says nothing it cannot sum up in a line.
    const rules = en({ ...advance, advance_payment_scope: "rules_only" });
    expect(rules.find((step) => step.key === "pay")?.lines).toHaveLength(1);
  });

  it("writes free delivery, the countries it ships to and pickup only as set", () => {
    const steps = en({
      ...shop,
      delivery_fee: 0,
      delivery_estimate_en: null,
      pickup_enabled: false,
      shipping_zones: [zone(["SA", "KW", "AE", "QA"])],
    });
    expect(steps.find((step) => step.key === "receive")?.lines).toEqual([
      ["Free delivery in Bahrain"],
      ["We also ship to Saudi Arabia, Kuwait, UAE and more"],
    ]);
  });

  it("names the Gulf's countries as people write them in Arabic", () => {
    const steps = howToOrderSteps(
      { ...shop, shipping_zones: [zone(["SA", "KW"])] },
      { lang: "ar", currencyLabel: "د.ب.", whatsapp: null },
    );
    expect(steps.find((step) => step.key === "receive")?.lines[2]).toEqual([
      "ونشحن إلى السعودية، الكويت",
    ]);
  });

  it("says no time when the store hides its estimate", () => {
    const steps = en({ ...shop, delivery_estimate_enabled: false });
    expect(steps.find((step) => step.key === "receive")?.lines).not.toContainEqual([
      "1-2 days in Bahrain",
    ]);
  });

  it("adds the making time only when the store wrote one, in its own word", () => {
    expect(en(shop).some((step) => step.key === "making")).toBe(false);
    const steps = howToOrderSteps(
      { ...shop, delivery_estimate_tailored_en: "Ready in 10-14 days" },
      { lang: "en", currencyLabel: "BHD", whatsapp: null, makingWord: "Tailored" },
    );
    expect(steps.at(-1)).toEqual({
      key: "making",
      title: "Tailored",
      lines: [["Ready in 10-14 days"]],
    });
  });

  it("sends a catalog store's shoppers to WhatsApp, with no payment step", () => {
    const catalog = { ...shop, storefront_mode: "catalog" };
    expect(en(catalog).map((step) => step.key)).toEqual(["choose", "receive"]);
    expect(en(catalog)[0].lines).toEqual([
      ["Send us the piece"],
      ["On WhatsApp", "+973 3300 0000"],
    ]);
    // With no WhatsApp number there is no way to order to name.
    expect(en(catalog, null).map((step) => step.key)).toEqual(["receive"]);
  });

  it("leaves the number out when the merchant does", () => {
    expect(en(shop, null)[0].lines).toEqual([["From the link in our bio"]]);
  });
});

describe("placing the steps", () => {
  const measureAt = (size: number) => (text: string) => text.length * size * 0.5;
  const steps = en(shop);

  it("takes less room at a smaller scale, and wraps a long line", () => {
    const at = (k: number) => placeSteps(steps, { top: 0, k, u: 1, textW: 400, measureAt }).height;
    expect(at(0.8)).toBeLessThan(at(1));
    const wide = placeSteps(steps, { top: 0, k: 1, u: 1, textW: 2000, measureAt });
    const narrow = placeSteps(steps, { top: 0, k: 1, u: 1, textW: 300, measureAt });
    expect(narrow.placed[1].lines.length).toBeGreaterThan(wide.placed[1].lines.length);
  });

  it("keeps a word and its amount on one line, apart", () => {
    const { placed } = placeSteps(steps, { top: 0, k: 1, u: 1, textW: 100, measureAt });
    expect(placed[2].lines[0]).toEqual(["Delivery in Bahrain", "2.000 BHD"]);
  });
});

describe("the template", () => {
  it("is in the picker but not in the batch export (one story per store)", () => {
    expect(ENGINE_TEMPLATES.some((template) => template.id === "how-to-order")).toBe(true);
    expect(BATCH_TEMPLATES).not.toContain("how-to-order");
  });
});
