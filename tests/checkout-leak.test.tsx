import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pura's last 30 days to 2026-11-13: 34 visits began checkout and about 7 ordered, only 1 of 48 left
// carts had a phone, and on a phone the first product sat under two stacked banners. Checkout now
// asks for the phone first and says how far each visit got and what stood in its way; the
// dashboard shows it, and each post's own link shows the visits and orders it brought.

const data = vi.hoisted(() => ({
  recordFunnelStep: vi.fn(async () => undefined),
  recordCheckoutStep: vi.fn(async () => undefined),
  checkout: null as null | {
    progress: Record<string, number>;
    problems: { problem: string; visits: number }[];
  },
  campaigns: [] as { campaign: string; visits: number; orders: number }[],
}));
const funnelModule = vi.hoisted(() => () => ({
  recordFunnelStep: data.recordFunnelStep,
  recordCheckoutStep: data.recordCheckoutStep,
  storefrontFunnelQueries: {
    checkout: (brandId: string) => ({
      queryKey: ["checkout", brandId],
      queryFn: async () => data.checkout,
    }),
    campaigns: (brandId: string) => ({
      queryKey: ["campaigns", brandId],
      queryFn: async () => data.campaigns,
    }),
  },
}));
const storefrontModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useIsServicesStore: () => false,
}));
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("../src/lib/data/storefront-funnel", funnelModule);
vi.mock("@/lib/data/storefront-funnel", funnelModule);

const { checkoutProgress, phoneLooksComplete } =
  await import("../src/features/checkout/lib/checkout-progress");
const { checkoutFormError } = await import("../src/features/checkout/lib/checkout-validation");
const { problemFromFailure, problemLabel } = await import("../src/lib/checkout-progress");
const { campaignLink, campaignWord } = await import("../src/lib/funnel");
const { recordCheckoutProgress, setFunnelRecording, trackStorefrontEvent } =
  await import("../src/lib/storefront-analytics");
const { CheckoutStops, CampaignCounts } =
  await import("../src/features/dashboard/components/FunnelDetails");

const t = (_ar: string, en: string) => en;
const form = {
  name: "",
  phone: "",
  email: "",
  notes: "",
  label: "",
  region: "",
  block: "",
  road: "",
  house: "",
  flat: "",
};
const base = {
  form,
  fulfillment: "delivery" as const,
  acceptedTerms: false,
  selectedDestination: "BH",
  method: "benefit" as const,
  benefitReceipt: null,
  branches: [],
  branchId: "",
  digitalChannel: "email" as const,
  digitalContact: "",
  receiptRequired: true,
  t,
};
const address = { region: "Sitra", block: "601", road: "12", house: "4" };

describe("how far into checkout a shopper is", () => {
  it("moves through contact, delivery and ready, naming what is still missing", () => {
    expect(checkoutProgress(base)).toEqual({ part: 0, problem: "name_phone" });
    const contact = { ...base, form: { ...form, name: "Maryam", phone: "3995 0016" } };
    expect(checkoutProgress(contact)).toEqual({ part: 1, problem: "terms" });
    const delivery = { ...contact, form: { ...contact.form, ...address } };
    expect(checkoutProgress(delivery)).toEqual({ part: 2, problem: "terms" });
    expect(checkoutProgress({ ...delivery, acceptedTerms: true })).toEqual({
      part: 2,
      problem: "receipt",
    });
    const ready = { ...delivery, acceptedTerms: true, method: "cod" as const };
    expect(checkoutProgress(ready)).toEqual({ part: 3, problem: null });
    expect(checkoutProgress(ready, true)).toEqual({ part: 2, problem: "delivery_time" });
  });

  it("counts a phone as typed from eight digits, Arabic digits too", () => {
    expect(phoneLooksComplete("3995")).toBe(false);
    expect(phoneLooksComplete("+973 3995 0016")).toBe(true);
    expect(phoneLooksComplete("٣٩٩٥٠٠١٦")).toBe(true);
  });

  it("keeps the checkout's own words for the shopper", () => {
    expect(checkoutFormError(base)).toBe("Name and phone are required");
  });

  it("reads the database's refusal as a code", () => {
    expect(problemFromFailure("PRODUCT_UNAVAILABLE:1f2e")).toBe("product_unavailable");
    expect(problemFromFailure("Failed to fetch")).toBe("order_failed");
    expect(problemLabel("receipt", true)).toBe("إيصال التحويل");
    expect(problemLabel("store_closed", false)).toBe("The store was closed");
    expect(problemLabel("brand_new_code", false)).toBe("brand new code");
  });
});

