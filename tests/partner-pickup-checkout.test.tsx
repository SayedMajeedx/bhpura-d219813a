import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// A shopper can collect an order at a partner's shop that holds its pieces (found 2026-10-14: all
// of Pura's 15 pieces were at its partner, and the checkout offered only the store's branch).
// Partners do not use the system: the store tells them by hand, in a WhatsApp message a person
// sends. The database side is tests/partner-pickup-migration.test.ts.

const client = { supabase: { from: vi.fn(), rpc: vi.fn() } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const holds = vi.hoisted(() => ({ rows: [] as unknown[] }));
const incubatorsData = async (io: () => Promise<Record<string, unknown>>) => ({
  ...(await io()),
  incubatorsQueries: {
    orderPickups: (brandId: string, orderId: string) => ({
      queryKey: ["incubators", brandId, "order-holds", orderId],
      queryFn: async () => holds.rows,
      enabled: Boolean(brandId && orderId),
    }),
  },
});
vi.mock("../src/lib/data/incubators", (io) => incubatorsData(io));
vi.mock("@/lib/data/incubators", (io) => incubatorsData(io));
const brandContext = {
  useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura", name_ar: "بيورا" }),
};
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);

const { pickupCartItems, branchPickupNote, partnerPickupText, pickupBranchesOffered } =
  await import("../src/features/checkout/lib/pickup-places");
const { placeStorefrontOrderArgs, placeOrderFailure } =
  await import("../src/features/checkout/lib/place-order");
const { checkoutFormError } = await import("../src/features/checkout/lib/checkout-validation");
const { PickupBranchCard } = await import("../src/features/checkout/components/PickupBranchCard");
const { incubatorDetails, incubatorDetailsProblem } =
  await import("../src/features/incubators/lib/forms");
const { pickupLines, partnerPickupMessage } =
  await import("../src/features/incubators/lib/partner-stock");
const { PartnerPickupNotice } =
  await import("../src/features/orders/components/PartnerPickupNotice");

const t = (_ar: string, en: string) => en;
const dar = {
  id: "p1",
  name: "Dar Lulwa",
  address_ar: "المحرق، مجمع 208",
  address_en: "Muharraq, block 208",
  location_url: "https://maps.app.goo.gl/x",
  notes_ar: "من 4 إلى 9 مساءً",
  notes_en: "4 to 9 pm",
};

describe("where a cart can be collected", () => {
  it("is asked of the database with each piece, its quantity and whether it is made to order", () => {
    const cart = [
      { product_id: "dress", variant_id: "v1", qty: 2 },
      { product_id: "abaya", variant_id: "v2", qty: 1 },
      { product_id: "abaya", variant_id: "v3", qty: 1, tailored: false },
      { product_id: "custom", variant_id: " ", qty: 1 },
    ] as never;
    expect(pickupCartItems(cart, new Set(["abaya"]))).toEqual([
      { variant_id: "v1", quantity: 2, made_to_order: false },
      { variant_id: "v2", quantity: 1, made_to_order: true },
      { variant_id: "v3", quantity: 1, made_to_order: false },
      { variant_id: null, quantity: 1, made_to_order: true },
    ]);
  });

  it("says under the branch when pieces are brought from a partner, with a time only when written", () => {
    const none = { partners: [], from_partner: false, transfer_days: null };
    expect(branchPickupNote(none, "en")).toBeNull();
    expect(branchPickupNote({ ...none, from_partner: true }, "ar")).toBe(
      "بعض قطع طلبك عند محل شريك، ونجلبها للفرع قبل استلامك.",
    );
    expect(branchPickupNote({ ...none, from_partner: true, transfer_days: 2 }, "ar")).toContain(
      "خلال يومين",
    );
    expect(branchPickupNote({ ...none, from_partner: true, transfer_days: 1 }, "en")).toContain(
      "within 1 day",
    );
  });

  it("offers no branch when the pieces are at a partner that holds them all (found on Pura's checkout)", () => {
    const branches = [{ id: "b1" }];
    // The store's stock does not cover the cart and Dar Lulwa holds it all: Dar Lulwa only.
    expect(
      pickupBranchesOffered(branches, { partners: [dar], from_partner: true, transfer_days: null }),
    ).toEqual([]);
    // No single partner holds it all: the branch, the pieces brought there first.
    expect(
      pickupBranchesOffered(branches, { partners: [], from_partner: true, transfer_days: 2 }),
    ).toEqual(branches);
    // The store covers the cart: its branch, and the partner as another choice.
    expect(
      pickupBranchesOffered(branches, {
        partners: [dar],
        from_partner: false,
        transfer_days: null,
      }),
    ).toEqual(branches);
  });

  it("reads a partner's address and notes in the shopper's language", () => {
    expect(partnerPickupText(dar, "ar")).toEqual({
      address: "المحرق، مجمع 208",
      notes: "من 4 إلى 9 مساءً",
    });
    expect(partnerPickupText({ ...dar, address_en: null }, "en").address).toBe("المحرق، مجمع 208");
  });
});

