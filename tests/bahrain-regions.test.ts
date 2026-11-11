import { describe, expect, it } from "vitest";
import { BAHRAIN_REGIONS, regionLabel, regionsInOrder } from "../src/lib/bahrain-regions";

// The areas an address names (the owner's report of 2026-11-11: a shopper in Sadad could not find
// her area; the list had 32). A saved address keeps an area's value, so none may ever go.

const KEPT = [
  "manama",
  "muharraq",
  "riffa",
  "hamad_town",
  "isa_town",
  "hidd",
  "budaiya",
  "sanabis",
  "juffair",
  "seef",
  "saar",
  "sitra",
  "amwaj",
  "adliya",
  "gudaibiya",
  "salmaniya",
  "tubli",
  "jidhafs",
  "aali",
  "zallaq",
  "durrat",
  "askar",
  "jasra",
  "diyar",
  "busaiteen",
  "galali",
  "arad",
  "malikiya",
  "karzakan",
  "duraz",
  "bani_jamra",
  "north_city",
];

describe("Bahrain's areas", () => {
  it("keep every value a saved address may hold", () => {
    const values = BAHRAIN_REGIONS.map((r) => r.value);
    for (const value of KEPT) expect(values).toContain(value);
  });

  it("name the areas people order from, Sadad among them", () => {
    expect(BAHRAIN_REGIONS.length).toBeGreaterThanOrEqual(100);
    for (const name of ["صدد", "دمستان", "باربار", "سماهيج", "الحجيات", "سند", "جد علي", "عوالي"]) {
      expect(BAHRAIN_REGIONS.some((r) => r.ar === name)).toBe(true);
    }
    expect(regionLabel("sadad", "en")).toBe("Sadad");
  });

  it("have one value and one name in each language per area", () => {
    for (const key of ["value", "ar", "en"] as const) {
      const all = BAHRAIN_REGIONS.map((r) => r[key].trim());
      expect(all.every(Boolean)).toBe(true);
      expect(new Set(all).size).toBe(all.length);
    }
    expect(BAHRAIN_REGIONS.every((r) => /^[a-z_]+$/.test(r.value))).toBe(true);
    expect(BAHRAIN_REGIONS.every((r) => /[؀-ۿ]/.test(r.ar))).toBe(true);
  });

  it("are offered alphabetically in the reader's language", () => {
    const ar = regionsInOrder("ar").map((r) => r.ar);
    expect(ar).toEqual([...ar].sort(new Intl.Collator("ar").compare));
    const en = regionsInOrder("en").map((r) => r.en);
    expect(en[0]).toBe("A'ali");
    expect(en).toEqual([...en].sort(new Intl.Collator("en").compare));
  });
});
