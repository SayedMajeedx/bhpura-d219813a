import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Gift card designs on the screens (the owner's brief of 2026-10-31): the buyer picks an occasion
// and one of the designs the store offers, and that choice goes with the purchase; the store turns
// designs off, names its signature card and chooses its photos; staff print a card in the store.

const data = vi.hoisted(() => ({
  stored: {
    off: [] as string[],
    signature: null as string | null,
    photo_products: [] as string[],
    photos: [] as string[],
    logo_scale: 1,
    fonts: { ar: null, en: null } as Record<string, unknown>,
    message_fonts: { ar: null, en: null } as Record<string, unknown>,
  },
  library: [] as Array<{ url: string; name: string | null }>,
  save: vi.fn(async () => null),
  upload: vi.fn(
    async () =>
      "https://media.boutq.store/brands/b1/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2",
  ),
}));
const r2 = { uploadPublicMedia: data.upload };
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("@/lib/r2-upload", () => r2);
const designs = {
  cardDesignQueries: {
    store: () => ({ queryKey: ["designs"], queryFn: async () => data.stored }),
    photoChoices: () => ({
      queryKey: ["design-photos"],
      queryFn: async () => [
        { id: "p1", name_en: "Black abaya", name_ar: null, photo: "https://media.test/p1.jpg" },
        { id: "p2", name_en: "Linen abaya", name_ar: null, photo: "https://media.test/p2.jpg" },
      ],
    }),
    fontLibrary: () => ({ queryKey: ["font-library"], queryFn: async () => data.library }),
  },
  saveCardDesigns: data.save,
  invalidateCardDesigns: vi.fn(async () => undefined),
};
vi.mock("../src/lib/data/gift-cards/designs", () => designs);
vi.mock("@/lib/data/gift-cards/designs", () => designs);
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const brand = {
  id: "b1",
  slug: "pura",
  name_en: "Pura Line",
  name_ar: "بيورا لاين",
  logo_url: null,
};
vi.mock("../src/lib/brand-context", () => ({ useBrand: () => brand }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => brand }));
const settings = {
  businessSettingsQueries: {
    detail: () => ({
      queryKey: ["settings"],
      queryFn: async () => ({
        storefront_accent_color: "#3f121a",
        store_vertical: "abayas",
        currency: "BHD",
      }),
    }),
  },
};
vi.mock("../src/lib/data/business-settings", () => settings);
vi.mock("@/lib/data/business-settings", () => settings);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { GiftCardDesigner } =
  await import("../src/features/gift-card-design/components/GiftCardDesigner");
const { CardDesignsSection } =
  await import("../src/features/gift-cards/components/CardDesignsSection");
const { PrintButton, PrintCardButton } =
  await import("../src/features/gift-cards/components/PrintCardDialog");
const { useAdminCardKit } = await import("../src/features/gift-cards/hooks/use-admin-card-kit");
const { DEFAULT_DESIGN } = await import("../src/features/gift-card-design/lib/design");
type CardDesign = typeof DEFAULT_DESIGN;

const wrap = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  data.stored = {
    off: [],
    signature: null,
    photo_products: [],
    photos: [],
    logo_scale: 1,
    fonts: { ar: null, en: null },
    message_fonts: { ar: null, en: null },
  };
  data.library = [];
});

function Picker({ onChange }: { onChange: (d: CardDesign) => void }) {
  const kit = useAdminCardKit();
  const [value, setValue] = React.useState<CardDesign>({ ...DEFAULT_DESIGN, language: "en" });
  return (
    <GiftCardDesigner
      kit={kit}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      details={{ amount: 50, code: null, to: "Noor", message: null, expiresOn: null }}
      primary="en"
      lang="en"
      today={new Date("2026-08-10T09:00:00Z")}
    />
  );
}

