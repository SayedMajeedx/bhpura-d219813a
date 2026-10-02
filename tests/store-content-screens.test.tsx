import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The gallery and FAQ: the merchant's editor and the storefront's sections,
// rendered with the data layer faked.

const state = vi.hoisted(() => ({
  gallery: [] as Array<Record<string, unknown>>,
  faq: [] as Array<Record<string, unknown>>,
  saveGalleryItem: vi.fn(async () => undefined),
  saveFaqItem: vi.fn(async () => undefined),
  deleteFaqItem: vi.fn(async () => undefined),
  reorder: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const data = {
  storeContentQueries: {
    gallery: () => ({ queryKey: ["sc-test", "gallery"], queryFn: async () => state.gallery }),
    faq: () => ({ queryKey: ["sc-test", "faq"], queryFn: async () => state.faq }),
    publicGallery: () => ({ queryKey: ["sc-test", "pg"], queryFn: async () => state.gallery }),
    publicFaq: () => ({ queryKey: ["sc-test", "pf"], queryFn: async () => state.faq }),
  },
  invalidateStoreContent: vi.fn(async () => undefined),
  saveGalleryItem: state.saveGalleryItem,
  saveFaqItem: state.saveFaqItem,
  deleteFaqItem: state.deleteFaqItem,
  deleteGalleryItem: vi.fn(async () => undefined),
  reorderStoreContent: state.reorder,
};
vi.mock("../src/lib/data/store-content", () => data);
vi.mock("@/lib/data/store-content", () => data);
vi.mock("../src/lib/r2-upload", () => ({
  uploadPublicMedia: vi.fn(async () => "https://cdn.test/new.jpg"),
}));
vi.mock("@/lib/r2-upload", () => ({
  uploadPublicMedia: vi.fn(async () => "https://cdn.test/new.jpg"),
}));
const cropButton = ({
  onCrop,
  children,
}: {
  onCrop: (file: Blob) => void;
  children: React.ReactNode;
}) => (
  <button type="button" onClick={() => onCrop(new Blob(["x"], { type: "image/jpeg" }))}>
    {children}
  </button>
);
vi.mock("../src/components/crop-upload-button", () => ({ CropUploadButton: cropButton }));
vi.mock("@/components/crop-upload-button", () => ({ CropUploadButton: cropButton }));

const { StoreContentDialog } =
  await import("../src/features/store-content/components/StoreContentDialog");
const { StoreFaq } = await import("../src/features/store-content/components/StoreFaq");
const { StoreGallery } = await import("../src/features/store-content/components/StoreGallery");

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const picture = (over: Record<string, unknown>) => ({
  id: "g1",
  image_url: "https://cdn.test/a.jpg",
  caption_en: "Wedding",
  caption_ar: "زفاف",
  sort_order: 0,
  is_active: true,
  ...over,
});
const question = (over: Record<string, unknown>) => ({
  id: "q1",
  group_en: "Booking",
  group_ar: "الحجز",
  question_en: "How do I book?",
  question_ar: "كيف أحجز؟",
  answer_en: "Pick a date.",
  answer_ar: "اختر تاريخاً.",
  sort_order: 0,
  is_active: true,
  ...over,
});

beforeEach(() => {
  state.gallery = [];
  state.faq = [];
  vi.clearAllMocks();
});

describe("the storefront's gallery and FAQ", () => {
  it("show nothing for a store without any", async () => {
    const { container } = wrap(
      <>
        <StoreGallery brandId="b1" isAr={false} />
        <StoreFaq brandId="b1" isAr={false} />
      </>,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("show the pictures with captions and open one larger", async () => {
    state.gallery = [
      picture({}),
      picture({ id: "g2", caption_en: "Hidden", caption_ar: "مخفية", is_active: false }),
    ];
    wrap(<StoreGallery brandId="b1" isAr />);
    const open = await screen.findByRole("button", { name: /زفاف/ });
    expect(screen.queryByText("Hidden")).toBeNull();
    fireEvent.click(open);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("group the questions and read an answer in the reader's language", async () => {
    state.faq = [
      question({}),
      question({
        id: "q2",
        group_en: "Payment",
        group_ar: null,
        question_en: "Deposit?",
        answer_en: "Yes.",
        question_ar: null,
        answer_ar: null,
        sort_order: 1,
      }),
      question({ id: "q3", question_en: "Hidden one", is_active: false, sort_order: 2 }),
    ];
    wrap(<StoreFaq brandId="b1" isAr />);
    expect(await screen.findByText("كيف أحجز؟")).toBeInTheDocument();
    expect(screen.getByText("الحجز")).toBeInTheDocument();
    expect(screen.getByText("Deposit?")).toBeInTheDocument();
    expect(screen.queryByText("Hidden one")).toBeNull();
    fireEvent.click(screen.getByText("كيف أحجز؟"));
    expect(await screen.findByText("اختر تاريخاً.")).toBeInTheDocument();
  });
});

describe("the merchant's editor", () => {
  const open = () =>
    wrap(<StoreContentDialog brandId="b1" isAr={false} open onOpenChange={vi.fn()} />);

  it("adds a picture: upload, caption, save after the last one", async () => {
    state.gallery = [picture({ sort_order: 4 })];
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Add a picture" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Upload a picture" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Caption (English)"), { target: { value: "Gala" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.saveGalleryItem).toHaveBeenCalledTimes(1));
    expect(state.saveGalleryItem).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({ image_url: "https://cdn.test/new.jpg", caption_en: "Gala" }),
      5,
    );
  });

  it("adds a question in one language and moves another up", async () => {
    state.faq = [
      question({ id: "q1", sort_order: 0 }),
      question({ id: "q2", question_en: "Second?", sort_order: 1 }),
    ];
    open();
    fireEvent.click(await screen.findByRole("tab", { name: "FAQ" }));
    const row = (await screen.findByText("Second?")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Move up" }));
    await waitFor(() =>
      expect(state.reorder).toHaveBeenCalledWith("b1", "store_faq_items", [
        { id: "q2", sort_order: 0 },
        { id: "q1", sort_order: 1 },
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a question" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Question (Arabic)"), { target: { value: "سؤال" } });
    fireEvent.change(screen.getByLabelText("Answer (Arabic)"), { target: { value: "جواب" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.saveFaqItem).toHaveBeenCalledTimes(1));
    expect(state.saveFaqItem).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({ question_ar: "سؤال", answer_ar: "جواب", question_en: null }),
      2,
    );
  });
});
