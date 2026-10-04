import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The merchant's own advance rules in Orders → Payments, with the data layer faked.

const state = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  save: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  reorder: vi.fn(async () => undefined),
  setActive: vi.fn(async () => undefined),
  lang: "en" as "en" | "ar",
  vertical: "general" as string,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: state.lang }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: state.lang }) }));
const settingsForm = vi.hoisted(() => () => ({
  useBrandSettingsFormContext: () => ({
    form: { bs: { currency: "BHD", store_vertical: state.vertical } },
    brandId: "b1",
  }),
}));
vi.mock("../src/features/settings/use-brand-settings-form", settingsForm);
vi.mock("@/features/settings/use-brand-settings-form", settingsForm);
const rulesData = {
  advanceRulesQueries: {
    list: () => ({ queryKey: ["ar-test", "list"], queryFn: async () => state.rules }),
  },
  invalidateAdvanceRules: vi.fn(async () => undefined),
  saveAdvanceRule: state.save,
  deleteAdvanceRule: state.remove,
  reorderAdvanceRules: state.reorder,
  setAdvanceRuleActive: state.setActive,
};
vi.mock("../src/lib/data/advance-rules", () => rulesData);
vi.mock("@/lib/data/advance-rules", () => rulesData);
const catalogData = {
  catalogQueries: {
    products: () => ({
      queryKey: ["ar-test", "products"],
      queryFn: async () => [
        { id: "p1", name: "Abaya", name_en: "Abaya", name_ar: "عباية", category: "abayas" },
        { id: "p2", name: "Scarf", name_en: "Scarf", name_ar: "شال", category: "scarves" },
      ],
    }),
  },
};
vi.mock("../src/lib/data/catalog", () => catalogData);
vi.mock("@/lib/data/catalog", () => catalogData);
const categoriesData = {
  categoriesQueries: {
    active: () => ({
      queryKey: ["ar-test", "categories"],
      queryFn: async () => [
        { id: "c1", name_en: "Scarves", name_ar: "أوشحة", slug: "scarves" },
        { id: "c2", name_en: "Bags", name_ar: "حقائب", slug: "bags" },
      ],
    }),
  },
};
vi.mock("../src/lib/data/categories", () => categoriesData);
vi.mock("@/lib/data/categories", () => categoriesData);

const { AdvanceRulesCard } = await import("../src/features/settings/tabs/orders/AdvanceRulesCard");

const rule = (over: Record<string, unknown>) => ({
  id: "r1",
  name_en: "Made to order",
  name_ar: "حسب الطلب",
  is_active: true,
  sort_order: 0,
  fulfillment: [],
  made_to_order: true,
  product_ids: [],
  category_slugs: [],
  amount_kind: "percent",
  amount_value: 50,
  min_amount: null,
  max_amount: null,
  include_delivery_fee: false,
  min_order_total: null,
  max_order_total: null,
  customer_kind: "any",
  ...over,
});

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdvanceRulesCard />
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.rules = [];
  state.lang = "en";
  state.vertical = "general";
  vi.clearAllMocks();
});

