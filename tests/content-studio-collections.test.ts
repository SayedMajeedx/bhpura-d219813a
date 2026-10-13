import { describe, expect, it } from "vitest";
import {
  COLLECTION_LIMITS,
  isCollectionTemplate,
  lookbookEntries,
  lookbookProducts,
  shortestMinutes,
  toggleLookbookPick,
} from "../src/features/content-studio/lib/lookbook";
import type { Product } from "../src/features/content-studio/lib/studio-content";
import { menuRows } from "../src/features/content-studio/templates/menu-board";
import { fanCards } from "../src/features/content-studio/templates/bundle-set";
import { ENGINE_TEMPLATES } from "../src/features/content-studio/templates";
import { templatesForStore } from "../src/features/content-studio/lib/template-order";

// The templates that show several products share one pick: the Lookbook's
// carousel, a Menu's rows (a café's drinks, a salon's services with their
// length) and a Bundle's set of two or three.

const product = (id: string, extra: Partial<Product> = {}): Product => ({
  id,
  name: `Product ${id}`,
  name_ar: null,
  name_en: null,
  description: null,
  description_ar: null,
  image_url: `https://cdn.example/${id}.jpg`,
  media: [],
  base_price: 10,
  ...extra,
});
const catalogue = ["a", "b", "c", "d", "e", "f", "g"].map((id) => product(id));

describe("the shared pick", () => {
  it("knows the templates that show several products, and their limits", () => {
    expect(isCollectionTemplate("lookbook-carousel")).toBe(true);
    expect(isCollectionTemplate("menu-board")).toBe(true);
    expect(isCollectionTemplate("bundle-set")).toBe(true);
    expect(isCollectionTemplate("atelier-reveal")).toBe(false);
    expect(COLLECTION_LIMITS["menu-board"]).toEqual({ min: 2, max: 6, start: 5 });
    expect(COLLECTION_LIMITS["bundle-set"]).toEqual({ min: 2, max: 3, start: 3 });
  });

  it("starts each template with its own number of products, the chosen one first", () => {
    expect(lookbookProducts(catalogue, [], "c", COLLECTION_LIMITS["menu-board"])).toHaveLength(5);
    const set = lookbookProducts(catalogue, [], "c", COLLECTION_LIMITS["bundle-set"]);
    expect(set.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps a Lookbook's five as a Bundle's first three", () => {
    const five = ["a", "b", "c", "d", "e"];
    const bundle = COLLECTION_LIMITS["bundle-set"];
    expect(lookbookProducts(catalogue, five, null, bundle).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    // Taking one out works on the three that show.
    expect(toggleLookbookPick(five, "b", bundle)).toEqual(["a", "c"]);
    // Adding is refused while three show.
    expect(toggleLookbookPick(five, "g", bundle)).toBe(five);
    // A Menu takes a sixth.
    expect(toggleLookbookPick(five, "f", COLLECTION_LIMITS["menu-board"])).toEqual([...five, "f"]);
  });
});

describe("a service's length", () => {
  const variants = [
    { product_id: "s", selling_price: 35, duration_minutes: 90 },
    { product_id: "s", selling_price: 25, duration_minutes: 60 },
    { product_id: "p", selling_price: 12, duration_minutes: null },
  ];

  it("is its shortest variant's, and a product has none", () => {
    expect(shortestMinutes(product("s"), variants)).toBe(60);
    expect(shortestMinutes(product("p"), variants)).toBeNull();
  });

  it("travels with the entry the Menu draws", () => {
    const [service, item] = lookbookEntries([product("s"), product("p")], variants, "en");
    expect(service).toMatchObject({ price: 25, minutes: 60 });
    expect(item).toMatchObject({ price: 12, minutes: null });
  });
});

describe("the Menu's rows", () => {
  it("share the space, never smaller than a row needs nor taller than one should be", () => {
    const rows = menuRows(5, 100, 1100, 1);
    expect(rows.map((row) => row.h)).toEqual([190, 190, 190, 190, 190]);
    // A short menu sits in the middle of its space.
    expect(rows[0].y).toBe(100 + (1000 - 950) / 2);
    expect(menuRows(6, 0, 300, 1)[0].h).toBe(96);
  });
});

describe("the Bundle's cards", () => {
  const area = { x: 80, y: 200, w: 920, h: 860 };

  it("sets three as a trio: the first in front and centred, the others behind at either side", () => {
    const { cards, pairs } = fanCards(3, area, 1);
    const [hero, start, end] = cards;
    expect(hero.x + hero.w / 2).toBeCloseTo(area.x + area.w / 2);
    expect(hero.z).toBeGreaterThan(start.z);
    expect(start.x).toBeLessThan(hero.x);
    expect(end.x + end.w).toBeGreaterThan(hero.x + hero.w);
    expect(pairs).toEqual([
      [0, 1],
      [0, 2],
    ]);
    // Every card is 3:4 and inside the area.
    for (const card of cards) {
      expect(card.h / card.w).toBeCloseTo(4 / 3);
      expect(card.x).toBeGreaterThanOrEqual(area.x);
      expect(card.x + card.w).toBeLessThanOrEqual(area.x + area.w + 0.001);
    }
  });

  it("puts the second piece on the reading start's side: the right in Arabic", () => {
    const { cards } = fanCards(3, area, 1, true);
    expect(cards[1].x).toBeGreaterThan(cards[0].x);
    const pair = fanCards(2, area, 1, true).cards;
    expect(pair[0].x).toBeGreaterThan(pair[1].x);
  });

  it("sets two in a row joined by one plus", () => {
    const { cards, pairs } = fanCards(2, area, 1);
    expect(cards[0].x).toBeLessThan(cards[1].x);
    expect(pairs).toEqual([[0, 1]]);
  });
});

describe("which stores see them first", () => {
  const first = (vertical: string) => templatesForStore(ENGINE_TEMPLATES, vertical)[0].id;

  it("leads a café, a kitchen and a services store with the Menu, and a gift shop with the Bundle", () => {
    expect(first("coffee")).toBe("menu-board");
    expect(first("food")).toBe("menu-board");
    expect(first("services")).toBe("menu-board");
    expect(first("gifts")).toBe("bundle-set");
  });
});
