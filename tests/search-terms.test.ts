import { describe, expect, it } from "vitest";
import { MAX_SEARCH_WORDS, searchFilters, searchWords, wordPattern } from "../src/lib/search-terms";

// ILIKE's `_` stands for one character, so a pattern can be tried against a name here as a regex.
const matches = (pattern: string, name: string) =>
  new RegExp(`^${pattern.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(name);

describe("a shopper's search", () => {
  it("finds each Arabic spelling of a word", () => {
    const pattern = wordPattern(searchWords("عبايه")[0]);
    expect(matches(pattern, "عباية سوداء")).toBe(true);
    expect(matches(pattern, "عبايه سوداء")).toBe(true);
    expect(matches(wordPattern("احمر"), "فستان أحمر")).toBe(true);
    expect(matches(wordPattern("مستشفى"), "مستشفي")).toBe(true);
    expect(matches(wordPattern("عباية"), "فستان")).toBe(false);
    // A ha or a ya inside a word stays itself: "عبايه" does not find "عبد الله".
    expect(matches(pattern, "عبد الله")).toBe(false);
  });

  it("drops diacritics and the tatweel the shopper typed", () => {
    expect(searchWords("عَبَايَة")).toEqual(["عباية"]);
    expect(searchWords("عبـــاية")).toEqual(["عباية"]);
  });

  it("looks for every word on its own, in any order, each once", () => {
    expect(searchWords("  Black   abaya black ")).toEqual(["black", "abaya"]);
    const filters = searchFilters("abaya black", ["name", "name_en"]);
    expect(filters).toEqual([
      "name.ilike.%abaya%,name_en.ilike.%abaya%",
      "name.ilike.%black%,name_en.ilike.%black%",
    ]);
  });

  it("leaves out what would break the filter or act as a wildcard", () => {
    expect(searchWords('50%_off, (new) "x" a*b\\')).toEqual(
      ["50", "off", "new", "x", "a", "b"].slice(0, MAX_SEARCH_WORDS),
    );
    expect(searchFilters(" ,() ", ["name"])).toEqual([]);
  });

  it("asks for a bounded number of words", () => {
    expect(searchWords("a b c d e f g h")).toHaveLength(MAX_SEARCH_WORDS);
  });
});