describe("the checkout's pickup card", () => {
  const card = (over: Record<string, unknown> = {}) =>
    render(
      <PickupBranchCard
        branchId="b1"
        branchLabel={(b) => b.name_en ?? ""}
        branchLoc={() => "Seef"}
        branches={[{ id: "b1", name_en: "Pura Seef" } as never]}
        lang="en"
        setBranchId={vi.fn()}
        t={t}
        pickupPartners={{ partners: [dar], from_partner: true, transfer_days: 2 }}
        {...over}
      />,
    );

  it("offers the partner's shop with its address and map, and says the branch waits for the pieces", () => {
    const setPartnerId = vi.fn();
    card({ setPartnerId });
    expect(screen.getByText("Where to collect")).toBeInTheDocument();
    expect(screen.getByText(/we bring them to the branch within 2 days/)).toBeInTheDocument();
    expect(screen.getByText("Muharraq, block 208")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in maps/ })).toHaveAttribute(
      "href",
      "https://maps.app.goo.gl/x",
    );
    fireEvent.click(screen.getByRole("button", { name: /Dar Lulwa/ }));
    expect(setPartnerId).toHaveBeenCalledWith("p1");
  });

  it("shows only the partner's shop when no branch is offered", () => {
    card({ branches: [], partnerId: "p1" });
    expect(screen.getByText("Where to collect")).toBeInTheDocument();
    expect(screen.queryByText("Pura Seef")).toBeNull();
    expect(screen.queryByText("Or collect at a partner's shop")).toBeNull();
    expect(screen.queryByText(/we bring them to the branch/)).toBeNull();
    expect(screen.getByRole("button", { name: /Dar Lulwa/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the branch only when no partner holds the whole cart", () => {
    card({ pickupPartners: { partners: [], from_partner: false, transfer_days: null } });
    expect(screen.getByText("Choose branch")).toBeInTheDocument();
    expect(screen.queryByText(/partner/i)).toBeNull();
  });
});

describe("placing an order collected at a partner", () => {
  const base = {
    brand: { slug: "pura" },
    form: {
      name: "Sara",
      phone: "33112233",
      email: "",
      label: "",
      region: "",
      block: "",
      road: "",
      house: "",
      flat: "",
      notes: "",
    },
    customerEmail: "",
    selectedDestination: "BH",
    selectedCountryCode: "BH",
    selectedZone: undefined,
    session: null,
    saveToProfile: false,
    cart: [],
    method: "cod",
    isGift: false,
    giftRecipient: "",
    giftMessage: "",
    fulfillment: "pickup",
    branchId: "",
    digitalChannel: "email",
    digitalContact: "",
    appliedPromo: null,
    benefitReceiptId: null,
    shipping: 0,
    lang: "en",
    idempotencyKey: "key",
  } as never;

  it("names the partner for the database and no branch", () => {
    const args = placeStorefrontOrderArgs({ ...(base as object), partnerId: "p1" } as never);
    expect(args.p_customer).toMatchObject({ pickup_partner_id: "p1" });
    expect(args.p_branch_id).toBeNull();
    const atBranch = placeStorefrontOrderArgs({ ...(base as object), branchId: "b1" } as never);
    expect(atBranch.p_customer).not.toHaveProperty("pickup_partner_id");
    expect(atBranch.p_branch_id).toBe("b1");
  });

  it("is a complete pickup choice, and a refusal is said in words", () => {
    const form = {
      form: { name: "Sara", phone: "33112233", email: "" },
      fulfillment: "pickup",
      acceptedTerms: true,
      selectedDestination: "BH",
      method: "cod",
      benefitReceipt: null,
      branches: [{ id: "b1" }],
      branchId: "",
      digitalChannel: "email",
      digitalContact: "",
      t,
    } as never;
    expect(checkoutFormError(form)).toBe("Select a branch");
    expect(checkoutFormError({ ...(form as object), partnerId: "p1" } as never)).toBeNull();
    expect(placeOrderFailure("ERROR: PICKUP_PARTNER_UNAVAILABLE", t).message).toMatch(
      /no longer holds every piece/,
    );
  });
});

describe("a partner's pickup details", () => {
  const details = (patch: Record<string, string>) =>
    incubatorDetails({ name: "Dar Lulwa", commission_value: "10", ...patch });

  it("are saved from the partner's form", () => {
    expect(
      details({
        pickup_enabled: "true",
        pickup_address_ar: " المحرق ",
        pickup_location_url: "https://maps.app.goo.gl/x",
        transfer_days: "2",
      }),
    ).toMatchObject({
      pickup_enabled: true,
      pickup_address_ar: "المحرق",
      pickup_location_url: "https://maps.app.goo.gl/x",
      transfer_days: 2,
    });
  });

  it("need an address when the partner takes pickups, a real map link and a sensible time", () => {
    expect(incubatorDetailsProblem(details({ pickup_enabled: "true" }), "en")).toMatch(/address/);
    expect(
      incubatorDetailsProblem(details({ pickup_location_url: "maps.google.com/x" }), "en"),
    ).toMatch(/https/);
    expect(incubatorDetailsProblem(details({ transfer_days: "90" }), "en")).toMatch(/0 to 60/);
    expect(
      incubatorDetailsProblem(
        details({ pickup_enabled: "true", pickup_address_en: "Muharraq" }),
        "en",
      ),
    ).toBeNull();
  });
});

describe("telling the partner", () => {
  const hold = (patch: Record<string, unknown> = {}) => ({
    order_id: "o1",
    variant_id: "v1",
    incubator_id: "p1",
    quantity: 1,
    incubators: { name: "Dar Lulwa", phone: "33445566" },
    product_variants: {
      size: "54",
      color: "Black",
      products: { name: "عباية سبيكة", name_ar: "عباية سبيكة" },
    },
    orders: {
      invoice_number: 1100,
      status: "confirmed",
      fulfillment_status: "NEEDS_PACKING",
      pickup_incubator_id: "p1",
      customer_name_snapshot: "سارة",
    },
    ...patch,
  });

  it("knows the customer collects at the partner, and writes the message a person sends", () => {
    const [line] = pickupLines([hold()] as never, "ar");
    expect(line).toMatchObject({ customerCollects: true, customer: "سارة" });
    const message = partnerPickupMessage([line], "بيورا", "ar");
    expect(message).toContain("طلب أونلاين #1100 سيستلمه الزبون من محلكم: سارة");
    expect(message).toContain("1 × عباية سبيكة");
    const [fetched] = pickupLines(
      [hold({ orders: { invoice_number: 1101, pickup_incubator_id: null } })] as never,
      "en",
    );
    expect(fetched.customerCollects).toBe(false);
  });

  it("gives staff the WhatsApp message on the order", async () => {
    holds.rows = [hold()];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PartnerPickupNotice orderId="o1" lang="en" />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("The customer collects this order at the partner's shop"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Tell Dar Lulwa on WhatsApp/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/97333445566\?text=/);
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain("Online order #1100");
  });
});
