import { describe, expect, it } from "vitest";
import { drawRuns } from "../src/features/content-studio/engine/draw";
import type { FormatKey, SceneData } from "../src/features/content-studio/engine/scene";
import { ENGINE_TEMPLATES } from "../src/features/content-studio/templates";

// Mixed-direction text: an Arabic name drawn in the same string as a price
// ("عباية - كود S17 · 30.000 د.ب.") is reordered by the bidi algorithm, and the
// price lands in the middle of the name. Lines that mix them are drawn as
// separate runs; this guards every template against joining them again.

type Call = { text: string; x: number; direction: string };

/** A context that records each fillText with where and in which direction it was drawn. */
function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { direction: "ltr" };
  const stack: Array<Record<string, unknown>> = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "fillText")
          return (text: string, x: number) =>
            calls.push({ text: String(text), x, direction: String(state.direction) });
        if (key === "measureText") return (text: string) => ({ width: String(text).length * 12 });
        if (key === "save") return () => stack.push({ ...state });
        if (key === "restore") return () => Object.assign(state, stack.pop() ?? {});
        if (key === "getTransform") return () => ({ a: 1, b: 0 });
        if (key === "createLinearGradient" || key === "createRadialGradient") {
          return () => ({ addColorStop: () => undefined });
        }
        if (typeof key === "string" && key in state) return state[key];
        return () => undefined;
      },
      set(_target, key, value) {
        state[String(key)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const SIZES: Record<FormatKey, [number, number]> = {
  story: [1080, 1920],
  portrait: [1080, 1350],
  square: [1080, 1080],
};

const arabicScene = (format: FormatKey): SceneData => ({
  width: SIZES[format][0],
  height: SIZES[format][1],
  format,
  lang: "ar",
  brand: {
    name: "بورا",
    logo: null,
    logoScale: 1,
    logoTint: "auto",
    handle: "@pura.bh",
    contact: "+973 3300 0000",
    palette: { ground: "#f3ede7", ink: "#330a0a", accent: "#9c6f4c", muted: "#b9a7a2" },
  },
  productName: "عباية - كود S17",
  headline: "عباية كود S17",
  body: "أناقة هادئة بتفاصيلها",
  price: "30.000 د.ب.",
  originalPrice: "42.000 د.ب.",
  priceAmount: "30.000",
  originalAmount: "42.000",
  currencyLabel: "د.ب.",
  issueLabel: "سبتمبر 2026",
  discountPercent: 29,
  media: null,
  options: null,
  collection: [
    { name: "عباية - كود S17", price: "30.000 د.ب.", media: null },
    { name: "عباية - كود S70", price: "25.000 د.ب.", media: null },
  ],
  detail: { x: 0.5, y: 0.42, label: "ألماس كريب", note: "مناسبات" },
  occasion: {
    id: "eid-al-fitr",
    eyebrow: "1448 هـ",
    greeting: "عيد فطر مبارك",
    message: "عساكم من عوّاده",
    offer: "",
  },
});

const ARABIC = /[؀-ۿ]/;

describe("mixed Arabic and prices", () => {
  it("never draws an Arabic word and the price's number in one string, in any template", () => {
    for (const template of ENGINE_TEMPLATES) {
      for (const format of Object.keys(SIZES) as FormatKey[]) {
        const { ctx, calls } = recordingContext();
        const scene = arabicScene(format);
        for (const t of [template.duration * 0.5, template.duration - 1]) {
          template.render(ctx, t, scene);
        }
        // A price on its own ("30.000 د.ب.") is fine; Arabic words beside it are not.
        const mixed = calls.filter(
          ({ text }) =>
            /\d{2}\.\d{3}/.test(text) && ARABIC.test(text.split(scene.currencyLabel).join("")),
        );
        expect(mixed, `${template.id} (${format})`).toEqual([]);
        // An Arabic price reads right to left ("30.000 د.ب." shows the number first).
        const backwards = calls.filter(
          ({ text, direction }) => text.includes(scene.currencyLabel) && direction !== "rtl",
        );
        expect(backwards, `${template.id} (${format})`).toEqual([]);
      }
    }
  });

  it("sets Price Drop's big price in reading order: in Arabic, the currency to the amount's left", () => {
    const priceDrop = ENGINE_TEMPLATES.find((template) => template.id === "price-drop")!;
    const { ctx, calls } = recordingContext();
    priceDrop.render(ctx, priceDrop.duration - 1, arabicScene("story"));
    const amount = calls.find((call) => call.text === "30.000")!;
    const currency = calls.find((call) => call.text === "د.ب.")!;
    expect(amount.x).toBeGreaterThan(currency.x);
  });

  it("lays runs out in reading order, each in its own direction", () => {
    const runs = [
      { text: "عباية - كود S17" },
      { text: "·", dir: "ltr" as const },
      { text: "30.000 د.ب." },
    ];
    const { ctx, calls } = recordingContext();
    drawRuns(ctx, runs, { x: 500, y: 0, lineDir: "rtl", align: "center", gap: 10 });
    const at = (text: string) => calls.find((call) => call.text === text)!;
    // Right to left: the name first (rightmost), then the dot, then the price.
    expect(at("عباية - كود S17").x).toBeGreaterThan(at("·").x);
    expect(at("·").x).toBeGreaterThan(at("30.000 د.ب.").x);
    expect(at("عباية - كود S17").direction).toBe("rtl");
    expect(at("30.000 د.ب.").direction).toBe("rtl");

    calls.length = 0;
    drawRuns(ctx, runs, { x: 0, y: 0, lineDir: "ltr", gap: 10 });
    expect(at("عباية - كود S17").x).toBe(0);
    expect(at("30.000 د.ب.").x).toBeGreaterThan(at("·").x);
  });
});
