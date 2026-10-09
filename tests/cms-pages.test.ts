import { describe, expect, it } from "vitest";
import { storedFooterTitles, storedPageItems, storedPages } from "../src/lib/cms-pages";
import {
  buildPagesPayload,
  editorSnapshot,
  pagesSurvived,
} from "../src/components/pages/pages-payload";

const titles = { companyEn: "Company", companyAr: "الشركة", helpEn: "Help", helpAr: "المساعدة" };
const page = (slug: string, group: "company" | "help") => ({
  slug,
  title_ar: "",
  title_en: slug,
  content_ar: "",
  content_en: "",
  image_url: null,
  menu_icon_url: null,
  image_position: "top" as const,
  meta_title: "",
  meta_description: "",
  group,
});

describe("reading stored pages", () => {
  it("reads both shapes and ignores junk", () => {
    const list = [{ slug: "a" }, "x", null];
    expect(storedPageItems(list)).toEqual([{ slug: "a" }]);
    expect(storedPageItems({ items: list })).toEqual([{ slug: "a" }]);
    expect(storedPageItems(null)).toEqual([]);
    expect(storedPageItems({ items: "no" })).toEqual([]);
  });

  it("types and defaults each page", () => {
    expect(
      storedPages([{ slug: "a", group: "company", image_position: "bottom" }])[0],
    ).toMatchObject({
      slug: "a",
      group: "company",
      image_position: "bottom",
      title_en: null,
    });
    expect(storedPages([{ slug: 5 }])[0]).toMatchObject({
      slug: null,
      group: "help",
      image_position: "top",
    });
  });

  it("reads only the headings the store wrote", () => {
    expect(storedFooterTitles([])).toBeNull();
    expect(
      storedFooterTitles({ items: [], footer_titles: { help_en: " Care ", company_en: " " } }),
    ).toEqual({
      help_en: "Care",
    });
  });
});

describe("pagesSurvived", () => {
  const sent = buildPagesPayload([page("about", "company"), page("faq", "help")], titles);

  it("is true when the database kept the same pages and headings", () => {
    expect(pagesSurvived(sent, JSON.parse(JSON.stringify(sent)))).toBe(true);
  });

  it("is false when the database emptied them", () => {
    expect(pagesSurvived(sent, [])).toBe(false);
  });

  it("is false when a group or heading was changed", () => {
    const moved = JSON.parse(JSON.stringify(sent));
    moved.items[0].group = "help";
    expect(pagesSurvived(sent, moved)).toBe(false);
    const renamed = JSON.parse(JSON.stringify(sent));
    renamed.footer_titles.help_en = "Other";
    expect(pagesSurvived(sent, renamed)).toBe(false);
  });
});

describe("editorSnapshot", () => {
  it("changes with any edit and not otherwise", () => {
    const base = editorSnapshot([page("a", "help")], [], titles);
    expect(editorSnapshot([page("a", "help")], [], titles)).toBe(base);
    expect(editorSnapshot([page("a", "company")], [], titles)).not.toBe(base);
    expect(editorSnapshot([page("a", "help")], [], { ...titles, helpEn: "x" })).not.toBe(base);
  });
});
