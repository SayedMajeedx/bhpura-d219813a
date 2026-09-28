import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderReviewAdminRow } from "../src/lib/order-reviews";

// The review story dialog on the engine: it previews the animated story and
// downloads it as an MP4 or a PNG, with only what is safe to publish.

const exporting = vi.hoisted(() => ({
  exportTemplateMp4: vi.fn(async () => new Blob(["mp4"], { type: "video/mp4" })),
  exportTemplatePng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  deliverCreativeFile: vi.fn(async () => "downloaded" as const),
}));
const engineExport = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  canExportMp4: async () => true,
  exportTemplateMp4: exporting.exportTemplateMp4,
  exportTemplatePng: exporting.exportTemplatePng,
});
vi.mock("../src/features/content-studio/engine/export", (io) => engineExport(io));
vi.mock("@/features/content-studio/engine/export", (io) => engineExport(io));
const creativeExport = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  deliverCreativeFile: exporting.deliverCreativeFile,
});
vi.mock("../src/lib/creative-export", (io) => creativeExport(io));
vi.mock("@/lib/creative-export", (io) => creativeExport(io));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const { ReviewStoryDialog } =
  await import("../src/features/review-story/components/ReviewStoryDialog");

// jsdom has no canvas: the preview simply draws nothing.
const getContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = getContext;
});
beforeEach(() => vi.clearAllMocks());

const review: OrderReviewAdminRow = {
  review_id: "r1",
  request_id: "q1",
  order_id: "o1",
  invoice_number: 1042,
  customer_name: "Fatima Al-Mansoor",
  customer_phone: "97339001122",
  rating: 4,
  highlights: ["quality"],
  comment: "Beautiful abaya, fast delivery",
  reward_code: "THANKU10",
  reviewed_at: "2026-09-20T10:00:00Z",
  request_sent_at: null,
};

const open = () =>
  render(
    <ReviewStoryDialog
      open
      onOpenChange={() => undefined}
      review={review}
      brandName="Pura"
      isAr={false}
      brandInstagram="@pura.bh"
      productImages={["https://cdn.example/p1.jpg"]}
    />,
  );

type Exported = { template: { id: string }; scene: Record<string, unknown> };

describe("the review story dialog", () => {
  it("previews the animated story and downloads it as an MP4", async () => {
    open();
    expect(screen.getByRole("img", { name: "Customer review story preview" })).toBeInTheDocument();
    const download = screen.getByRole("button", { name: "Download story video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.deliverCreativeFile).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      Exported,
    ];
    expect(template.id).toBe("review-story");
    expect(scene).toMatchObject({
      width: 1080,
      height: 1920,
      look: "classic",
      customer: "Fatima",
      rating: 4,
      comment: "Beautiful abaya, fast delivery",
      highlights: ["Product quality"],
      contact: "Instagram: @pura.bh",
    });
    expect(JSON.stringify(scene)).not.toMatch(/Al-Mansoor|1042|97339001122|THANKU10/);
    expect(exporting.deliverCreativeFile).toHaveBeenCalledWith(
      expect.any(Blob),
      "customer-review-story-r1.mp4",
      "video/mp4",
      "Pura",
    );
  });

  it("downloads the frame the preview is paused on", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.change(screen.getByRole("slider", { name: "Timeline" }), {
      target: { value: "2" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Or download the frame at 2.0 s (PNG)" }),
    );
    await waitFor(() => expect(exporting.exportTemplatePng).toHaveBeenCalledTimes(1));
    expect(exporting.exportTemplatePng).toHaveBeenCalledWith(expect.objectContaining({ t: 2 }));
  });

  it("downloads the merchant's choices as a still: the look, a hidden name, no highlights", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Midnight Dark/ }));
    const switches = screen.getAllByRole("switch");
    // Order: date, contacts, first name, highlights.
    fireEvent.click(switches[2]);
    fireEvent.click(switches[3]);
    fireEvent.click(screen.getByRole("button", { name: "Or download static story (PNG)" }));
    await waitFor(() => expect(exporting.exportTemplatePng).toHaveBeenCalledTimes(1));
    const [{ scene }] = exporting.exportTemplatePng.mock.lastCall as unknown as [Exported];
    expect(scene).toMatchObject({
      look: "midnight",
      customer: "Verified customer",
      highlights: [],
    });
    await waitFor(() =>
      expect(exporting.deliverCreativeFile).toHaveBeenCalledWith(
        expect.any(Blob),
        "customer-review-story-r1.png",
        "image/png",
        "Pura",
      ),
    );
  });
});