describe("the advance rules card", () => {
  it("says the general rule covers everything when the store has none of its own", async () => {
    renderCard();
    expect(await screen.findByText(/the general rule covers everything/)).toBeInTheDocument();
  });

  it("lists the rules in their order, each in words", async () => {
    state.rules = [
      rule({}),
      rule({
        id: "r2",
        name_en: "Scarves",
        made_to_order: null,
        category_slugs: ["scarves"],
        amount_kind: "fixed",
        amount_value: 10,
        sort_order: 1,
        is_active: false,
      }),
    ];
    renderCard();
    expect(await screen.findByText("1. Made to order")).toBeInTheDocument();
    expect(screen.getByText("50% · made-to-order items")).toBeInTheDocument();
    expect(screen.getByText("2. Scarves")).toBeInTheDocument();
    expect(screen.getByText("a fixed BHD 10.000 · Scarves")).toBeInTheDocument();
  });

  it("adds a rule from a quick start and saves it after the last one", async () => {
    state.rules = [rule({ sort_order: 4 })];
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    fireEvent.click(screen.getByRole("button", { name: /Delivery 30%, with the fee/ }));
    expect(screen.getByLabelText("Value")).toHaveValue(30);
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({
        fulfillment: ["delivery"],
        amount_kind: "percent",
        amount_value: 30,
        include_delivery_fee: true,
        made_to_order: null,
      }),
      5,
    );
  });

  it("builds a rule by hand: chosen category, made-to-order only, a fixed amount with a most", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Made to order only" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scarves" }));
    fireEvent.click(screen.getByRole("button", { name: "Fixed amount" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Most/), { target: { value: "12" } });
    // The preview tries the rule on a sample order of the chosen category.
    expect(screen.getAllByText(/this rule asks BHD 12\.000/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({
        made_to_order: true,
        category_slugs: ["scarves"],
        amount_kind: "fixed",
        amount_value: 15,
        max_amount: 12,
      }),
      0,
    );
  });

  it("will not save a rule with no amount", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    expect(screen.getByRole("button", { name: "Save rule" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "150" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/over 100%/);
    expect(screen.getByRole("button", { name: "Save rule" })).toBeDisabled();
  });

  it("moves a rule up, switches it off and deletes it", async () => {
    state.rules = [rule({}), rule({ id: "r2", name_en: "Second", sort_order: 1 })];
    renderCard();
    const second = (await screen.findByText("2. Second")).closest("li")!;
    fireEvent.click(within(second).getByRole("button", { name: "Move up" }));
    await waitFor(() =>
      expect(state.reorder).toHaveBeenCalledWith("b1", [
        { id: "r2", sort_order: 0 },
        { id: "r1", sort_order: 1 },
      ]),
    );
    fireEvent.click(within(second).getByRole("switch"));
    await waitFor(() => expect(state.setActive).toHaveBeenCalledWith("b1", "r2", false));
    fireEvent.click(within(second).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith("b1", "r2"));
    // The first rule cannot move up.
    const first = screen.getByText("1. Made to order").closest("li")!;
    state.reorder.mockClear();
    fireEvent.click(within(first).getByRole("button", { name: "Move up" }));
    expect(state.reorder).not.toHaveBeenCalled();
  });

  it("edits a rule from its saved values", async () => {
    state.rules = [rule({ amount_value: 40, min_amount: 5 })];
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Value")).toHaveValue(40);
    expect(screen.getByLabelText(/Least/)).toHaveValue(5);
    expect(screen.getByRole("radio", { name: "Made to order only" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    await waitFor(() =>
      expect(state.save).toHaveBeenCalledWith(
        "b1",
        "r1",
        expect.objectContaining({ amount_value: 45, min_amount: 5 }),
        expect.any(Number),
      ),
    );
  });

  it("reads in Arabic", async () => {
    state.lang = "ar";
    state.rules = [rule({})];
    renderCard();
    expect(await screen.findByText("قواعد خاصة بالدفعة المقدمة")).toBeInTheDocument();
    expect(await screen.findByText(/50%.*المنتجات حسب الطلب/)).toBeInTheDocument();
  });
});

describe("the order value and the customer in a rule", () => {
  it("saves a rule for big orders from new customers", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Up to"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("radio", { name: "New customers" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({
        min_order_total: 100,
        max_order_total: 300,
        customer_kind: "new",
        amount_value: 50,
      }),
      0,
    );
  });

  it("starts from the new-customers quick start", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    fireEvent.click(screen.getByRole("button", { name: /New customers 50%/ }));
    expect(screen.getByRole("radio", { name: "New customers" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Value")).toHaveValue(50);
    fireEvent.click(screen.getByRole("button", { name: /Big orders/ }));
    expect(screen.getByLabelText("From")).toHaveValue(100);
  });

  it("will not save order value limits the wrong way round", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Add a rule" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Up to"), { target: { value: "200" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/below the lowest/);
    expect(screen.getByRole("button", { name: "Save rule" })).toBeDisabled();
  });

  it("lists a rule with its order value and customer in words", async () => {
    state.rules = [
      rule({
        made_to_order: null,
        min_order_total: 100,
        customer_kind: "returning",
        amount_value: 10,
      }),
    ];
    renderCard();
    expect(
      await screen.findByText("10% · orders of BHD 100.000 or more · returning customers"),
    ).toBeInTheDocument();
  });
});

describe("suggestions for the kind of store", () => {
  it("offers the vertical's templates and saves its rules, after the ones already there", async () => {
    state.vertical = "abayas";
    state.rules = [rule({ id: "r1", sort_order: 4 })];
    renderCard();
    expect(await screen.findByText("Suggested for your store")).toBeInTheDocument();
    const item = screen.getByText("A deposit on made-to-order items").closest("li")!;
    // Not before the store's rules are known, or the new rule could land ahead of them.
    const add = within(item).getByRole("button", { name: "Add" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save).toHaveBeenCalledWith(
      "b1",
      null,
      expect.objectContaining({
        made_to_order: true,
        amount_kind: "percent",
        amount_value: 50,
        name_en: "Made to order",
      }),
      5,
    );
  });

  it("does not offer a template that does not suit the store", async () => {
    state.vertical = "jewelry";
    renderCard();
    expect(await screen.findByText("High-value orders")).toBeInTheDocument();
    expect(screen.queryByText("A deposit on made-to-order items")).not.toBeInTheDocument();
  });

  it("offers nothing to a store that only sells files", async () => {
    state.vertical = "digital";
    renderCard();
    await screen.findByText(/the general rule covers everything/);
    expect(screen.queryByText("Suggested for your store")).not.toBeInTheDocument();
  });
});
