import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readPage, platformPageHead, type PlatformPage } from "../src/lib/platform-pages/page";

// A platform page as a visitor uses it (`/p/<slug>`): a step is checked before the next, the
// answers are sent through the server function, a refusal points at its question, a closed page
// shows its message, and the thank-you card repeats what the page names.

const send = vi.hoisted(() => {
  const state = { result: { ok: true } as unknown, calls: [] as unknown[] };
  return {
    state,
    mock: () => ({
      sendPlatformPage: async (input: unknown) => {
        state.calls.push(input);
        return state.result;
      },
    }),
  };
});
vi.mock("../src/lib/platform-pages.functions", send.mock);
vi.mock("@/lib/platform-pages.functions", send.mock);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { PlatformPageView } =
  await import("../src/features/platform-pages/components/PlatformPageView");

const RAW = {
  slug: "launch",
  status: "published",
  content: {
    blocks: [
      {
        kind: "hero",
        title: { ar: "برنامج انطلاقة", en: "Launch programme" },
        lead: { ar: "منحة لستة أشهر" },
        points: [{ ar: "بدون رسوم" }],
      },
      { kind: "faq", items: [{ question: { ar: "متى؟" }, answer: { ar: "قريباً" } }] },
      { kind: "unknown-kind", title: { ar: "يُترك" } },
    ],
  },
  form: {
    submit_label: { ar: "إرسال الطلب" },
    steps: [
      {
        short: { ar: "البيانات" },
        title: { ar: "بيانات المشروع" },
        questions: [
          {
            key: "business_name",
            type: "text",
            required: true,
            in_summary: true,
            label: { ar: "اسم المشروع" },
          },
          {
            key: "whatsapp_number",
            type: "phone",
            required: true,
            in_summary: true,
            label: { ar: "رقم الواتساب" },
          },
        ],
      },
      {
        short: { ar: "النشاط" },
        title: { ar: "النشاط" },
        questions: [
          {
            key: "category",
            type: "cards",
            required: true,
            label: { ar: "مجال منتجاتك" },
            options: [
              { id: "fashion", title: { ar: "أزياء" } },
              { id: "food", title: { ar: "مأكولات" } },
            ],
          },
          { key: "broken", type: "rocket", label: { ar: "سؤال لا يُقرأ" } },
        ],
      },
    ],
  },
  settings: {
    thank_you: { title: { ar: "شكراً لكم" }, body: { ar: "سنتواصل معكم" } },
    closed_message: { title: { ar: "انتهى التقديم" } },
    footer: [{ ar: "© Boutq OS" }],
    share: { title: { ar: "انطلاقة — Boutq" }, image_url: "/boutq-grant-banner.png" },
  },
};

const page = () => readPage(RAW) as PlatformPage;

beforeEach(() => {
  send.state.result = { ok: true };
  send.state.calls = [];
});

describe("reading a page", () => {
  it("keeps what has a shape and drops the rest", () => {
    const read = page();
    expect(read.blocks.map((b) => b.kind)).toEqual(["hero", "faq"]);
    expect(read.form.steps[1].questions.map((q) => q.key)).toEqual(["category"]);
    expect(readPage({ ...RAW, status: "draft" })).toBeNull();
    expect(readPage(null)).toBeNull();
  });

  it("previews a shared link with the page's own title and picture", () => {
    const head = platformPageHead(page(), "ar");
    expect(head.meta).toContainEqual({ title: "انطلاقة — Boutq" });
    expect(head.meta).toContainEqual({
      property: "og:image",
      content: "https://boutq.store/boutq-grant-banner.png",
    });
    expect(platformPageHead(page(), "en").meta[0]).toEqual({ title: "انطلاقة — Boutq" });
  });
});

describe("filling a page in", () => {
  it("checks a step before the next, then sends and thanks", async () => {
    render(<PlatformPageView page={page()} lang="ar" />);
    expect(screen.getByRole("heading", { level: 1, name: "برنامج انطلاقة" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /المتابعة لآخر خطوة/ }));
    expect(screen.getByRole("alert").textContent).toBe("يرجى تعبئة: اسم المشروع");

    fireEvent.change(screen.getByLabelText(/اسم المشروع/), { target: { value: "لافندر" } });
    fireEvent.change(screen.getByLabelText(/رقم الواتساب/), { target: { value: "039000000" } });
    fireEvent.click(screen.getByRole("button", { name: /المتابعة لآخر خطوة/ }));

    expect(screen.getByRole("heading", { level: 2, name: /خطوة 2 من 2: النشاط/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "أزياء" }));
    fireEvent.click(screen.getByRole("button", { name: /إرسال الطلب/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "شكراً لكم" })).toBeTruthy());
    expect(send.state.calls).toEqual([
      {
        data: {
          slug: "launch",
          answers: {
            business_name: "لافندر",
            whatsapp_number: "+97339000000",
            category: "fashion",
          },
        },
      },
    ]);
    expect(screen.getByText("+97339000000")).toBeTruthy();
  });

  it("opens the step of a question the server refused", async () => {
    send.state.result = {
      ok: false,
      reason: "answer",
      problem: { key: "business_name", kind: "invalid" },
    };
    render(<PlatformPageView page={page()} lang="ar" />);
    fireEvent.change(screen.getByLabelText(/اسم المشروع/), { target: { value: "لافندر" } });
    fireEvent.change(screen.getByLabelText(/رقم الواتساب/), { target: { value: "39000000" } });
    fireEvent.click(screen.getByRole("button", { name: /المتابعة/ }));
    fireEvent.click(screen.getByRole("radio", { name: "مأكولات" }));
    fireEvent.click(screen.getByRole("button", { name: /إرسال الطلب/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("يرجى التأكد من: اسم المشروع"),
    );
    expect(screen.getByRole("heading", { level: 2, name: /خطوة 1 من 2/ })).toBeTruthy();
  });

  it("shows the closed message in place of the form", () => {
    render(<PlatformPageView page={{ ...page(), status: "closed" }} lang="ar" />);
    expect(screen.getByRole("heading", { name: "انتهى التقديم" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /المتابعة/ })).toBeNull();
  });

  it("reads in English where the page has English, and falls back to Arabic", () => {
    render(<PlatformPageView page={page()} lang="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "Launch programme" })).toBeTruthy();
    expect(screen.getByText("منحة لستة أشهر")).toBeTruthy();
    expect(screen.getByRole("main").getAttribute("dir")).toBe("ltr");
  });
});
