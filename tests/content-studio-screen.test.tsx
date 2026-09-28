import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The content studio as merchants use it: the copy fills from the chosen
// product, the PNG exports at the chosen format's size, the caption follows
// the chosen variant, a product video switches to the video exports, and the
// style and edition label reach the stage. Written before the studio was split
// into src/features/content-studio, and kept to prove the split changed nothing.

const exporting = vi.hoisted(() => ({
  html2canvas: vi.fn(async () => ({
    toBlob: (done: (blob: Blob) => void) => done(new Blob(["png"], { type: "image/png" })),
  })),
  deliverCreativeFile: vi.fn(async () => "downloaded" as const),
  exportTemplateMp4: vi.fn(async () => new Blob(["mp4"], { type: "video/mp4" })),
  exportTemplatePng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  exportTemplateCarousel: vi.fn(async () => [
    new Blob(["one"], { type: "image/png" }),
    new Blob(["two"], { type: "image/png" }),
  ]),
  deliverCreativeFiles: vi.fn(async () => "downloaded" as const),
}));
// The engine's exporters (WebCodecs is not in jsdom; tested in the engine suite).
const engineExport = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  canExportMp4: async () => true,
  exportTemplateMp4: exporting.exportTemplateMp4,
  exportTemplatePng: exporting.exportTemplatePng,
  exportTemplateCarousel: exporting.exportTemplateCarousel,
});
vi.mock("../src/features/content-studio/engine/export", (io) => engineExport(io));
vi.mock("@/features/content-studio/engine/export", (io) => engineExport(io));
vi.mock("html2canvas-pro", () => ({ default: exporting.html2canvas }));
const creativeExport = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  deliverCreativeFile: exporting.deliverCreativeFile,
  deliverCreativeFiles: exporting.deliverCreativeFiles,
});
vi.mock("../src/lib/creative-export", (io) => creativeExport(io));
vi.mock("@/lib/creative-export", (io) => creativeExport(io));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const fixture = (key: string, value: unknown) => () => ({
  queryKey: ["content-studio-test", key],
  queryFn: async () => value,
});
const products = [
  {
    id: "p1",
    name: "Silk Abaya",
    name_ar: "عباية حرير",
    name_en: "Silk Abaya",
    description: "Flowing silk crepe for evenings.",
    description_ar: null,
    image_url: "https://cdn.example/p1.jpg",
    media: [
      { url: "https://cdn.example/p1-back.jpg" },
      { url: "https://cdn.example/p1.mp4", type: "video" },
    ],
    base_price: 42,
    fabric_type: "Silk",
    occasion: "Evening",
  },
  {
    id: "p2",
    name: "Linen Kaftan",
    name_ar: null,
    name_en: "Linen Kaftan",
    description: null,
    description_ar: null,
    image_url: "https://cdn.example/p2.jpg",
    media: [],
    base_price: 30,
  },
];
const variants = [
  {
    id: "v1",
    product_id: "p1",
    size: "M",
    color: "Black",
    selling_price: 39,
    original_price: 42,
    stock_main: 2,
    stock_incubator: 0,
    image_url: null,
  },
  {
    id: "v2",
    product_id: "p1",
    size: "L",
    color: "Sand",
    selling_price: 42,
    stock_main: 0,
    stock_incubator: 0,
    image_url: null,
  },
];
const catalog = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as {
    catalogInsightQueries: object;
    catalogQueries: object;
  };
  return {
    ...actual,
    catalogInsightQueries: {
      ...actual.catalogInsightQueries,
      contentStudio: fixture("products", products),
    },
    catalogQueries: { ...actual.catalogQueries, variants: fixture("variants", variants) },
  };
};
vi.mock("../src/lib/data/catalog", (io) => catalog(io));
vi.mock("@/lib/data/catalog", (io) => catalog(io));
const settings = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { businessSettingsQueries: object };
  return {
    ...actual,
    businessSettingsQueries: {
      ...actual.businessSettingsQueries,
      detail: fixture("settings", {
        business_name: "Pura",
        logo_url: null,
        phone: "+97333000000",
        socials: [{ name: "Instagram", url: "https://instagram.com/pura.bh" }],
        currency: "BHD",
      }),
    },
  };
};
vi.mock("../src/lib/data/business-settings", (io) => settings(io));
vi.mock("@/lib/data/business-settings", (io) => settings(io));
const brandContext = {
  useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura", name_ar: "بورا", logo_url: null }),
};
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const storeProfile = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useAdminStoreProfile: () => ({
    profile: { vertical: "fashion", modules: { made_to_order: false } },
    isLoading: false,
  }),
});
vi.mock("../src/hooks/use-store-profile", (io) => storeProfile(io));
vi.mock("@/hooks/use-store-profile", (io) => storeProfile(io));
// Saved drafts, kept in memory instead of the database.
const draftStore = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown> & { id: string }>,
}));
const contentDrafts = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  contentDraftsQueries: {
    list: (brandId: string) => ({
      queryKey: ["content-drafts", brandId, "list"],
      queryFn: async () => [...draftStore.rows],
    }),
  },
  createContentDraft: vi.fn(async (_brandId: string, values: Record<string, unknown>) => {
    const id = `d${draftStore.rows.length + 1}`;
    draftStore.rows.unshift({ ...values, id, updated_at: "2026-09-29T10:00:00Z" });
    return id;
  }),
  updateContentDraft: vi.fn(async (_b: string, id: string, values: Record<string, unknown>) => {
    const row = draftStore.rows.find((draft) => draft.id === id);
    if (row) Object.assign(row, values);
  }),
  deleteContentDraft: vi.fn(async (_b: string, id: string) => {
    draftStore.rows = draftStore.rows.filter((draft) => draft.id !== id);
  }),
});
vi.mock("../src/lib/data/content-drafts", (io) => contentDrafts(io));
vi.mock("@/lib/data/content-drafts", (io) => contentDrafts(io));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useParams: () => ({ slug: "pura" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { Route } =
  (await import("../src/routes/_authenticated/admin.b.$slug.content-studio")) as unknown as {
    Route: { options: { component: React.ComponentType } };
  };
const { I18nProvider } = await import("../src/lib/i18n");
const Studio = Route.options.component;

// jsdom has no layout: give the stage its real reference width.
const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 570,
  });
});
afterAll(() => {
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
});
// jsdom has no canvas: the preview simply draws nothing.
const getContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = getContext;
});
const clipboard = { writeText: vi.fn(async () => undefined) };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
});

