import { describe, expect, it } from "vitest";
import { importedPostIds } from "../src/features/instagram-import/lib/imported-posts";

// A post counts as imported only while the product made from it exists, so a merchant who deletes
// a product can import that post again.

const at = (time: string) => `2026-10-09T${time}Z`;
const product = (id: string, time: string, custom_fields: unknown = []) => ({
  id,
  created_at: at(time),
  custom_fields,
});

describe("importedPostIds", () => {
  it("counts the posts of a product that still exists, merged posts included", () => {
    const runs = [
      {
        created_at: at("06:00:01.000"),
        issues: {
          imported_post_ids: ["a", "b", "c"],
          products: [{ product_id: "p1", post_ids: ["a", "b", "c"] }],
        },
      },
    ];
    expect([...importedPostIds(runs, [product("p1", "06:00:00.500")])].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("frees the posts of a product that was deleted", () => {
    const runs = [
      {
        created_at: at("06:00:01.000"),
        issues: {
          imported_post_ids: ["a", "b"],
          products: [
            { product_id: "p1", post_ids: ["a"] },
            { product_id: "p2", post_ids: ["b"] },
          ],
        },
      },
    ];
    // p1 was deleted, p2 is still there.
    expect([...importedPostIds(runs, [product("p2", "06:00:00.800")])]).toEqual(["b"]);
    expect(importedPostIds(runs, []).size).toBe(0);
  });

  it("reads a run from before products were recorded by whether a product was made just before it", () => {
    const legacy = (time: string, ids: string[]) => ({
      created_at: at(time),
      issues: { imported_post_ids: ids },
    });
    const runs = [legacy("06:21:12.394", ["kept"]), legacy("05:50:08.000", ["deleted"])];
    // Only a product from 06:21:11 exists; the 05:50 one was deleted.
    expect([...importedPostIds(runs, [product("p", "06:21:11.919")])]).toEqual(["kept"]);
    // A product made after the run does not belong to it.
    expect(
      importedPostIds([legacy("06:00:00.000", ["x"])], [product("p", "06:30:00.000")]).size,
    ).toBe(0);
  });

  it("still reads the post an old import kept on the product itself", () => {
    const own = product("p", "01:00:00.000", [{ key: "instagram_post_id", value: "z" }]);
    expect([...importedPostIds([], [own])]).toEqual(["z"]);
    const asObject = product("q", "01:00:00.000", { instagram_post_id: "y" });
    expect([...importedPostIds([], [asObject])]).toEqual(["y"]);
  });

  it("copes with missing issues", () => {
    expect(importedPostIds([{ created_at: at("01:00:00.000"), issues: null }], []).size).toBe(0);
  });
});
