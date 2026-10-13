import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_STYLE,
  mixColours,
  storeColoursFrom,
  storeStyles,
  STYLE_KEYS,
  studioStyles,
} from "../src/features/content-studio/lib/studio-styles";
import { readDraftSettings } from "../src/features/content-studio/lib/drafts";
import { paletteFor } from "../src/features/content-studio/templates";
import { CONTENT_BOTTOM, photoHeight } from "../src/features/content-studio/engine/safe-area";

// The content studio's colour styles: a store's posts wear its own storefront
// colours (they once all came out in one store's burgundy and cream), and the
// ink on every style can be read.

/** The colours the stores on the platform had set (2026-10-13), and harder ones. */
const STORES = {
  burgundy: { accent: "#330a0a", background: null, text: "#0a0a0a" },
  black: { accent: "#000000", background: "#ffffff", text: null },
  wine: { accent: "#800020", background: null, text: null },
  rose: { accent: "#6e2b2b", background: "#ffffff", text: "#1c1917" },
  mauve: { accent: "#a0738d", background: "#ffffff", text: "#1e1b4b" },
  pastel: { accent: "#f5d0e0", background: "#ffffff", text: null },
  yellow: { accent: "#ffd400", background: null, text: null },
  darkStorefront: { accent: "#c9a27a", background: "#111111", text: "#f5f5f5" },
  cream: { accent: "#8c6d58", background: "#faf8f5", text: null },
};

describe("colour helpers", () => {
  it("measures contrast the WCAG way", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("mixes two colours", () => {
    expect(mixColours("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColours("#ffffff", "#330a0a", 0)).toBe("#ffffff");
    expect(mixColours("#fff", "#000", 1)).toBe("#000000");
  });
});

describe("the store's own styles", () => {
  it("gives every store ink that reads on its ground, in both styles", () => {
    for (const [name, colours] of Object.entries(STORES)) {
      const styles = storeStyles(colours);
      for (const style of [styles.store, styles["store-bold"]]) {
        expect(contrastRatio(style.ink, style.bg), `${name} ${style.en}`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(style.accent, style.bg), `${name} ${style.en}`).toBeGreaterThan(1.5);
      }
    }
  });

  it("tints a white storefront with the store colour and inks it in that colour", () => {
    const { store } = storeStyles(STORES.burgundy);
    expect(store.bg).toBe("#efebeb");
    expect(store.ink).toBe("#330a0a");
    expect(store.accent).toBe("#330a0a");
  });

  it("keeps a storefront ground the store chose", () => {
    expect(storeStyles(STORES.cream).store.bg).toBe("#faf8f5");
    expect(storeStyles(STORES.darkStorefront).store.bg).toBe("#111111");
  });

  it("uses the storefront's text colour when the store colour is too light to read", () => {
    const { store } = storeStyles(STORES.mauve);
    expect(store.ink).toBe("#1e1b4b");
    // The mauve still marks the details.
    expect(store.accent).toBe("#a0738d");
  });

  it("deepens a light store colour into ink when nothing else reads", () => {
    const { store } = storeStyles(STORES.yellow);
    expect(store.ink).not.toBe("#ffd400");
    expect(contrastRatio(store.ink, store.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("sets the bold style on the store colour", () => {
    const bold = storeStyles(STORES.black)["store-bold"];
    expect(bold.bg).toBe("#000000");
    expect(contrastRatio(bold.ink, "#000000")).toBeGreaterThanOrEqual(4.5);
    expect(storeStyles(STORES.pastel)["store-bold"].ink).toBe("#111111");
  });

  it("falls back to the storefront's own colour when a store has chosen none", () => {
    const styles = storeStyles({ accent: null, background: "not a colour", text: undefined });
    expect(styles["store-bold"].bg).toBe("#3f121a");
  });

  it("reads the colours the storefront wears: its accent, else the brand's colour", () => {
    expect(
      storeColoursFrom(
        { storefront_accent_color: "#123456", storefront_background_color: "#fafafa" },
        { primary_color: "#abcdef" },
      ),
    ).toEqual({ accent: "#123456", background: "#fafafa", text: null });
    expect(storeColoursFrom(null, { primary_color: "#abcdef" }).accent).toBe("#abcdef");
  });
});

describe("the styles the studio offers", () => {
  it("lists the store's two first, then the editorial three, and opens on the store's", () => {
    expect(STYLE_KEYS).toEqual(["store", "store-bold", "editorial", "maison", "minimal"]);
    expect(DEFAULT_STYLE).toBe("store");
    expect(Object.keys(studioStyles(STORES.black)).sort()).toEqual([...STYLE_KEYS].sort());
  });

  it("keeps the editorial looks exactly as they were", () => {
    const styles = studioStyles(STORES.black);
    expect(paletteFor(styles.maison)).toEqual({
      ground: "#330a0a",
      ink: "#fffaf6",
      accent: "#c9a27a",
      muted: "rgba(255, 250, 246, 0.45)",
    });
    expect(paletteFor(styles.editorial)).toMatchObject({ ground: "#f4eee9", accent: "#9c6f4c" });
  });

  it("reopens a draft in the style it was saved in, and an unknown one in the store's", () => {
    expect(readDraftSettings({ theme: "store-bold" }).theme).toBe("store-bold");
    expect(readDraftSettings({ theme: "maison" }).theme).toBe("maison");
    expect(readDraftSettings({ theme: "neon" }).theme).toBe("store");
    expect(readDraftSettings({}).theme).toBe("store");
  });
});

describe("the photo's height", () => {
  it("takes what the copy below leaves, down to Instagram's reply bar on a story", () => {
    const H = 1920;
    const top = 0.155 * H;
    const short = photoHeight({ top, bottom: CONTENT_BOTTOM.story * H, below: 300, min: 600 });
    const long = photoHeight({ top, bottom: CONTENT_BOTTOM.story * H, below: 560, min: 600 });
    expect(short).toBeCloseTo(0.86 * H - 300 - top);
    expect(short - long).toBeCloseTo(260);
    expect(photoHeight({ top, bottom: CONTENT_BOTTOM.story * H, below: 1400, min: 600 })).toBe(600);
  });
});
