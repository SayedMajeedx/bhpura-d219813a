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
    fonts: {} as Record<string, { url: string; name: string | null } | null>,
  },
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
const { PrintCardButton } = await import("../src/features/gift-cards/components/PrintCardDialog");
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
    fonts: {},
  };
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
    };
    const onChange = vi.fn();
    wrap(<Picker onChange={onChange} />);
    const designs = await screen.findByRole("radiogroup", { name: "Design" });
    // The signature card leads; a design the store turned off is not offered.
    await waitFor(() =>
      expect(within(designs).getAllByRole("radio")[0]).toHaveAccessibleName("Colour block · White"),
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
    const file = new File(["font"], "Zain-Display.woff2", { type: "font/woff2" });
    fireEvent.change(screen.getByLabelText("Upload the arabic font"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("Zain Display")).toBeInTheDocument();
    expect(data.upload).toHaveBeenCalledWith("b1", file, "font");
    expect(container.textContent).toContain("The cards' own");
    fireEvent.click(screen.getByRole("button", { name: "Save designs" }));
    await waitFor(() =>
      expect(data.save).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          logoScale: 1.1,
          fonts: {
            ar: {
              url: "https://media.boutq.store/brands/b1/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2",
              name: "Zain Display",
            },
            en: null,
          },
        }),
      ),
    );
  });
});

describe("printing a card in the store", () => {
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
    open.mockRestore();
  });
});