const renderStudio = async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <Studio />
      </I18nProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Headline")).toHaveValue("Silk Abaya"));
  return document.querySelector<HTMLElement>("#studio-preview .isolate")!;
};
const openSelect = (trigger: HTMLElement) =>
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });

describe("the content studio", () => {
  it("fills the copy from the first product and shows it on the stage", async () => {
    const stage = await renderStudio();
    expect(within(stage).getByRole("heading", { name: "Silk Abaya" })).toBeInTheDocument();
    expect(screen.getByLabelText("Body copy")).toHaveValue("Flowing silk crepe for evenings.");
    expect(within(stage).getByText("42.000 BHD")).toBeInTheDocument();
    expect(within(stage).getByText("@pura.bh")).toBeInTheDocument();
  });

  it("shows the chosen variant's price on the stage (bug #34)", async () => {
    const stage = await renderStudio();
    openSelect(screen.getByRole("combobox", { name: "Product Variant" }));
    fireEvent.click(await screen.findByRole("option", { name: /M · Black/ }));
    expect(await within(stage).findByText("39.000 BHD")).toBeInTheDocument();
    expect(within(stage).queryByText("42.000 BHD")).not.toBeInTheDocument();
  });

  it("exports a PNG at the chosen format's size and name", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /Square/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    await waitFor(() => expect(exporting.deliverCreativeFile).toHaveBeenCalledTimes(1));
    expect(exporting.html2canvas).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ scale: 1080 / 570, useCORS: true }),
    );
    expect(exporting.deliverCreativeFile).toHaveBeenCalledWith(
      expect.any(Blob),
      "pura-silk-abaya-square.png",
      "image/png",
      "Silk Abaya",
    );
  });

  it("writes the caption with the chosen variant's price and the sizes in stock", async () => {
    await renderStudio();
    openSelect(screen.getByRole("combobox", { name: "Product Variant" }));
    fireEvent.click(await screen.findByRole("option", { name: /M · Black/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Instagram Caption" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(1));
    const caption = String(clipboard.writeText.mock.lastCall?.[0]);
    expect(caption).toContain("✨ Silk Abaya");
    expect(caption).toContain("💰 39.000 BHD");
    expect(caption).toContain("المقاسات المتوفرة للبيع الفوري: M");
    expect(caption).not.toContain("M · L");
  });

  it("offers the video exports once the product video is picked", async () => {
    await renderStudio();
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Video 2"));
    expect(await screen.findByRole("button", { name: "Download Video (MP4)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download options" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download PNG" })).not.toBeInTheDocument();
  });

  it("applies the visual style and the edition label to the stage", async () => {
    const stage = await renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /Maison/ }));
    expect(stage).toHaveStyle({ background: "#330a0a" });
    fireEvent.change(screen.getByLabelText("Edition label"), { target: { value: "Eid Edit" } });
    expect(within(stage).getByText("Eid Edit")).toBeInTheDocument();
  });

  it("switches to the second product and refills the copy", async () => {
    await renderStudio();
    openSelect(screen.getByRole("combobox", { name: "Product" }));
    fireEvent.click(await screen.findByRole("option", { name: "Linen Kaftan" }));
    await waitFor(() => expect(screen.getByLabelText("Headline")).toHaveValue("Linen Kaftan"));
    expect(screen.getByLabelText("Body copy")).toHaveValue(
      "Quiet elegance, thoughtful details for every moment.",
    );
  });

  it("orders the templates for the store, suggesting the best three", async () => {
    await renderStudio();
    const names = screen
      .getAllByRole("radio")
      .filter((radio) => radio.closest("[aria-labelledby='studio-template-label']"))
      .map((radio) => radio.textContent ?? "");
    // The fixture store sells fashion.
    expect(names[0]).toMatch(/^Classic/);
    expect(names.slice(1, 4)).toEqual([
      expect.stringMatching(/^Atelier Reveal.*Suggested/),
      expect.stringMatching(/^Lookbook.*Suggested/),
      expect.stringMatching(/^Swatch Run.*Suggested/),
    ]);
    expect(names.filter((name) => name.includes("Suggested"))).toHaveLength(3);
  });

  it("keeps Classic as the default template", async () => {
    await renderStudio();
    expect(screen.getByRole("radio", { name: /Classic/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Atelier Reveal/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("plays Atelier Reveal in an animated preview that can be paused and scrubbed", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Atelier Reveal/ }));
    expect(await screen.findByRole("img", { name: /Atelier Reveal/ })).toBeInTheDocument();
    expect(screen.getByText(/1080 × 1920 px · 7 s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Timeline" }), {
      target: { value: "3.5" },
    });
    expect(screen.getByText("3.5 s")).toBeInTheDocument();
  });

  it("exports Atelier Reveal as an MP4 with the studio's copy, price and format", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Atelier Reveal/ }));
    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.deliverCreativeFile).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      { template: { id: string }; scene: Record<string, unknown> },
    ];
    expect(template.id).toBe("atelier-reveal");
    expect(scene).toMatchObject({
      width: 1080,
      height: 1920,
      format: "story",
      lang: "en",
      headline: "Silk Abaya",
      price: "42.000 BHD",
    });
    expect(exporting.deliverCreativeFile).toHaveBeenCalledWith(
      expect.any(Blob),
      "pura-silk-abaya-story.mp4",
      "video/mp4",
      "Silk Abaya",
    );
  });

  it("builds Price Drop from the chosen variant's sale, and says when there is none", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Price Drop/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("no sale price right now");

    openSelect(screen.getByRole("combobox", { name: "Product Variant" }));
    fireEvent.click(await screen.findByRole("option", { name: /M · Black/ }));
    await waitFor(() =>
      expect(screen.queryByText(/no sale price right now/)).not.toBeInTheDocument(),
    );

    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.exportTemplateMp4).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      { template: { id: string }; scene: Record<string, unknown> },
    ];
    expect(template.id).toBe("price-drop");
    expect(scene).toMatchObject({
      priceAmount: "39.000",
      originalAmount: "42.000",
      originalPrice: "42.000 BHD",
      currencyLabel: "BHD",
      discountPercent: 7,
    });
  });

  it("runs Swatch Run through the product's colours, and says when it has only one", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Swatch Run/ }));
    expect(screen.queryByText(/one option only/)).not.toBeInTheDocument();

    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.exportTemplateMp4).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      {
        template: { id: string };
        scene: { options: { swatch: boolean; stops: Array<{ label: string }> } | null };
      },
    ];
    expect(template.id).toBe("swatch-run");
    expect(scene.options?.swatch).toBe(true);
    expect(scene.options?.stops.map((stop) => stop.label)).toEqual(["Black", "Sand"]);

    openSelect(screen.getByRole("combobox", { name: "Product" }));
    fireEvent.click(await screen.findByRole("option", { name: "Linen Kaftan" }));
    expect(await screen.findByText(/one option only/)).toBeInTheDocument();
  });

  it("shows only the controls a template uses, with the logo's size and colour", async () => {
    await renderStudio();
    expect(screen.getByText("Product photo framing")).toBeInTheDocument();
    expect(screen.getByText("Header & Branding Bar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Atelier Reveal/ }));
    expect(await screen.findByText("Brand mark")).toBeInTheDocument();
    expect(screen.queryByText("Product photo framing")).not.toBeInTheDocument();
    expect(screen.queryByText("Header & Branding Bar")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Headline")).toBeInTheDocument();
    expect(screen.getByLabelText("Body copy")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Logo size"), { target: { value: "1.6" } });
    expect(screen.getByText("160%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "White" }));

    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.exportTemplateMp4).toHaveBeenCalledTimes(1));
    const [{ scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      { scene: { body: string; brand: { logoScale: number; logoTint: string } } },
    ];
    expect(scene.brand).toMatchObject({ logoScale: 1.6, logoTint: "white" });
    expect(scene.body).toBe("Flowing silk crepe for evenings.");

    fireEvent.click(screen.getByRole("radio", { name: /Classic/ }));
    expect(await screen.findByText("Header & Branding Bar")).toBeInTheDocument();
  });

  it("exports Editorial Cover with this month as its issue line", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Editorial Cover/ }));
    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.exportTemplateMp4).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      { template: { id: string; duration: number }; scene: { issueLabel: string } },
    ];
    expect(template).toMatchObject({ id: "editorial-cover", duration: 8 });
    expect(scene.issueLabel).toBe(
      new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date()),
    );
  });

  it("builds a Lookbook from several products and exports it as a carousel", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Lookbook/ }));
    const picks = await screen.findByRole("group", { name: "Lookbook products" });
    // The lookbook picks products, so the single-product picker steps aside.
    expect(screen.queryByRole("combobox", { name: "Product" })).not.toBeInTheDocument();
    const silk = within(picks).getByRole("button", { name: /Silk Abaya/ });
    const linen = within(picks).getByRole("button", { name: /Linen Kaftan/ });
    expect(silk).toHaveAttribute("aria-pressed", "true");
    expect(linen).toHaveAttribute("aria-pressed", "true");
    // Two is the fewest a lookbook carries.
    fireEvent.click(silk);
    expect(silk).toHaveAttribute("aria-pressed", "true");

    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.exportTemplateMp4).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      {
        template: { id: string };
        scene: { collection: Array<{ name: string; price: string | null }> | null };
      },
    ];
    expect(template.id).toBe("lookbook-carousel");
    // Each product from its cheapest variant (the silk abaya's is on sale at 39).
    expect(scene.collection?.map(({ name, price }) => ({ name, price }))).toEqual([
      { name: "Silk Abaya", price: "39.000 BHD" },
      { name: "Linen Kaftan", price: "30.000 BHD" },
    ]);

    openSelect(screen.getByRole("button", { name: "Download options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Instagram carousel/ }));
    await waitFor(() => expect(exporting.deliverCreativeFiles).toHaveBeenCalledTimes(1));
    const [{ scene: slideScene }] = exporting.exportTemplateCarousel.mock.lastCall as unknown as [
      { scene: { width: number; height: number; format: string } },
    ];
    expect(slideScene).toMatchObject({ width: 1080, height: 1350, format: "portrait" });
    const [files, zipName] = exporting.deliverCreativeFiles.mock.lastCall as unknown as [
      Array<{ name: string }>,
      string,
    ];
    expect(files.map((file) => file.name)).toEqual([
      "pura-lookbook-carousel-01.png",
      "pura-lookbook-carousel-02.png",
    ]);
    expect(zipName).toBe("pura-lookbook-carousel.zip");
  });

  it("zooms into the detail the merchant taps, named from the product's fabric", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Detail Zoom/ }));
    expect(await screen.findByLabelText("Detail label")).toHaveValue("Silk");
    expect(screen.getByLabelText("Note")).toHaveValue("Evening");

    // Tap the photo a quarter across and a third down.
    const point = screen.getByRole("button", { name: /Detail point/ });
    const photo = point.querySelector("img")!;
    photo.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 200, height: 300 }) as DOMRect;
    fireEvent.click(point, { clientX: 150, clientY: 150, detail: 1 });
    expect(point).toHaveAccessibleName(/25% across, 33% down/);
    fireEvent.keyDown(point, { key: "ArrowRight" });
    expect(point).toHaveAccessibleName(/27% across/);
    fireEvent.change(screen.getByLabelText("Detail label"), {
      target: { value: "Hand-beaded cuff" },
    });

    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.exportTemplateMp4).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      {
        template: { id: string };
        scene: { detail: { x: number; y: number; label: string; note: string } | null };
      },
    ];
    expect(template.id).toBe("detail-zoom");
    expect(scene.detail).toMatchObject({ label: "Hand-beaded cuff", note: "Evening" });
    expect(scene.detail?.x).toBeCloseTo(0.27);
    expect(scene.detail?.y).toBeCloseTo(1 / 3);
  });

  it("greets an occasion with its own words, offer and caption, without the product's copy", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Occasion Pack/ }));
    const occasions = await screen.findByRole("radiogroup", { name: "Occasion" });
    // The next occasion is chosen to start with (which one depends on today).
    expect(within(occasions).getAllByRole("radio", { checked: true })).toHaveLength(1);
    // A greeting has no product: its own panel replaces the product picker and copy.
    expect(screen.queryByRole("combobox", { name: "Product" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Headline")).not.toBeInTheDocument();

    fireEvent.click(within(occasions).getByRole("radio", { name: "Eid al-Fitr" }));
    expect(screen.getByLabelText("Greeting")).toHaveValue("Eid Mubarak");
    fireEvent.change(screen.getByLabelText("Offer (optional)"), {
      target: { value: "20% off with EID20" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy Instagram Caption" }));
    await waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("Eid Mubarak\nMay your Eid be filled with joy\n20% off with EID20"),
      ),
    );

    const download = await screen.findByRole("button", { name: "Download Video (MP4)" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await waitFor(() => expect(exporting.deliverCreativeFile).toHaveBeenCalledTimes(1));
    const [{ template, scene }] = exporting.exportTemplateMp4.mock.lastCall as unknown as [
      { template: { id: string }; scene: { occasion: Record<string, string> | null } },
    ];
    expect(template.id).toBe("occasion-pack");
    expect(scene.occasion).toMatchObject({
      id: "eid-al-fitr",
      greeting: "Eid Mubarak",
      offer: "20% off with EID20",
    });
    expect(exporting.deliverCreativeFile).toHaveBeenCalledWith(
      expect.any(Blob),
      "pura-eid-al-fitr-story.mp4",
      "video/mp4",
      "Eid Mubarak",
    );
  });

  it("runs a template across several products and hands them over together", async () => {
    // jsdom never loads images: fail each one at once, so products draw without a photo.
    class FailingImage {
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);
    try {
      await renderStudio();
      fireEvent.click(screen.getByRole("radio", { name: /Atelier Reveal/ }));
      openSelect(await screen.findByRole("button", { name: "Download options" }));
      fireEvent.click(await screen.findByRole("menuitem", { name: /Several products at once/ }));
      const picks = await screen.findByRole("group", { name: "Products" });
      // It opens on the product on screen; add the kaftan.
      expect(within(picks).getByRole("button", { name: /Silk Abaya/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      fireEvent.click(within(picks).getByRole("button", { name: /Linen Kaftan/ }));
      fireEvent.click(screen.getByRole("button", { name: /Export 2 creatives/ }));

      await waitFor(() => expect(exporting.deliverCreativeFiles).toHaveBeenCalledTimes(1));
      const scenes = exporting.exportTemplatePng.mock.calls.map(
        (call) => (call as unknown as [{ scene: Record<string, unknown> }])[0].scene,
      );
      expect(scenes.map(({ productName, price }) => ({ productName, price }))).toEqual([
        { productName: "Silk Abaya", price: "42.000 BHD" },
        { productName: "Linen Kaftan", price: "30.000 BHD" },
      ]);
      const [files, zipName] = exporting.deliverCreativeFiles.mock.lastCall as unknown as [
        Array<{ name: string }>,
        string,
      ];
      expect(files.map((file) => file.name)).toEqual([
        "pura-silk-abaya-story.png",
        "pura-linen-kaftan-story.png",
      ]);
      expect(zipName).toBe("pura-atelier-reveal-story.zip");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("saves the design as a draft and puts it back exactly, even from another product", async () => {
    draftStore.rows = [];
    await renderStudio();
    fireEvent.click(screen.getByRole("radio", { name: /Price Drop/ }));
    openSelect(screen.getByRole("combobox", { name: "Product Variant" }));
    fireEvent.click(await screen.findByRole("option", { name: /M · Black/ }));
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "The Eid edit" } });
    fireEvent.change(screen.getByLabelText("Logo size"), { target: { value: "1.6" } });

    fireEvent.click(screen.getByRole("button", { name: /^Drafts/ }));
    expect(await screen.findByLabelText("Draft name")).toHaveValue("Price Drop · Silk Abaya");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(draftStore.rows).toHaveLength(1));
    expect(draftStore.rows[0]).toMatchObject({
      name: "Price Drop · Silk Abaya",
      template_id: "price-drop",
      format: "story",
      product_id: "p1",
      settings: expect.objectContaining({
        headline: "The Eid edit",
        logoScale: 1.6,
        variantId: "v1",
      }),
    });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    // Move away: another template, another product (which refills the headline).
    fireEvent.click(screen.getByRole("radio", { name: /Classic/ }));
    openSelect(screen.getByRole("combobox", { name: "Product" }));
    fireEvent.click(await screen.findByRole("option", { name: "Linen Kaftan" }));
    await waitFor(() => expect(screen.getByLabelText("Headline")).toHaveValue("Linen Kaftan"));

    fireEvent.click(screen.getByRole("button", { name: /Price Drop · Silk Abaya/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Price Drop/ })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    // The draft's own headline survives the switch back to its product.
    await waitFor(() => expect(screen.getByLabelText("Headline")).toHaveValue("The Eid edit"));
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveTextContent("Silk Abaya");
    expect(screen.getByText("160%")).toBeInTheDocument();
    expect(screen.queryByText(/no sale price right now/)).not.toBeInTheDocument();
  });
});