describe("the buyer's picker", () => {
  it("offers the occasions, the store's designs first, and which way and in which language", async () => {
    data.stored = {
      off: ["pattern:black"],
      signature: "block:white",
      photo_products: [],
      photos: [],
      logo_scale: 1,
      fonts: { ar: null, en: null },
      message_fonts: { ar: null, en: null },
    };
    const onChange = vi.fn();
    wrap(<Picker onChange={onChange} />);
    const designs = await screen.findByRole("radiogroup", { name: "Design" });
    // The signature card leads; a design the store turned off is not offered.
    await waitFor(() =>
      expect(within(designs).getAllByRole("radio")[0]).toHaveAccessibleName(
        "Colour block · Light store colour",
      ),
    );
    expect(within(designs).queryByRole("radio", { name: "Pattern · Black" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Eid al-Fitr" }));
    fireEvent.click(screen.getByRole("radio", { name: "Landscape" }));
    fireEvent.click(screen.getByRole("radio", { name: "English + عربي" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        occasion: "eid_al_fitr",
        orientation: "landscape",
        language: "both",
      }),
    );
    fireEvent.click(within(designs).getByRole("radio", { name: "Type · Nude" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ design: "type:cream" }));
    expect(screen.getByRole("img", { name: "Front of the card" })).toBeInTheDocument();
  });
});

describe("the store's designs", () => {
  it("are turned off, signed and given photos by staff who may change settings", async () => {
    wrap(<CardDesignsSection lang="en" />);
    fireEvent.click(await screen.findByRole("switch", { name: "Offer Pattern · Black" }));
    fireEvent.click(screen.getByRole("button", { name: "Type · Nude as the signature card" }));
    fireEvent.click(await screen.findByRole("button", { name: "Linen abaya" }));
    fireEvent.click(screen.getByRole("button", { name: "Black abaya" }));
    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    await waitFor(() =>
      expect(data.save).toHaveBeenCalledWith("b1", {
        off: ["pattern:black"],
        signature: "type:cream",
        photoProducts: ["p2", "p1"],
        logoScale: 1,
        fonts: { ar: null, en: null },
        messageFonts: { ar: null, en: null },
        library: [],
      }),
    );
  });

  it("set the logo's size and a font for each language, shown on the cards before saving", async () => {
    const { container } = wrap(<CardDesignsSection lang="en" />);
    const slider = await screen.findByRole("slider", { name: "Logo size on the cards" });
    expect(slider).toHaveAttribute("aria-valuetext", "100%");
    fireEvent.change(slider, { target: { value: "1.1" } });
    expect(screen.getByRole("slider", { name: "Logo size on the cards" })).toHaveAttribute(
      "aria-valuetext",
      "110%",
    );
    expect(screen.getByRole("img", { name: "Back preview" })).toBeInTheDocument();
    expect(container.textContent).toContain("The cards' own");
    const gift = screen.getByRole("group", { name: "Gift card fonts" });
    fireEvent.click(within(gift).getByRole("button", { name: "Change Arabic font" }));
    const file = new File(["font"], "Zain-Display.woff2", { type: "font/woff2" });
    fireEvent.change(await screen.findByLabelText("Upload a font"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(within(gift).getByText("Zain Display")).toBeInTheDocument());
    expect(data.upload).toHaveBeenCalledWith("b1", file, "font");
    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    const zain = {
      url: "https://media.boutq.store/brands/b1/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2",
      name: "Zain Display",
    };
    await waitFor(() =>
      expect(data.save).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          logoScale: 1.1,
          fonts: { ar: zain, en: null },
          // Uploaded once, kept in the store's list to choose again.
          library: [zain],
        }),
      ),
    );
  });

  it("choose a font from the list, each shown in itself, with no upload", async () => {
    const hand = {
      url: "https://media.boutq.store/brands/b1/font/1a2b3c4d-7a3d-4e55-9a0b-2c4d6e8f1a3b.otf",
      name: "Hand",
    };
    data.library = [hand];
    wrap(<CardDesignsSection lang="en" />);
    const gift = await screen.findByRole("group", { name: "Gift card fonts" });
    fireEvent.click(within(gift).getByRole("button", { name: "Change English font" }));
    const list = await screen.findByRole("radiogroup", { name: "English font" });
    // The cards' own, the platform's faces (Inter has Latin letters only), then the store's own.
    expect(within(list).getByRole("radio", { name: /The cards' own/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(list).getByRole("radio", { name: /Inter/ })).toBeInTheDocument();
    expect(within(list).getByRole("radio", { name: /Hand/ })).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("radio", { name: /29LT Zarid Display/ }));
    await waitFor(() =>
      expect(screen.queryByRole("radiogroup", { name: "English font" })).toBeNull(),
    );
    expect(within(gift).getByText("29LT Zarid Display")).toBeInTheDocument();

    // The Arabic list has no Inter.
    fireEvent.click(within(gift).getByRole("button", { name: "Change Arabic font" }));
    const arabic = await screen.findByRole("radiogroup", { name: "Arabic font" });
    expect(within(arabic).queryByRole("radio", { name: /Inter/ })).toBeNull();
    fireEvent.click(within(arabic).getByRole("radio", { name: /Hand/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    await waitFor(() =>
      expect(data.save).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          fonts: { ar: hand, en: { face: "zarid" } },
          messageFonts: { ar: null, en: null },
          library: [hand],
        }),
      ),
    );
  });

  it("give the gift message card its own font, the gift cards' until chosen", async () => {
    data.stored.fonts = { ar: { face: "bukra" }, en: null };
    wrap(<CardDesignsSection lang="en" />);
    const message = await screen.findByRole("group", { name: "Gift message card fonts" });
    expect(within(message).getAllByText("Same as the gift cards")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Gift message card preview" })).toBeInTheDocument();
    fireEvent.click(within(message).getByRole("button", { name: "Change Arabic font" }));
    const list = await screen.findByRole("radiogroup", { name: "Arabic font" });
    fireEvent.click(within(list).getByRole("radio", { name: /The cards' own/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    await waitFor(() =>
      expect(data.save).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          fonts: { ar: { face: "bukra" }, en: null },
          messageFonts: { ar: { face: "own" }, en: null },
        }),
      ),
    );
  });

  it("keep an upload chosen somewhere, and let one chosen nowhere be removed", async () => {
    const used = {
      url: "https://media.boutq.store/brands/b1/font/1a2b3c4d-7a3d-4e55-9a0b-2c4d6e8f1a3b.otf",
      name: "Used",
    };
    const spare = {
      url: "https://media.boutq.store/brands/b1/font/2a2b3c4d-7a3d-4e55-9a0b-2c4d6e8f1a3b.otf",
      name: "Spare",
    };
    data.stored.message_fonts = { ar: used, en: null };
    data.library = [used, spare];
    wrap(<CardDesignsSection lang="en" />);
    const gift = await screen.findByRole("group", { name: "Gift card fonts" });
    fireEvent.click(within(gift).getByRole("button", { name: "Change English font" }));
    await screen.findByRole("radiogroup", { name: "English font" });
    expect(screen.queryByRole("button", { name: "Remove Used" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Spare" }));
    expect(screen.queryByRole("radio", { name: /Spare/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /The cards' own/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    await waitFor(() =>
      expect(data.save).toHaveBeenCalledWith("b1", expect.objectContaining({ library: [used] })),
    );
  });
});

describe("printing a card in the store", () => {
  it("sets one gift message card in a font of its own, the settings kept, its lines as typed", async () => {
    data.stored.message_fonts = { ar: { face: "kaff" }, en: null };
    const sheet = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
    const open = vi.spyOn(window, "open").mockReturnValue(sheet as unknown as Window);
    wrap(
      <PrintButton
        lang="en"
        label="Print the gift card"
        source={() => ({
          id: "gift-message-7",
          code: "7",
          details: {
            amount: null,
            code: null,
            to: "نورة",
            message: "هدية بسيطة جداً\n(عيد ميلاد سعيد)",
            expiresOn: null,
            purpose: "message",
          },
          initial: { ...DEFAULT_DESIGN, language: "ar" },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print the gift card" }));
    // The message is Arabic: its font starts as the settings' (Kaff), for this card only.
    const change = await screen.findByRole("button", { name: "Change This card's font" });
    expect(screen.getByText("As in the settings")).toBeInTheDocument();
    fireEvent.click(change);
    const list = await screen.findByRole("radiogroup", { name: "This card's font" });
    fireEvent.click(within(list).getByRole("radio", { name: /Tajawal/ }));
    await waitFor(() => expect(screen.getByText("Tajawal")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Print to fold and glue" }));
    await waitFor(() => expect(sheet.document.write).toHaveBeenCalled());
    const html = String(sheet.document.write.mock.calls[0][0]);
    // The page declares Tajawal from the store's own host and sets the message in it.
    expect(html).toContain('@font-face{font-family:"Tajawal"');
    expect(html).toContain("tajawal-400-arabic.woff2");
    expect(html).toMatch(/font-family="[^"]*Tajawal/);
    // Each line the writer started is a line of its own on the card, in their order (a long one
    // may still wrap).
    const lines = [...html.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]);
    const first = lines.indexOf("هدية بسيطة جداً");
    expect(first).toBeGreaterThan(-1);
    expect(lines[first + 1]).toMatch(/^\(عيد/);
    expect(data.save).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("offers a gift message card its colours, each once, and no occasion", async () => {
    // The owner's report of 2026-11-22: the picker showed one card four times, as a message
    // card's frame and mark are the same in every composition; only its paper and ink change.
    const sheet = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
    const open = vi.spyOn(window, "open").mockReturnValue(sheet as unknown as Window);
    wrap(
      <PrintButton
        lang="en"
        label="Print the gift card"
        source={() => ({
          id: "gift-message-8",
          code: "8",
          details: {
            amount: null,
            code: null,
            to: "Noura",
            message: "Happy birthday",
            expiresOn: null,
            purpose: "message",
          },
          initial: { ...DEFAULT_DESIGN, design: "pattern:cream", language: "en" },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print the gift card" }));
    const colours = await screen.findByRole("radiogroup", { name: "Card colours" });
    const names = within(colours)
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("aria-label"));
    expect(names).toEqual(["Store colour", "Black", "Nude", "Light store colour"]);
    // What the card opened on stays chosen.
    expect(within(colours).getByRole("radio", { name: "Nude" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("radiogroup", { name: "Occasion" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Design" })).toBeNull();
    fireEvent.click(within(colours).getByRole("radio", { name: "Black" }));
    expect(within(colours).getByRole("radio", { name: "Black" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Print to fold and glue" }));
    await waitFor(() => expect(sheet.document.write).toHaveBeenCalled());
    // Printed in black ink on white paper.
    const html = String(sheet.document.write.mock.calls[0][0]);
    expect(html).toContain('fill="#1C1B1A"');
    open.mockRestore();
  });

  it("opens the card in the store's designs and prints it on A4 with cut marks", async () => {
    const sheet = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
    const open = vi.spyOn(window, "open").mockReturnValue(sheet as unknown as Window);
    wrap(
      <PrintCardButton
        lang="en"
        card={
          {
            id: "c1",
            code: "ABCD-EFGH-JKMN",
            balance: 50,
            currency: "BHD",
            recipient_name: "Noor",
            purchaser_name: "Sara",
            note: "Eid Mubarak",
            expires_on: null,
          } as never
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Print or save the card" }));
    // The card is drawn again once the store's settings arrive: look for it as it settles.
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Front of the card" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("From (on the back)")).toHaveValue("Sara");
    fireEvent.click(screen.getByRole("button", { name: "Print on A4 to cut out" }));
    await waitFor(() => expect(sheet.document.write).toHaveBeenCalled());
    const html = String(sheet.document.write.mock.calls[0][0]);
    expect(html).toContain("@page{size:210mm 297mm;margin:0}");
    expect(html).toContain("ABCD-EFGH-JKMN");
    expect(html).toContain("Sara");
    fireEvent.click(screen.getByRole("button", { name: "Print to fold and glue" }));
    await waitFor(() => expect(sheet.document.write).toHaveBeenCalledTimes(2));
    const folded = String(sheet.document.write.mock.calls[1][0]);
    expect(folded).toContain("Fold on the dashed line");
    expect(folded).toContain("ABCD-EFGH-JKMN");
    open.mockRestore();
  });
});
