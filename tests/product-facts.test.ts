import { describe, expect, it } from "vitest";
import { FACT_LIMITS, cleanFacts, factLines, factSet, splitList } from "../src/lib/product-facts";
import { detailGroups, productDetailLines } from "../src/features/product-page/lib/product-details";
import { buildProductSchema } from "../src/lib/seo/structured-data";
import { productColumnsFrom, productFormFrom } from "../src/features/inventory/lib/product-form";

// What a product is, in the facts its kind of store records (products.details).

const keys = (vertical: string) => factSet(vertical).fields.map((field) => field.key);

describe("each kind of store's facts", () => {
  it("are its own, else its family's, and none for the general store", () => {
    expect(keys("fragrance")).toEqual([
      "concentration",
      "family",
      "top_notes",
      "heart_notes",
      "base_notes",
      "longevity",
    ]);
    expect(keys("beauty")).toContain("key_ingredients");
    // Abayas are fashion; a roastery has its own, not food's allergens.
    expect(keys("abayas")).toEqual(keys("fashion"));
    expect(keys("coffee")).toContain("roast");
    expect(keys("coffee")).not.toContain("allergens");
    expect(keys("food")).toContain("allergens");
    expect(keys("jewelry")).toEqual(["metal", "karat", "weight", "stones", "certificate"]);
    expect(keys("general")).toEqual([]);
    expect(keys("services")).toEqual([]);
    expect(factSet("fragrance").layout).toBe("notes");
    expect(factSet("food").layout).toBe("allergens");
  });
});

describe("the facts kept", () => {
  it("keep known shapes, trimmed and bounded, and drop the rest", () => {
    expect(
      cleanFacts({
        origin: "  Ethiopia ",
        tasting_notes: [" jasmine", "jasmine", "", 4, "peach"],
        altitude: 1900.12345,
        weight: -3,
        blank: "   ",
        nested: { a: 1 },
        "Bad Key": "x",
      }),
    ).toEqual({ origin: "Ethiopia", tasting_notes: ["jasmine", "peach"], altitude: 1900.123 });
    expect(cleanFacts(null)).toEqual({});
    expect(cleanFacts(["a"])).toEqual({});
    const long = cleanFacts({
      story: "x".repeat(1000),
      notes: Array.from({ length: 30 }, (_, i) => `note ${i}`),
    });
    expect(String(long.story)).toHaveLength(FACT_LIMITS.text);
    expect(long.notes).toHaveLength(FACT_LIMITS.items);
  });

  it("read a list typed as one line, in Arabic or English", () => {
    expect(splitList("ورد، عود ،مسك")).toEqual(["ورد", "عود", "مسك"]);
    expect(splitList("rose, oud,, ")).toEqual(["rose", "oud"]);
  });
});

describe("the facts a shopper reads", () => {
  it("are the set's, in its order, in the reader's language", () => {
    const facts = {
      longevity: "long",
      top_notes: ["Bergamot", "Saffron"],
      concentration: "edp",
      retired: "a fact the set no longer offers",
    };
    expect(factLines(facts, "fragrance", "en")).toEqual([
      { key: "concentration", label: "Concentration", value: "Eau de Parfum" },
      {
        key: "top_notes",
        label: "Top notes",
        value: "Bergamot, Saffron",
        items: ["Bergamot", "Saffron"],
      },
      { key: "longevity", label: "Longevity", value: "Long-lasting" },
    ]);
    expect(factLines({ allergens: ["nuts", "dairy"] }, "food", "ar")).toEqual([
      {
        key: "allergens",
        label: "يحتوي على",
        value: "المكسرات، الحليب",
        items: ["المكسرات", "الحليب"],
      },
    ]);
    expect(factLines({ weight: 4.2, karat: "21k" }, "jewelry", "en")).toEqual([
      { key: "karat", label: "Karat", value: "21K" },
      { key: "weight", label: "Weight", value: "4.2 g" },
    ]);
  });

  it("are laid out for the kind of store: a perfume's notes, a food's allergens", () => {
    const perfume = productDetailLines({
      fabricLabel: "Fabric",
      facts: { concentration: "oil", base_notes: ["Oud"], top_notes: ["Rose"] },
      vertical: "fragrance",
      lang: "en",
    });
    const groups = detailGroups(perfume, "fragrance");
    expect(groups.notes.map((line) => line.key)).toEqual(["top_notes", "base_notes"]);
    expect(groups.rest.map((line) => line.key)).toEqual(["concentration"]);

    const sweet = productDetailLines({
      fabricLabel: "Fabric",
      facts: { serves: "6", allergens: ["nuts"] },
      vertical: "food",
      lang: "en",
    });
    const food = detailGroups(sweet, "food");
    expect(food.allergens?.value).toBe("Nuts");
    expect(food.rest.map((line) => line.key)).toEqual(["serves"]);

    // A fashion product: its fabric and occasion first, then its facts.
    const abaya = productDetailLines({
      fabricType: "Crepe",
      fabricLabel: "Fabric",
      occasion: "يومي",
      facts: { fit: "relaxed" },
      vertical: "abayas",
      lang: "en",
    });
    expect(abaya.map((line) => `${line.label}: ${line.value}`)).toEqual([
      "Fabric: Crepe",
      "Occasion: Daily",
      "Fit: Relaxed",
    ]);
  });

  it("go to Google as the product's properties", () => {
    const schema = buildProductSchema(
      {
        id: "p1",
        name_en: "Oud oil",
        price: 20,
        properties: [{ name: "Concentration", value: "Perfume oil" }],
      },
      { slug: "store" },
      undefined,
      "en",
    ) as Record<string, unknown>;
    expect(schema.additionalProperty).toEqual([
      { "@type": "PropertyValue", name: "Concentration", value: "Perfume oil" },
    ]);
    const bare = buildProductSchema({ id: "p2", name_en: "Plain", price: 5 }, { slug: "s" });
    expect("additionalProperty" in bare).toBe(false);
  });
});

describe("the product editor", () => {
  it("opens a product's facts clean and saves them clean", () => {
    const form = productFormFrom({
      id: "p1",
      name: "Oud",
      details: { concentration: "oil", junk: { a: 1 } },
      product_variants: [],
    } as unknown as Parameters<typeof productFormFrom>[0]);
    expect(form.details).toEqual({ concentration: "oil" });
    const columns = productColumnsFrom({
      ...form,
      details: { ...form.details, top_notes: [" Rose ", "Rose"], longevity: "" },
    });
    expect(columns.details).toEqual({ concentration: "oil", top_notes: ["Rose"] });
  });
});