describe("sending it", () => {
  beforeEach(() => {
    sessionStorage.clear();
    data.recordCheckoutStep.mockClear();
    data.recordFunnelStep.mockClear();
  });

  it("holds what checkout sent before the funnel was set up, then sends it", () => {
    setFunnelRecording(null);
    recordCheckoutProgress(0, "name_phone");
    expect(data.recordCheckoutStep).not.toHaveBeenCalled();
    setFunnelRecording({ slug: "pura", allowed: true });
    expect(data.recordCheckoutStep).toHaveBeenCalledWith(
      "pura",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      0,
      "name_phone",
    );
  });

  it("sends nothing when the shopper did not allow analytics", () => {
    setFunnelRecording({ slug: "pura", allowed: false });
    recordCheckoutProgress(2, "terms");
    expect(data.recordCheckoutStep).not.toHaveBeenCalled();
  });

  it("sends the campaign word the link carried, under the same visit", () => {
    window.history.replaceState(null, "", "/pura?utm_source=ig&utm_campaign=Final%20Call");
    setFunnelRecording({ slug: "pura", allowed: true });
    void trackStorefrontEvent("page_view");
    recordCheckoutProgress(1, null);
    const [slug, visit, step, source, campaign] = data.recordFunnelStep.mock.calls[0] as unknown[];
    expect([slug, step, source, campaign]).toEqual(["pura", 1, "instagram", "final-call"]);
    expect((data.recordCheckoutStep.mock.calls[0] as unknown[])[1]).toBe(visit);
    window.history.replaceState(null, "", "/");
  });
});

describe("a post's link", () => {
  it("tags the page with where it goes and the post's word", () => {
    expect(campaignWord("  Final Call! ")).toBe("final-call");
    expect(campaignWord("!!!")).toBeNull();
    expect(
      campaignLink("https://pura.boutq.store/pura/product/abc", "instagram", "Final call"),
    ).toBe(
      "https://pura.boutq.store/pura/product/abc?utm_source=instagram&utm_campaign=final-call",
    );
    expect(campaignLink("https://pura.boutq.store/pura", "tiktok", "")).toBe(
      "https://pura.boutq.store/pura?utm_source=tiktok",
    );
  });
});

describe("the dashboard", () => {
  const show = (node: React.ReactNode) =>
    render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

  it("says where checkout stops and what was missing, in Arabic", async () => {
    data.checkout = {
      progress: { opened: 30, contact: 9, delivery: 6, ready: 3, pressed: 4, ordered: 3 },
      problems: [
        { problem: "name_phone", visits: 21 },
        { problem: "receipt", visits: 3 },
      ],
    };
    show(<CheckoutStops brandId="b1" from="a" to="b" isAr />);
    expect(await screen.findByText("وين يوقف الدفع")).toBeInTheDocument();
    expect(screen.getByText("كتبوا الاسم والهاتف")).toBeInTheDocument();
    const row = screen.getByText("الاسم أو رقم الهاتف").closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("21");
  });

  it("shows nothing before a visit opened checkout", async () => {
    data.checkout = {
      progress: { opened: 0, contact: 0, delivery: 0, ready: 0, pressed: 0, ordered: 0 },
      problems: [],
    };
    const { container } = show(<CheckoutStops brandId="b2" from="a" to="b" isAr={false} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each post's visits and orders", async () => {
    data.campaigns = [{ campaign: "final-call", visits: 120, orders: 4 }];
    show(<CampaignCounts brandId="b1" from="a" to="b" isAr={false} />);
    const row = (await screen.findByText("final-call")).closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("120");
    expect(row).toHaveTextContent("4");
  });
});

describe("the customer's details", () => {
  it("ask for the phone first", async () => {
    const { CustomerDetailsCard } =
      await import("../src/features/checkout/components/CustomerDetailsCard");
    render(
      <CustomerDetailsCard
        checkRegisteredAccount={() => undefined}
        form={form}
        fulfillment="delivery"
        saveToProfile={false}
        session={null}
        setForm={() => undefined}
        setSaveToProfile={() => undefined}
        setWhatsappOrderUpdates={() => undefined}
        t={t}
        whatsappOrderUpdates={false}
        whatsappUpdatesReady={false}
      />,
    );
    const fields = [...document.querySelectorAll("input")].map((field) => field.name);
    expect(fields.slice(0, 3)).toEqual(["phone", "name", "email"]);
  });
});
