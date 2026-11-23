import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { StoreOffer } from "../src/lib/offers";

// The store's offers, display currencies and gift card offer come with the page (the speed
// review of 2026-11-22): the browser asked Mumbai for each once the page had shown.

const reads: string[] = [];
const client = {
  supabase: {
    rpc: (fn: string) => {
      reads.push(fn);
      if (fn === "storefront_gift_card_offer") return Promise.reject(new Error("down"));
      if (fn === "storefront_active_offers")
        return Promise.resolve({ data: [{ id: "o1" }], error: null });
      return Promise.resolve({ data: null, error: null });
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { plantPageSeeds, readPageSeeds } =
  await import("../src/features/storefront-shell/lib/page-seeds");
const { offersQueries } = await import("../src/lib/data/offers");
const { currencyDisplayQueries } = await import("../src/lib/data/currency-display");
const { giftCardOnlineQueries } = await import("../src/lib/data/gift-cards/online");

describe("what every store page asks for, read with the page", () => {
  it("is read on the server, a failed read left for the browser", async () => {
    vi.stubGlobal("window", undefined);
    const seeds = await readPageSeeds("pura");
    vi.unstubAllGlobals();
    expect(reads.sort()).toEqual([
      "storefront_active_offers",
      "storefront_currency_display",
      "storefront_gift_card_offer",
    ]);
    expect(seeds?.offers).toEqual([{ id: "o1" }]);
    expect(seeds?.currency).toBeNull();
    expect(seeds && "giftCard" in seeds ? seeds.giftCard : "missing").toBeUndefined();
  });

  it("is not read again by a browser's own navigation", async () => {
    reads.length = 0;
    expect(await readPageSeeds("pura")).toBeNull();
    expect(reads).toEqual([]);
  });

  it("fills the browser's cache dated when it was read, never over what it holds", () => {
    const qc = new QueryClient();
    const held = [{ id: "kept" }];
    qc.setQueryData(offersQueries.live("pura").queryKey, held);
    plantPageSeeds(qc, "pura", {
      readAt: 1_000,
      offers: [{ id: "o1" }] as unknown as StoreOffer[],
      currency: null,
      giftCard: undefined,
    });
    expect(qc.getQueryData(offersQueries.live("pura").queryKey)).toBe(held);
    const currency = qc.getQueryState(currencyDisplayQueries.store("pura").queryKey);
    expect(currency?.data).toBeNull();
    expect(currency?.dataUpdatedAt).toBe(1_000);
    expect(qc.getQueryState(giftCardOnlineQueries.offer("pura").queryKey)).toBeUndefined();
  });
});
