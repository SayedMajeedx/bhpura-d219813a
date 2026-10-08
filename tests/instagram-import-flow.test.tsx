import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstagramProductDraft } from "../src/lib/instagram-ai-importer";

vi.setConfig({ testTimeout: 60_000 });

// The importer as the merchant uses it, with the network calls answered by fixtures: a store that
// posts each abaya as three posts in a row pulls six posts, merges every three into a product, and
// saves two products whose pictures are all there and whose six posts are all recorded.

const stubs = vi.hoisted(() => ({
  fetchInstagramPosts: vi.fn(),
  checkScraperStatus: vi.fn(),
  fetchScraperDataset: vi.fn(),
  batchRehostAllMedia: vi.fn(),
  batchParseCaptionsWithAI: vi.fn(),
  retryImageRehostFn: vi.fn(),
  bulkInsertProducts: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));
const importer = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...stubs,
});
vi.mock("../src/lib/instagram-ai-importer", (io) => importer(io));
vi.mock("@/lib/instagram-ai-importer", (io) => importer(io));
const client = { supabase: {} };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { InstagramImporterModal } =
  await import("../src/components/inventory/InstagramImporterModal");
const { I18nProvider } = await import("../src/lib/i18n");

// Posted in two bursts: a, b, c a few minutes apart, then d, e, f hours later; the captions are on a and d.
const BURST_START = Date.UTC(2026, 9, 3, 10, 0, 0);
const minutesAt = [0, 2, 4, 200, 202, 204];
const posts = ["a", "b", "c", "d", "e", "f"].map((id, index) => ({
  id,
  postedAt: new Date(BURST_START + minutesAt[index] * 60_000).toISOString(),
  caption: id === "a" ? "عباية مرجان السعر 28 د.ب" : id === "d" ? "عباية سحاب السعر 30 د.ب" : "",
}));

function draftOf(id: string, over: Partial<InstagramProductDraft> = {}): InstagramProductDraft {
  return {
    id,
    url: `https://instagram.com/p/${id}/`,
    isSoldOut: false,
    postType: "image",
    images: [
      { url: `${id}.jpg`, r2Url: `r2/${id}.jpg`, isCover: true, selected: true, status: "success" },
    ],
    coverImageUrl: `r2/${id}.jpg`,
    imageUploadStatus: "all_success",
    title: "",
    price: null,
    description: "",
    sizes: [],
    colors: [],
    category: null,
    fieldConfidence: { name: 0, price: 0, description: 0, sizes: 0 },
    fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
    issues: ["missing_price"],
    ...over,
  };
}
// The first post of each abaya carries the caption (name and price); the other two are photos only.
const lead = (id: string, title: string, price: number) =>
  draftOf(id, {
    title,
    price,
    fieldConfidence: { name: 0.9, price: 0.95, description: 0, sizes: 0 },
    issues: [],
  });
const drafts = [
  lead("a", "عباية مرجان", 28),
  draftOf("b"),
  draftOf("c"),
  lead("d", "عباية سحاب", 30),
  draftOf("e"),
  draftOf("f"),
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("lang", "en");
  stubs.fetchInstagramPosts.mockResolvedValue({ runId: "run1", datasetId: "ds1" });
  stubs.checkScraperStatus.mockResolvedValue({ status: "SUCCEEDED" });
  stubs.fetchScraperDataset.mockResolvedValue(posts);
  stubs.batchRehostAllMedia.mockResolvedValue({ posts });
  stubs.batchParseCaptionsWithAI.mockResolvedValue({ drafts });
  stubs.bulkInsertProducts.mockResolvedValue({ successCount: 2, skippedCount: 0 });
});

