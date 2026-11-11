import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  BAHRAIN_REGIONS,
  matchRegions,
  regionLabel,
  regionsInOrder,
} from "../src/lib/bahrain-regions";
import { RegionPicker } from "../src/components/region-picker";

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

const first = (query: string, lang: "ar" | "en" = "ar") => matchRegions(query, lang)[0]?.value;

describe("finding an area by typing", () => {
  it("finds it as people write it, in either language", () => {
    expect(first("صدد")).toBe("sadad");
    expect(first("sadad")).toBe("sadad");
    expect(first("Saddad", "en")).toBe("sadad");
    // Without "ال", with another alef or a closing ha, without the apostrophe.
    expect(first("سنابس")).toBe("sanabis");
    expect(first("مدينه عيسى")).toBe("isa_town");
    expect(first("Aali", "en")).toBe("aali");
    expect(first("al hidd", "en")).toBe("hidd");
    expect(first("Diraz", "en")).toBe("duraz");
    expect(first("salman city", "en")).toBe("north_city");
  });

  it("puts names that start with what was typed first", () => {
    const found = matchRegions("مدينة", "ar").map((r) => r.ar);
    expect(found.every((name) => name.startsWith("مدينة"))).toBe(true);
    expect(
      matchRegions("riffa", "en")
        .slice(0, 3)
        .map((r) => r.value),
    ).toEqual(
      ["riffa", "riffa_east", "riffa_west"].sort((a, b) =>
        regionLabel(a, "en").localeCompare(regionLabel(b, "en")),
      ),
    );
  });

  it("gives every area for an empty search and none for nonsense", () => {
    expect(matchRegions("  ", "en")).toHaveLength(BAHRAIN_REGIONS.length);
    expect(matchRegions("zzzz", "en")).toEqual([]);
  });
});

describe("the area picker", () => {
  it("finds an area by typing and chooses it", () => {
    const onChange = vi.fn();
    render(<RegionPicker id="area" value="" onChange={onChange} lang="ar" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByLabelText("ابحث عن المنطقة"), { target: { value: "صد" } });
    fireEvent.click(screen.getByRole("option", { name: /صدد/ }));
    expect(onChange).toHaveBeenCalledWith("sadad");
  });

  it("shows the chosen area, and a filter's every-area choice", () => {
    render(<RegionPicker value="all" onChange={() => {}} lang="en" allLabel="All Regions" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("All Regions");
    render(<RegionPicker value="sadad" onChange={() => {}} lang="en" />);
    expect(screen.getAllByRole("combobox")[1]).toHaveTextContent("Sadad");
  });
});
