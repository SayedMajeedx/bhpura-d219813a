import type { Tone } from "./types";

/** The four cloths a post is drawn on: the store's own colours. */
export const TONES: Record<string, Tone> = {
  wine: {
    grain: 0.9,
    name: { ar: "برغندي", en: "Burgundy" },
    bg: "#3C0A1B",
    ink: "#F7ECE6",
    sub: "#D8B992",
    tag: "#D8B992",
    tagInk: "#3C0A1B",
    stitch: "rgba(216,185,146,.6)",
  },
  sand: {
    grain: 0.4,
    name: { ar: "رملي", en: "Sand" },
    bg: "#D8B992",
    ink: "#3C0A1B",
    sub: "#5C2436",
    tag: "#3C0A1B",
    tagInk: "#F7ECE6",
    stitch: "rgba(60,10,27,.5)",
  },
  cream: {
    grain: 0.3,
    name: { ar: "كريمي", en: "Cream" },
    bg: "#F7ECE6",
    ink: "#3C0A1B",
    sub: "#7A3B4E",
    tag: "#D8B992",
    tagInk: "#3C0A1B",
    stitch: "rgba(60,10,27,.35)",
  },
  ink: {
    grain: 0.9,
    name: { ar: "أسود عباية", en: "Abaya black" },
    bg: "#171214",
    ink: "#F7ECE6",
    sub: "#D8B992",
    tag: "#F7ECE6",
    tagInk: "#171214",
    stitch: "rgba(247,236,230,.42)",
  },
};
export const AR = '"Readex Pro", "Noto Sans Arabic", Tahoma, sans-serif';
export const HAND = '"Marhey", "Readex Pro", Tahoma, sans-serif';
export const RUQAA = '"Aref Ruqaa", "Marhey", Tahoma, serif';
