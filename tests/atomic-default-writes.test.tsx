import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { moveCategory } from "../src/lib/category-order";

// Making a template the default goes through one transactional call after the
// template is saved (bug #21), and moving a category rewrites the whole order
// (bug #20).

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const data = vi.hoisted(() => ({
  createMessageTemplate: vi.fn(async () => "t-new"),
  updateMessageTemplate: vi.fn(async () => undefined),
  deleteMessageTemplate: vi.fn(async () => undefined),
  setDefaultMessageTemplate: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const templates = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...data,
});
vi.mock("../src/lib/data/message-templates", (io) => templates(io));
vi.mock("@/lib/data/message-templates", (io) => templates(io));
const session = { getCurrentUser: async () => ({ id: "u1" }) };
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const i18n = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useI18n: () => ({ lang: "en" }),
});
vi.mock("../src/lib/i18n", (io) => i18n(io));
vi.mock("@/lib/i18n", (io) => i18n(io));
const supabaseClient = { supabase: {} };
vi.mock("../src/integrations/supabase/client", () => supabaseClient);
vi.mock("@/integrations/supabase/client", () => supabaseClient);

const { ManageTemplatesDialog } = await import("../src/components/orders/SendInvoiceDialog");

beforeEach(() => {
  vi.clearAllMocks();
});

const renderDialog = () => {
  const onChanged = vi.fn();
  render(
    <ManageTemplatesDialog open onOpenChange={vi.fn()} templates={[]} onChanged={onChanged} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /New template/ }));
  fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Thank you" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Use as default template" }));
  return onChanged;
};

describe("saving a template as the default", () => {
  it("saves it, then makes it the default in one call", async () => {
    const onChanged = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(data.createMessageTemplate).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ name: "Thank you", is_default: false }),
    );
    expect(data.setDefaultMessageTemplate).toHaveBeenCalledWith("b1", "t-new");
  });

  it("reports a refused default and retries it on the same template", async () => {
    data.setDefaultMessageTemplate.mockRejectedValueOnce({ message: "denied" });
    const onChanged = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(onChanged).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(data.createMessageTemplate).toHaveBeenCalledTimes(1);
    expect(data.updateMessageTemplate).toHaveBeenCalledWith(
      "b1",
      "t-new",
      expect.not.objectContaining({ is_default: expect.anything() }),
    );
    expect(data.setDefaultMessageTemplate).toHaveBeenCalledTimes(2);
  });

  it("saves a template that is not the default without touching the default", async () => {
    const onChanged = renderDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use as default template" }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(data.setDefaultMessageTemplate).not.toHaveBeenCalled();
  });
});

describe("moveCategory", () => {
  const ids = ["a", "b", "c"];

  it("swaps a category with its neighbour", () => {
    expect(moveCategory(ids, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveCategory(ids, "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("does not move past either end or an unknown category", () => {
    expect(moveCategory(ids, "a", -1)).toBeNull();
    expect(moveCategory(ids, "c", 1)).toBeNull();
    expect(moveCategory(ids, "x", 1)).toBeNull();
  });
});
