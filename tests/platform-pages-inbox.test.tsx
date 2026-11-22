import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PageForm } from "../src/lib/platform-pages/page";
import {
  answerLines,
  contactOf,
  filterResponses,
  replyMessage,
  responsesSheet,
  statusCounts,
  type PageResponse,
} from "../src/features/platform-pages/lib/responses";

// A platform page's responses inbox (PR 3 of 3): each answer under its question's words, the
// person to reach on WhatsApp, the states and the search, and the Excel sheet.

const FORM: PageForm = {
  steps: [
    {
      title: { ar: "البيانات" },
      questions: [
        {
          key: "business_name",
          type: "text",
          required: true,
          label: { ar: "اسم المشروع" },
          options: [],
        },
        {
          key: "instagram_handle",
          type: "instagram",
          required: true,
          label: { ar: "حساب الإنستغرام" },
          options: [],
        },
        {
          key: "whatsapp_number",
          type: "phone",
          required: true,
          label: { ar: "رقم الواتساب" },
          options: [],
        },
        {
          key: "product_category",
          type: "cards",
          required: true,
          label: { ar: "المجال" },
          options: [
            { id: "fashion", title: { ar: "أزياء" } },
            { id: "food", title: { ar: "مأكولات" } },
          ],
        },
      ],
    },
  ],
};

const response = (id: string, patch: Partial<PageResponse> = {}): PageResponse => ({
  id,
  status: "new",
  notes: null,
  createdAt: "2026-11-20T10:00:00Z",
  answers: {
    business_name: "لافندر",
    instagram_handle: "lavender.bh",
    whatsapp_number: "+97339000000",
    product_category: "fashion",
  },
  ...patch,
});

describe("the inbox's rules", () => {
  it("writes each answer under its question, a choice by its words, and keeps an old key", () => {
    const lines = answerLines(FORM, { ...response("a").answers, old_field: "قديم" }, "ar");
    expect(lines.map((l) => [l.label, l.value])).toEqual([
      ["اسم المشروع", "لافندر"],
      ["حساب الإنستغرام", "@lavender.bh"],
      ["رقم الواتساب", "+97339000000"],
      ["المجال", "أزياء"],
      ["old_field", "قديم"],
    ]);
  });

  it("finds the person to reach and writes the message to them", () => {
    expect(contactOf(FORM, response("a").answers)).toEqual({
      name: "لافندر",
      phone: "+97339000000",
      instagram: "lavender.bh",
    });
    expect(replyMessage("لافندر", "برنامج انطلاقة", "ar")).toBe(
      "مرحباً لافندر، معكم فريق Boutq بخصوص طلبكم في «برنامج انطلاقة».",
    );
  });

  it("filters by state and searches answers and notes, and counts each state", () => {
    const list = [
      response("a"),
      response("b", { status: "accepted", notes: "متجر جاد" }),
      response("c", { answers: { business_name: "سكر", product_category: "food" } }),
    ];
    expect(statusCounts(list)).toMatchObject({ all: 3, new: 2, accepted: 1 });
    expect(
      filterResponses(list, FORM, { status: "accepted", term: "" }, "ar").map((r) => r.id),
    ).toEqual(["b"]);
    expect(
      filterResponses(list, FORM, { status: "all", term: "مأكولات" }, "ar").map((r) => r.id),
    ).toEqual(["c"]);
    expect(
      filterResponses(list, FORM, { status: "all", term: "جاد" }, "ar").map((r) => r.id),
    ).toEqual(["b"]);
  });

  it("writes a sheet: the day, the state, each question, the notes", () => {
    const sheet = responsesSheet(FORM, [response("a", { notes: "اتصال" })], "ar");
    expect(sheet.rows[0].map((c) => c?.value)).toEqual([
      "التاريخ",
      "الحالة",
      "اسم المشروع",
      "حساب الإنستغرام",
      "رقم الواتساب",
      "المجال",
      "ملاحظات",
    ]);
    expect(sheet.rows[1].map((c) => c?.value)).toEqual([
      "2026-11-20",
      "جديد",
      "لافندر",
      "@lavender.bh",
      "+97339000000",
      "أزياء",
      "اتصال",
    ]);
  });
});

// --- The inbox screen, with its data mocked -------------------------------------------------

const data = vi.hoisted(() => {
  const state = { responses: [] as unknown[], updates: [] as unknown[] };
  return {
    state,
    admin: () => ({
      platformPagesAdminQueries: {
        page: (id: string) => ({
          queryKey: ["page", id],
          queryFn: async () => ({
            id,
            slug: "grant",
            status: "published",
            blocks: [{ kind: "hero", title: { ar: "برنامج انطلاقة" }, points: [] }],
            form: state.form,
            settings: {},
          }),
        }),
      },
    }),
    responses: () => ({
      platformPageResponsesKeys: { page: (id: string) => ["responses", id] },
      platformPageResponsesQueries: {
        page: (id: string) => ({
          queryKey: ["responses", id],
          queryFn: async () => state.responses,
        }),
      },
      updatePageResponse: async (id: string, patch: unknown) => {
        state.updates.push({ id, patch });
      },
      deletePageResponse: vi.fn(),
    }),
  } as const;
});
(data.state as unknown as { form: PageForm }).form = FORM;
vi.mock("../src/lib/data/platform-pages/admin", data.admin);
vi.mock("@/lib/data/platform-pages/admin", data.admin);
vi.mock("../src/lib/data/platform-pages/responses", data.responses);
vi.mock("@/lib/data/platform-pages/responses", data.responses);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

const { ResponsesInbox } = await import("../src/features/platform-pages/components/ResponsesInbox");

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ResponsesInbox pageId="p1" lang="ar" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  data.state.updates = [];
  data.state.responses = [
    response("a"),
    response("b", {
      status: "accepted",
      answers: { business_name: "سكر", product_category: "food" },
    }),
  ];
});

describe("the inbox screen", () => {
  it("lists the responses with the states' counts and a WhatsApp reply", async () => {
    renderInbox();
    expect(await screen.findByText("لافندر")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "الكل (2)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "مقبول (1)" })).toBeTruthy();
    const whatsapp = screen.getByRole("link", { name: /واتساب/ });
    expect(whatsapp.getAttribute("href")).toContain("https://wa.me/97339000000?text=");
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("«برنامج انطلاقة»");
  });

  it("narrows to a state and to a search", async () => {
    renderInbox();
    await screen.findByText("لافندر");
    fireEvent.click(screen.getByRole("tab", { name: "مقبول (1)" }));
    expect(screen.queryByText("لافندر")).toBeNull();
    expect(screen.getByText("سكر")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "الكل (2)" }));
    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الردود" }), {
      target: { value: "لافند" },
    });
    await waitFor(() => expect(screen.queryByText("سكر")).toBeNull());
  });

  it("saves a note from the details", async () => {
    renderInbox();
    await screen.findByText("لافندر");
    fireEvent.click(screen.getAllByRole("button", { name: "التفاصيل والملاحظات" })[0]);
    fireEvent.change(await screen.findByLabelText("ملاحظاتك"), { target: { value: "اتصلت بها" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الملاحظات" }));
    await waitFor(() =>
      expect(data.state.updates).toEqual([{ id: "a", patch: { id: "a", notes: "اتصلت بها" } }]),
    );
  });
});
