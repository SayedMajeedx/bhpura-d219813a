import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPagesPayload, type EditablePage } from "../src/components/pages/pages-payload";

const state = vi.hoisted(() => ({
  lang: "en" as "ar" | "en",
  settings: {} as Record<string, unknown>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: object }) => (
    <a href={to.replace("$category", String((params as { category?: string })?.category ?? ""))}>
      {children}
    </a>
  ),
}));
const storefrontMock = vi.hoisted(() => () => ({
  useIsServicesStore: () => false,
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora", name_en: "Aurora", name_ar: "أورورا" },
    settings: state.settings,
    get lang() {
      return state.lang;
    },
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);
vi.mock("../src/components/storefront/NewsletterForm", () => ({ NewsletterForm: () => <div /> }));
vi.mock("@/components/storefront/NewsletterForm", () => ({ NewsletterForm: () => <div /> }));
vi.mock("../src/components/storefront/TrustBar", () => ({ TrustBar: () => <div /> }));
vi.mock("@/components/storefront/TrustBar", () => ({ TrustBar: () => <div /> }));

const { FooterV2 } = await import("../src/components/storefront/FooterV2");

const page = (over: Partial<EditablePage>): EditablePage => ({
  slug: "",
  title_ar: "",
  title_en: "",
  content_ar: "",
  content_en: "",
  image_url: null,
  menu_icon_url: null,
  image_position: "top",
  meta_title: "",
  meta_description: "",
  group: "help",
  ...over,
});

beforeEach(() => {
  state.lang = "en";
  state.settings = {
    newsletter_enabled: false,
    footer_logo_size: 32,
    socials: [{ name: "TikTok", url: "https://tiktok.com/@a" }],
    footer_company_title_en: "The House",
    footer_help_title_en: "Support",
    pages: [
      { slug: "about-us", title_en: "About us", title_ar: null, group: "company" },
      { slug: "returns", title_en: "Returns", title_ar: null, group: "help" },
    ],
  };
});

describe("the columns footer and the Pages & Policies screen", () => {
  it("shows each page under the group and heading the store chose", () => {
    render(<FooterV2 />);
    expect(screen.getAllByText("The House").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Support").length).toBeGreaterThan(0);
    expect(screen.getAllByText("About us")[0].closest("a")?.getAttribute("href")).toBe(
      "/$slug/about-us",
    );
    expect(screen.getAllByText("Returns").length).toBeGreaterThan(0);
  });

  it("leaves the company column out when no page is in it", () => {
    state.settings.pages = [
      { slug: "returns", title_en: "Returns", title_ar: null, group: "help" },
    ];
    render(<FooterV2 />);
    expect(screen.queryByText("The House")).toBeNull();
    expect(screen.getAllByText("Support").length).toBeGreaterThan(0);
  });

  it("links the store's social profiles", () => {
    render(<FooterV2 />);
    expect(screen.getAllByLabelText("TikTok")[0].getAttribute("href")).toBe(
      "https://tiktok.com/@a",
    );
  });
});

describe("buildPagesPayload", () => {
  const titles = { companyEn: " ", companyAr: "", helpEn: "Support", helpAr: "الدعم" };

  it("keeps the footer group each page was put in", () => {
    const { items } = buildPagesPayload(
      [
        page({ title_en: "About us", group: "company" }),
        page({ title_en: "Returns", group: "help" }),
        page({ title_en: "Old page", group: undefined }),
      ],
      titles,
    );
    expect(items.map((p) => [p.slug, p.group])).toEqual([
      ["about-us", "company"],
      ["returns", "help"],
      ["old-page", "help"],
    ]);
  });

  it("falls back to the default headings", () => {
    expect(buildPagesPayload([], titles).footer_titles).toEqual({
      company_en: "Company",
      company_ar: "الشركة",
      help_en: "Support",
      help_ar: "الدعم",
    });
  });
});
