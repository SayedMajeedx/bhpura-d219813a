import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  categoryChoices,
  categoryLabel,
  expensePayload,
  formFromExpense,
  formProblems,
} from "../src/features/expenses/lib/expense-form";
import { expenseTotals, filterExpenses } from "../src/features/expenses/lib/expense-list";
import {
  periodDays,
  periodLabel,
  periodShowing,
  shiftMonth,
  type ExpensePeriod,
} from "../src/features/expenses/lib/period";
import { expensesSheet } from "../src/features/expenses/lib/expense-sheet";

// The expenses page rebuilt as one page (the owner's review of 2026-11-16): one form, one list,
// one period that can be any month, categories in the reader's words.

const { ExpensesList } = await import("../src/features/expenses/components/ExpensesList");

const rent = {
  id: "r1",
  category: "Rent",
  description: "ايجار حاضنة دار لولوة",
  amount: 50,
  currency: "BHD",
  expense_date: "2026-08-18",
  expense_type: "opex",
  is_recurring: true,
  recurrence_period: "monthly",
  recurring_generated: 2,
  next_recurrence_date: "2026-11-18",
  recurring_source_id: null,
  receipt_url: null,
  store_name: null,
  notes: null,
  vendors: null,
};
const copy = {
  ...rent,
  id: "r2",
  expense_date: "2026-10-18",
  is_recurring: false,
  recurring_source_id: "r1",
  next_recurrence_date: null,
};
const bags = {
  ...rent,
  id: "p1",
  category: "Packaging",
  description: "اكياس كبيرة",
  amount: 38.75,
  expense_date: "2026-08-16",
  expense_type: "cogs",
  is_recurring: false,
  vendors: { name: "Gulf Packaging" },
};
const usd = {
  ...rent,
  id: "u1",
  currency: "USD",
  amount: 20,
  is_recurring: false,
  expense_date: "2026-10-02",
};

describe("the one expense form", () => {
  it("asks for what a save needs, a stock purchase's pieces too", () => {
    const blank = formFromExpense(null, "BHD", "2026-11-16");
    expect(blank).toMatchObject({
      kind: "opex",
      currency: "BHD",
      date: "2026-11-16",
      repeats: false,
    });
    expect(formProblems(blank)).toEqual(["category", "amount"]);
    expect(formProblems({ ...blank, kind: "cogs", category: "Packaging", amount: "10" })).toEqual([
      "quantity",
    ]);
  });

  it("writes a running cost with no quantity, a stock purchase with its unit cost", () => {
    const form = {
      ...formFromExpense(null, "BHD", "2026-11-16"),
      category: "rent",
      amount: "50.0004",
      repeats: true,
    };
    expect(expensePayload(form, ["Rent"])).toMatchObject({
      category: "Rent",
      amount: 50,
      expense_type: "opex",
      quantity: 1,
      unit_type: "pcs",
      is_recurring: true,
      recurrence_period: "monthly",
    });
    const stock = {
      ...form,
      kind: "cogs" as const,
      category: "Packaging",
      amount: "38.75",
      quantity: "250",
      unit: "أكياس",
      repeats: false,
    };
    expect(expensePayload(stock, [])).toMatchObject({
      expense_type: "cogs",
      quantity: 250,
      unit_type: "أكياس",
      unit_cost: 0.155,
    });
  });

  it("reads an expense back as it was saved", () => {
    expect(formFromExpense(bags, "BHD", "2026-11-16")).toMatchObject({
      kind: "cogs",
      category: "Packaging",
      amount: "38.75",
      date: "2026-08-16",
    });
    expect(formFromExpense(rent, "BHD", "2026-11-16").repeats).toBe(true);
  });

  it("names a built-in category in the reader's words and offers the store's own", () => {
    expect(categoryLabel("Rent", "ar")).toBe("إيجار");
    expect(categoryLabel("packaging", "en")).toBe("Packaging and materials");
    expect(categoryLabel("Abaya fabric", "ar")).toBe("Abaya fabric");
    expect(categoryChoices(["Rent", "Abaya fabric"], "opex")).toContain("Abaya fabric");
    expect(categoryChoices([], "opex")).not.toContain("Packaging");
    expect(categoryChoices([], "cogs")).toEqual(["Packaging", "Other"]);
  });
});

describe("the period", () => {
  it("is any month, days picked, or every period", () => {
    expect(periodDays({ kind: "month", month: "2026-02" })).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(periodDays({ kind: "range", from: "2026-11-16", to: "2026-08-01" })).toEqual({
      from: "2026-08-01",
      to: "2026-11-16",
    });
    expect(periodDays({ kind: "all" })).toEqual({ from: "", to: "" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -3)).toBe("2026-08");
    expect(periodLabel({ kind: "month", month: "2026-08" }, "en")).toBe("August 2026");
    expect(periodLabel({ kind: "month", month: "2026-08" }, "ar")).toBe("أغسطس 2026");
  });

  it("moves to a saved expense's month when its day is not on screen", () => {
    const november: ExpensePeriod = { kind: "month", month: "2026-11" };
    expect(periodShowing(november, "2026-08-18")).toEqual({ kind: "month", month: "2026-08" });
    expect(periodShowing(november, "2026-11-02")).toBe(november);
    const all: ExpensePeriod = { kind: "all" };
    expect(periodShowing(all, "2020-01-01")).toBe(all);
  });
});

describe("the list's totals and filter", () => {
  it("adds running costs and stock apart, leaving another currency out", () => {
    expect(expenseTotals([rent, copy, bags, usd], "BHD")).toEqual({
      running: 100,
      stock: 38.75,
      total: 138.75,
      otherCurrency: 1,
    });
  });

  it("filters by kind as well as period, category and search", () => {
    const all = [rent, copy, bags];
    expect(
      filterExpenses(all, { from: "", to: "", search: "", category: "all", kind: "cogs" }),
    ).toEqual([bags]);
    expect(
      filterExpenses(all, {
        from: "2026-10-01",
        to: "2026-10-31",
        search: "",
        category: "all",
        kind: "all",
      }),
    ).toEqual([copy]);
  });
});

describe("the expenses sheet", () => {
  it("adds up by category, then lists each expense, in the reader's words", () => {
    const sheet = expensesSheet({
      expenses: [rent, copy, bags, usd],
      lang: "ar",
      storeName: "بيورا لاين",
      currency: "BHD",
      digits: 3,
      periodText: "كل الفترات",
    });
    expect(sheet.rtl).toBe(true);
    const total = sheet.rows.find((r) => r[0]?.value === "المجموع")!;
    expect(total[3]?.value).toBe(138.75);
    expect(sheet.rows.some((r) => r[0]?.value === "إيجار" && r[3]?.value === 100)).toBe(true);
    const listed = sheet.rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r[0]?.value)));
    expect(listed.map((r) => r[7]?.value)).toEqual([null, "يتكرر", "تلقائي"]);
  });
});

describe("the one list", () => {
  it("says what each expense is, when a repeat falls next, and offers to stop it", () => {
    const stop = vi.fn();
    render(
      <ExpensesList
        lang="en"
        expenses={[rent, copy, bags] as never}
        storeCurrency="BHD"
        onEdit={() => undefined}
        onDelete={() => undefined}
        onStopRepeat={stop}
      />,
    );
    expect(screen.getAllByText(/Repeats monthly · next/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Automatic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gulf Packaging").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Packaging and materials").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Stop repeating" })[0]);
    expect(stop).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
    expect(screen.getAllByRole("button", { name: /^Edit / }).length).toBeGreaterThan(0);
  });
});
