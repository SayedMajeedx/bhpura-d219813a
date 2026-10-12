import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenseCurrency } from "../src/features/expenses/lib/expense-list";

// A new expense is written in the store's own currency. The dialog once started every new
// expense in BHD, and the page labelled its figures with the first expense's currency.

const state = vi.hoisted(() => ({
  storeCurrency: "SAR",
  createExpense: vi.fn(async (..._args: unknown[]) => undefined),
  updateExpense: vi.fn(async (..._args: unknown[]) => undefined),
}));
const expensesData = vi.hoisted(() => () => ({
  createExpense: state.createExpense,
  updateExpense: state.updateExpense,
}));
vi.mock("../src/lib/data/expenses", expensesData);
vi.mock("@/lib/data/expenses", expensesData);
const currencyHook = vi.hoisted(() => () => ({ useStoreCurrency: () => state.storeCurrency }));
vi.mock("../src/hooks/use-store-currency", currencyHook);
vi.mock("@/hooks/use-store-currency", currencyHook);
const brandMock = vi.hoisted(() => () => ({ useBrand: () => ({ id: "b1", slug: "store" }) }));
vi.mock("../src/lib/brand-context", brandMock);
vi.mock("@/lib/brand-context", brandMock);
const i18nMock = vi.hoisted(() => () => ({
  useI18n: () => ({ lang: "en" }),
  useT: () => (key: string) => key,
}));
vi.mock("../src/lib/i18n", i18nMock);
vi.mock("@/lib/i18n", i18nMock);
const sessionMock = vi.hoisted(() => () => ({ getCurrentUser: async () => ({ id: "u1" }) }));
vi.mock("../src/lib/auth/session", sessionMock);
vi.mock("@/lib/auth/session", sessionMock);
const uploads = vi.hoisted(() => () => ({
  uploadPublicMedia: vi.fn(async () => "https://media.test/receipt.png"),
  deletePublicMediaUrl: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/r2-upload", uploads);
vi.mock("@/lib/r2-upload", uploads);
const packaging = vi.hoisted(() => () => ({ syncExpensePackaging: vi.fn(async () => undefined) }));
vi.mock("../src/components/accounting/sync-expense-packaging", packaging);
vi.mock("@/components/accounting/sync-expense-packaging", packaging);
const client = vi.hoisted(() => () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", client);
vi.mock("@/integrations/supabase/client", client);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The category picker is a popover of its own; here it is a plain field.
const picker = vi.hoisted(() => () => ({
  CreatableCategorySelect: (props: { value: string; onChange: (value: string) => void }) => (
    <input
      aria-label="category"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));
vi.mock("../src/features/expenses/components/CreatableCategorySelect", picker);
vi.mock("@/features/expenses/components/CreatableCategorySelect", picker);

const { ExpenseDialog } = await import("../src/features/expenses/components/ExpenseDialog");

const existing = {
  id: "e1",
  category: "Rent",
  description: "Shop rent",
  amount: 250,
  currency: "USD",
  expense_date: "2026-10-01",
  notes: null,
};
const dialog = (expense: typeof existing | null) =>
  render(
    <ExpenseDialog
      open
      onOpenChange={() => undefined}
      expense={expense}
      categories={["Rent"]}
      onSaved={() => undefined}
    />,
  );
const save = () => fireEvent.click(screen.getByRole("button", { name: "common.save" }));

beforeEach(() => {
  state.storeCurrency = "SAR";
  state.createExpense.mockClear();
  state.updateExpense.mockClear();
});

describe("the currency an expense is written in", () => {
  it("is the store's for a new expense, and the expense's own once it has one", () => {
    expect(expenseCurrency(null, "SAR")).toBe("SAR");
    expect(expenseCurrency(undefined, "KWD")).toBe("KWD");
    expect(expenseCurrency({ currency: "USD" }, "SAR")).toBe("USD");
    expect(expenseCurrency({ currency: "" }, "SAR")).toBe("SAR");
    expect(expenseCurrency({ currency: null }, "SAR")).toBe("SAR");
  });
});

describe("the manual expense dialog", () => {
  it("saves a new expense in the store's currency, not in BHD", async () => {
    dialog(null);
    fireEvent.change(screen.getByLabelText("category"), { target: { value: "Rent" } });
    save();
    await waitFor(() => expect(state.createExpense).toHaveBeenCalled());
    expect(state.createExpense.mock.calls[0][0]).toMatchObject({
      brand_id: "b1",
      category: "Rent",
      currency: "SAR",
    });
  });

  it("leaves an expense being edited in the currency it was recorded in", async () => {
    dialog(existing);
    save();
    await waitFor(() => expect(state.updateExpense).toHaveBeenCalled());
    expect(state.updateExpense.mock.calls[0][2]).toMatchObject({ currency: "USD" });
    expect(state.createExpense).not.toHaveBeenCalled();
  });
});
