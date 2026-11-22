import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { readParts } from "../src/lib/platform-pages/page";
import {
  blankDraft,
  moved,
  newQuestion,
  newQuestionKey,
  pageProblems,
  slugFrom,
  storedParts,
  type PageDraft,
} from "../src/features/platform-pages/lib/editor";

// The super admin's editor of a platform page (PR 2 of 3): what it saves is what a visitor's page
// reads, what stops publishing is listed, the preview follows each change, and saving and
// publishing go through the data layer.

const ready = (): PageDraft => {
  const draft = blankDraft("برنامج انطلاقة");
  const question = newQuestion(draft.form, "cards");
  question.label = { ar: "مجال منتجاتك" };
  question.options = [
    { id: "o_1", title: { ar: "أزياء" } },
    { id: "o_2", title: { ar: "مأكولات" } },
  ];
  draft.form.steps = [{ title: { ar: "النشاط" }, questions: [question] }];
  return draft;
};

describe("the editor's rules", () => {
  it("saves exactly what a visitor's page reads back", () => {
    const draft = ready();
    expect(readParts(storedParts(draft))).toEqual(
      readParts(storedParts(readParts(storedParts(draft)))),
    );
    expect(readParts(storedParts(draft)).form.steps[0].questions[0].options).toHaveLength(2);
  });

  it("keeps a half-written piece in the editor, which a visitor's page leaves out", () => {
    const draft = ready();
    draft.form.steps[0].questions.push(newQuestion(draft.form, "text"));
    draft.blocks.push({ kind: "faq", items: [] });
    const stored = storedParts(draft);
    expect(readParts(stored, true).form.steps[0].questions).toHaveLength(2);
    expect(readParts(stored, true).blocks.map((b) => b.kind)).toEqual(["hero", "faq"]);
    expect(readParts(stored).form.steps[0].questions).toHaveLength(1);
    expect(readParts(stored).blocks.map((b) => b.kind)).toEqual(["hero"]);
    expect(readParts(storedParts(blankDraft("")), true).blocks).toHaveLength(1);
  });

  it("lists what stops a page from being published, and nothing for a ready one", () => {
    expect(pageProblems(ready())).toEqual([]);
    const empty = blankDraft("");
    empty.form.steps = [{ title: { ar: "" }, questions: [] }];
    expect(pageProblems(empty).map((p) => p.ar)).toEqual([
      "للصفحة عنوان في رأسها",
      "الخطوة 1 بلا عنوان",
      "الخطوة 1 بلا أسئلة",
    ]);
    const oneChoice = ready();
    oneChoice.form.steps[0].questions[0].options.pop();
    expect(pageProblems(oneChoice).map((p) => p.ar)).toEqual(["الخطوة 1، السؤال 1: يحتاج خيارين"]);
  });

  it("gives a new question a key the page has not used, and never reuses one", () => {
    const draft = ready();
    const key = newQuestionKey(draft.form);
    expect(key).not.toBe(draft.form.steps[0].questions[0].key);
    draft.form.steps[0].questions.push(newQuestion(draft.form, "text"));
    expect(new Set(draft.form.steps[0].questions.map((q) => q.key)).size).toBe(2);
  });

  it("makes an address from typed words, and moves items within their list", () => {
    expect(slugFrom("  Launch 2027!! ")).toBe("launch-2027");
    expect(slugFrom("برنامج")).toBe("");
    expect(moved(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});

// --- The editor screen, with its data layer mocked ------------------------------------------

const data = vi.hoisted(() => {
  const state = {
    page: null as unknown,
    saved: [] as unknown[],
    statuses: [] as string[],
  };
  return {
    state,
    module: () => ({
      platformPagesAdminKeys: { list: () => ["pages"], page: (id: string) => ["page", id] },
      platformPagesAdminQueries: {
        page: (id: string) => ({ queryKey: ["page", id], queryFn: async () => state.page }),
      },
      savePage: async (_id: string, draft: unknown) => {
        state.saved.push(JSON.parse(JSON.stringify(draft)));
      },
      setPageStatus: async (_id: string, status: string) => {
        state.statuses.push(status);
      },
    }),
  };
});
vi.mock("../src/lib/data/platform-pages/admin", data.module);
vi.mock("@/lib/data/platform-pages/admin", data.module);
vi.mock("../src/lib/platform-pages.functions", () => ({ sendPlatformPage: vi.fn() }));
vi.mock("@/lib/platform-pages.functions", () => ({ sendPlatformPage: vi.fn() }));
vi.mock("../src/lib/onboarding.functions", () => ({ getPlatformLogoUploadUrl: vi.fn() }));
vi.mock("@/lib/onboarding.functions", () => ({ getPlatformLogoUploadUrl: vi.fn() }));
vi.mock("@/components/ui/confirm-dialog", () => ({ confirmDialog: async () => true }));
vi.mock("../src/components/ui/confirm-dialog", () => ({ confirmDialog: async () => true }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useBlocker: () => undefined,
  useNavigate: () => vi.fn(),
}));

const { PageEditor } = await import("../src/features/platform-pages/components/PageEditor");

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PageEditor id="p1" lang="ar" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  data.state.saved = [];
  data.state.statuses = [];
  data.state.page = {
    id: "p1",
    slug: "launch",
    status: "draft",
    createdAt: "2026-11-22T00:00:00Z",
    updatedAt: "2026-11-22T00:00:00Z",
    ...ready(),
  };
});

describe("the editor screen", () => {
  it("shows a change in the preview, then saves the draft as edited", async () => {
    renderEditor();
    const titleField = (await screen.findAllByLabelText("بالعربي"))[1];
    fireEvent.change(titleField, { target: { value: "برنامج انطلاقة 2027" } });
    expect(
      screen.getAllByRole("heading", { level: 1, name: "برنامج انطلاقة 2027" }).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(data.state.saved).toHaveLength(1));
    const saved = data.state.saved[0] as PageDraft;
    expect(saved.blocks[0]).toMatchObject({ kind: "hero", title: { ar: "برنامج انطلاقة 2027" } });
  });

  it("publishes a ready page, and lists what stops one that is not", async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "نشر" }));
    await waitFor(() => expect(data.state.statuses).toEqual(["published"]));

    data.state.statuses = [];
    const empty = blankDraft("");
    data.state.page = { ...(data.state.page as object), status: "draft", ...empty };
    const view = renderEditor();
    const list = await within(view.container).findByRole("status");
    expect(list.textContent).toContain("للصفحة عنوان في رأسها");
    fireEvent.click(within(view.container).getByRole("button", { name: "نشر" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(data.state.statuses).toEqual([]);
  });
});