describe("the Instagram importer's review screen", () => {
  it("merges posts three at a time and saves whole products", async () => {
    const onComplete = vi.fn();
    render(
      <I18nProvider>
        <InstagramImporterModal
          brandId="brand-1"
          onComplete={onComplete}
          open
          onOpenChange={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("pura.line"), { target: { value: "abaya.zh" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Extraction Pipeline/ }));

    // Six drafts to review, none of them merged yet.
    await screen.findByText(/All \(6\)/, undefined, { timeout: 30_000 });
    expect(screen.getAllByLabelText("Select to merge")).toHaveLength(6);

    // Merge every three posts in a row (the toolbar's default).
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await screen.findByText(/All \(2\)/);
    expect(screen.getAllByRole("button", { name: /Merged from 3 posts/ })).toHaveLength(2);

    // Both products are complete now (the photo-only posts took the caption post's details).
    expect(screen.getByRole("button", { name: /^Ready \(2\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve Ready \(2\)/ }));

    await waitFor(() => expect(stubs.bulkInsertProducts).toHaveBeenCalledTimes(1));
    const { brandId, products } = stubs.bulkInsertProducts.mock.calls[0][0].data as {
      brandId: string;
      products: Array<InstagramProductDraft & { mergedPostIds?: string[]; mergedFrom?: unknown }>;
    };
    expect(brandId).toBe("brand-1");
    expect(products.map((p) => [p.id, p.title, p.price])).toEqual([
      ["a", "عباية مرجان", 28],
      ["d", "عباية سحاب", 30],
    ]);
    expect(products.map((p) => p.images.length)).toEqual([3, 3]);
    expect(products.map((p) => p.mergedPostIds)).toEqual([
      ["b", "c"],
      ["e", "f"],
    ]);
    // The copies kept for splitting never leave the browser.
    expect(products.every((p) => !("mergedFrom" in p))).toBe(true);
  });

  it("splits a merged product back into its posts", async () => {
    render(
      <I18nProvider>
        <InstagramImporterModal
          brandId="brand-1"
          onComplete={vi.fn()}
          open
          onOpenChange={() => undefined}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("pura.line"), { target: { value: "abaya.zh" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Extraction Pipeline/ }));
    await screen.findByText(/All \(6\)/, undefined, { timeout: 30_000 });

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await screen.findByText(/All \(2\)/);
    fireEvent.click(screen.getAllByRole("button", { name: /Merged from 3 posts/ })[0]);
    await screen.findByText(/All \(4\)/);
  });

  it("shows real progress and can be cancelled while the posts are being pulled", async () => {
    stubs.checkScraperStatus.mockResolvedValue({ status: "RUNNING" });
    render(
      <I18nProvider>
        <InstagramImporterModal
          brandId="brand-1"
          onComplete={vi.fn()}
          open
          onOpenChange={() => undefined}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("pura.line"), { target: { value: "abaya.zh" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Extraction Pipeline/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    // Back to the form, with a note, and nothing was copied or analysed.
    await screen.findByPlaceholderText("pura.line", undefined, { timeout: 15_000 });
    expect(toast.info).toHaveBeenCalledWith("Import cancelled.");
    expect(stubs.batchRehostAllMedia).not.toHaveBeenCalled();
    expect(stubs.batchParseCaptionsWithAI).not.toHaveBeenCalled();
  });

  it("tells the merchant about posts that could not be read, and still shows the rest", async () => {
    stubs.batchParseCaptionsWithAI.mockRejectedValue(new Error("Gemini down"));
    render(
      <I18nProvider>
        <InstagramImporterModal
          brandId="brand-1"
          onComplete={vi.fn()}
          open
          onOpenChange={() => undefined}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("pura.line"), { target: { value: "abaya.zh" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Extraction Pipeline/ }));
    await screen.findByText(/All \(6\)/, undefined, { timeout: 60_000 });
    expect(toast.warning).toHaveBeenCalledWith(
      "6 posts could not be read by the AI. Fill them in by hand.",
    );
  });

  const SESSION_KEY = "boutq.instagram-import.session.brand-1";
  const openModal = () =>
    render(
      <I18nProvider>
        <InstagramImporterModal
          brandId="brand-1"
          onComplete={vi.fn()}
          open
          onOpenChange={() => undefined}
        />
      </I18nProvider>,
    );
  const startImport = async () => {
    fireEvent.change(screen.getByPlaceholderText("pura.line"), { target: { value: "abaya.zh" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Extraction Pipeline/ }));
    await screen.findByText(/All \(6\)/, undefined, { timeout: 60_000 });
  };

  it("keeps the review when the window is closed, and offers it back, merged posts and all", async () => {
    const first = openModal();
    await startImport();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await screen.findByText(/All \(2\)/);
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).not.toBeNull());
    first.unmount();

    // A new visit: the form offers the unfinished import.
    openModal();
    expect(await screen.findByText("You have an unfinished import")).toBeInTheDocument();
    expect(screen.getByText(/2 drafts from @abaya\.zh/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/All \(2\)/);
    expect(screen.getAllByRole("button", { name: /Merged from 3 posts/ })).toHaveLength(2);
    // Nothing was fetched again.
    expect(stubs.fetchInstagramPosts).toHaveBeenCalledTimes(1);
  });

  it("forgets a review the merchant discards", async () => {
    const first = openModal();
    await startImport();
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).not.toBeNull());
    first.unmount();

    openModal();
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(screen.queryByText("You have an unfinished import")).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("keeps the drafts that were not saved when the ready ones are approved", async () => {
    const first = openModal();
    await startImport();
    // Merged: two ready products. Unmerged: only the two caption posts are ready.
    fireEvent.click(screen.getByRole("button", { name: /Approve Ready \(2\)/ }));
    await waitFor(() => expect(stubs.bulkInsertProducts).toHaveBeenCalledTimes(1));
    const saved = stubs.bulkInsertProducts.mock.calls[0][0].data.products.map(
      (p: { id: string }) => p.id,
    );
    expect(saved).toEqual(["a", "d"]);
    // The four photo-only posts were left for the merchant: they are kept for later.
    await waitFor(() => {
      const kept = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
      expect(kept?.drafts.map((d: { id: string }) => d.id)).toEqual(["b", "c", "e", "f"]);
    });
    first.unmount();
  });

  it("does not keep a review that was fully saved", async () => {
    stubs.batchParseCaptionsWithAI.mockResolvedValue({
      drafts: ["a", "b", "c", "d", "e", "f"].map((id) => lead(id, `منتج ${id}`, 20)),
    });
    const first = openModal();
    await startImport();
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Approve Ready \(6\)/ }));
    await waitFor(() => expect(stubs.bulkInsertProducts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem(SESSION_KEY)).toBeNull());
    first.unmount();
  });

  it("suggests the groups from when the posts were put up, and merges the ones the merchant keeps", async () => {
    openModal();
    await startImport();

    fireEvent.click(screen.getByRole("button", { name: "Suggest groups" }));
    const dialog = await screen.findByRole("dialog");
    // Two bursts, each with its caption on the first post: both sure, both ticked.
    expect(within(dialog).getByText(/Found 2 groups \(2 sure\)/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Merge selected (2)" }));

    await screen.findByText(/All \(2\)/);
    expect(screen.getAllByRole("button", { name: /Merged from 3 posts/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Approve Ready \(2\)/ }));
    await waitFor(() => expect(stubs.bulkInsertProducts).toHaveBeenCalledTimes(1));
    const { products } = stubs.bulkInsertProducts.mock.calls[0][0].data as {
      products: Array<
        InstagramProductDraft & { mergedPostIds?: string[]; caption?: string; postedAt?: string }
      >;
    };
    expect(products.map((p) => p.mergedPostIds)).toEqual([
      ["b", "c"],
      ["e", "f"],
    ]);
    // What was only kept to suggest groups is not sent to be saved.
    expect(products.every((p) => !("caption" in p) && !("postedAt" in p))).toBe(true);
  });
});
