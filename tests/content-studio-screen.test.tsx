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
}));
vi.mock("html2canvas-pro", () => ({ default: exporting.html2canvas }));
const creativeExport = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  deliverCreativeFile: exporting.deliverCreativeFile,
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
    stock_main: 2,
    stock_incubator: 0,
    image_url: null,
  },
  {
    id: "v2",
    product_id: "p1",
    size: "L",
    color: "Black",
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
});
