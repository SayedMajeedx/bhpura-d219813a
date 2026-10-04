import { describe, expect, it } from "vitest";
import {
  EMPTY_RULE_FORM,
  RULE_PRESETS,
  describeRule,
  ruleColumns,
  ruleDefFromForm,
  ruleDefFromRow,
  ruleFormError,
  ruleFormFrom,
  type AdvanceRuleRow,
} from "../src/lib/payments/advance-rule-form";
import {
  advanceRuleFromJson,
  advanceRuleToJson,
  defaultAdvanceRules,
} from "../src/lib/payments/advance-rules";

const money = (n: number) => `BHD ${n.toFixed(3)}`;
const names = {
  productName: (id: string) => (id === "p1" ? "Abaya" : "?"),
  categoryName: (slug: string) => (slug === "scarves" ? "Scarves" : slug),
};
const row = (over: Partial<AdvanceRuleRow> = {}): AdvanceRuleRow => ({
  id: "r1",
  name_en: "Made to order",
  name_ar: null,
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
  destination_kind: "any",
  destination_countries: [],
  ...over,
});

describe("a store's own advance rule, as the merchant edits it", () => {
  it("reads a row into the form and back into the columns it saves", () => {
    const form = ruleFormFrom(
      row({
        fulfillment: ["delivery", "teleport"],
        product_ids: ["p1"],
        category_slugs: ["scarves"],
        amount_value: "20.5",
        min_amount: "5",
        max_amount: null,
        include_delivery_fee: true,
      }),
    );
    expect(form).toMatchObject({
      fulfillment: ["delivery"],
      made_to_order: "only",
      value: "20.5",
      min: "5",
      max: "",
      include_fee: true,
      min_total: "",
      max_total: "",
      customer: "any",
      destination: "any",
      countries: [],
    });
    expect(ruleColumns(form)).toEqual({
      name_en: "Made to order",
      name_ar: null,
      is_active: true,
      fulfillment: ["delivery"],
      made_to_order: true,
      product_ids: ["p1"],
      category_slugs: ["scarves"],
      amount_kind: "percent",
      amount_value: 20.5,
      min_amount: 5,
      max_amount: null,
      include_delivery_fee: true,
      min_order_total: null,
      max_order_total: null,
      customer_kind: "any",
      destination_kind: "any",
      destination_countries: [],
    });
    expect(ruleFormFrom(row({ made_to_order: false })).made_to_order).toBe("not");
    expect(ruleFormFrom(row({ made_to_order: null })).made_to_order).toBe("any");
  });

  it("refuses an empty or silly amount, a percentage over 100, and a most below the least", () => {
    const form = { ...EMPTY_RULE_FORM, value: "30" };
    expect(ruleFormError(form, false)).toBeNull();
    expect(ruleFormError({ ...form, value: "" }, false)).toMatch(/Enter what the rule asks/);
    expect(ruleFormError({ ...form, value: "0" }, false)).toMatch(/Enter what the rule asks/);
    expect(ruleFormError({ ...form, value: "120" }, true)).toBe("النسبة لا تتجاوز 100%.");
    expect(ruleFormError({ ...form, kind: "fixed", value: "120" }, false)).toBeNull();
    expect(ruleFormError({ ...form, min: "x" }, false)).toMatch(/positive numbers/);
    expect(ruleFormError({ ...form, min: "9", max: "5" }, false)).toMatch(/below the least/);
  });

  it("is the same rule to the engine whether it comes from a row, a form or the database's JSON", () => {
    const fromRow = ruleDefFromRow(row({ product_ids: ["p1"], min_amount: 2 }));
    const fromForm = ruleDefFromForm(ruleFormFrom(row({ product_ids: ["p1"], min_amount: 2 })));
    expect({ ...fromRow, id: undefined, nameEn: undefined, nameAr: undefined }).toEqual({
      ...fromForm,
      id: undefined,
      nameEn: undefined,
      nameAr: undefined,
    });
    const back = advanceRuleFromJson(advanceRuleToJson(fromRow));
    expect(back).toMatchObject({
      madeToOrder: true,
      productIds: ["p1"],
      kind: "percent",
      value: 50,
      min: 2,
      max: null,
    });
    // The general rule leaves keys out; reading it fills them in.
    expect(advanceRuleFromJson({ kind: "percent", value: "30" })).toMatchObject({
      fulfillment: [],
      madeToOrder: null,
      productIds: [],
      includeFee: false,
    });
  });

  it("says in words what a rule asks", () => {
    const base = ruleDefFromRow(row());
    expect(describeRule(base, { isAr: false, money, ...names })).toBe("50% · made-to-order items");
    expect(
      describeRule(
        ruleDefFromRow(
          row({
            made_to_order: null,
            product_ids: ["p1"],
            category_slugs: ["scarves"],
            fulfillment: ["delivery", "pickup"],
            amount_kind: "fixed",
            amount_value: 20,
            min_amount: 5,
            max_amount: 15,
            include_delivery_fee: true,
          }),
        ),
        { isAr: false, money, ...names },
      ),
    ).toBe(
      "a fixed BHD 20.000 · Abaya, Scarves · for delivery or pickup · at least BHD 5.000 · at most BHD 15.000 · with the delivery fee",
    );
    expect(describeRule(base, { isAr: true, money, ...names })).toBe("50% · المنتجات حسب الطلب");
  });

  it("reads and writes an order total and a kind of customer", () => {
    const form = ruleFormFrom(
      row({ min_order_total: "100", max_order_total: 250, customer_kind: "returning" }),
    );
    expect(form).toMatchObject({ min_total: "100", max_total: "250", customer: "returning" });
    expect(ruleColumns(form)).toMatchObject({
      min_order_total: 100,
      max_order_total: 250,
      customer_kind: "returning",
    });
    expect(ruleDefFromRow(row({ min_order_total: 100, customer_kind: "new" }))).toMatchObject({
      minTotal: 100,
      maxTotal: null,
      customer: "new",
    });
    // An unknown kind of customer reads as any.
    expect(ruleFormFrom(row({ customer_kind: "vip" })).customer).toBe("any");
    expect(
      advanceRuleFromJson({ kind: "percent", value: 10, min_total: "50", customer: "new" }),
    ).toMatchObject({ minTotal: 50, maxTotal: null, customer: "new" });
    expect(advanceRuleToJson(ruleDefFromRow(row({ max_order_total: 90 })))).toMatchObject({
      min_total: null,
      max_total: 90,
      customer: "any",
      destination: "any",
      countries: [],
    });
  });

  it("refuses order value limits that are not positive or are the wrong way round", () => {
    const form = { ...EMPTY_RULE_FORM, value: "30" };
    expect(ruleFormError({ ...form, min_total: "100", max_total: "250" }, false)).toBeNull();
    expect(ruleFormError({ ...form, min_total: "x" }, false)).toMatch(/order value limits/);
    expect(ruleFormError({ ...form, max_total: "0" }, true)).toBe("قيمة الطلب أرقام موجبة.");
    expect(ruleFormError({ ...form, min_total: "300", max_total: "200" }, false)).toMatch(
      /below the lowest/,
    );
  });

  it("puts the order total and the customer in words", () => {
    const words = (over: Partial<AdvanceRuleRow>) =>
      describeRule(ruleDefFromRow(row({ made_to_order: null, ...over })), {
        isAr: false,
        money,
        ...names,
      });
    expect(words({ min_order_total: 100 })).toBe("50% · orders of BHD 100.000 or more");
    expect(words({ max_order_total: 40 })).toBe("50% · orders up to BHD 40.000");
    expect(words({ min_order_total: 40, max_order_total: 90, customer_kind: "new" })).toBe(
      "50% · orders from BHD 40.000 to BHD 90.000 · new customers",
    );
    expect(words({ customer_kind: "returning" })).toBe("50% · returning customers");
  });

  it("reads and writes where an order is going", () => {
    const form = ruleFormFrom(
      row({ destination_kind: "abroad", destination_countries: ["SA", "KW"] }),
    );
    expect(form).toMatchObject({ destination: "abroad", countries: ["SA", "KW"] });
    expect(ruleColumns(form)).toMatchObject({
      destination_kind: "abroad",
      destination_countries: ["SA", "KW"],
    });
    expect(ruleDefFromRow(row({ destination_kind: "local" }))).toMatchObject({
      destination: "local",
      countries: [],
    });
    // Countries are kept only with abroad, and an unknown kind reads as anywhere.
    expect(ruleColumns({ ...form, destination: "local" })).toMatchObject({
      destination_kind: "local",
      destination_countries: [],
    });
    expect(ruleFormFrom(row({ destination_kind: "moon" })).destination).toBe("any");
    expect(
      advanceRuleFromJson({ kind: "percent", value: 10, destination: "abroad", countries: ["AE"] }),
    ).toMatchObject({ destination: "abroad", countries: ["AE"] });
    expect(advanceRuleFromJson({ kind: "percent", value: 10 })).toMatchObject({
      destination: "any",
      countries: [],
    });
    expect(advanceRuleToJson(ruleDefFromForm(form))).toMatchObject({
      destination: "abroad",
      countries: ["SA", "KW"],
    });
  });

  it("refuses countries without abroad, the home country, and a code that is not one", () => {
    const form = { ...EMPTY_RULE_FORM, value: "30" };
    expect(ruleFormError({ ...form, destination: "abroad", countries: ["SA"] }, false)).toBeNull();
    expect(ruleFormError({ ...form, destination: "local", countries: ["SA"] }, false)).toMatch(
      /abroad only/,
    );
    expect(ruleFormError({ ...form, destination: "abroad", countries: ["BH"] }, false)).toMatch(
      /from the list/,
    );
    expect(ruleFormError({ ...form, destination: "abroad", countries: ["sa"] }, true)).toBe(
      "اختر دولاً من القائمة.",
    );
  });

  it("puts the destination in words", () => {
    const words = (over: Partial<AdvanceRuleRow>) =>
      describeRule(ruleDefFromRow(row({ made_to_order: null, ...over })), {
        isAr: false,
        money,
        ...names,
      });
    expect(words({ destination_kind: "local" })).toBe("50% · inside Bahrain");
    expect(words({ destination_kind: "abroad" })).toBe("50% · orders abroad");
    expect(words({ destination_kind: "abroad", destination_countries: ["SA", "KW"] })).toBe(
      "50% · to Saudi Arabia, Kuwait",
    );
  });

  it("offers quick starts that are valid rules as they are", () => {
    for (const preset of RULE_PRESETS) {
      expect(ruleFormError({ ...EMPTY_RULE_FORM, ...preset.form }, false), preset.id).toBeNull();
    }
  });

  it("writes the general rule as rules the same way the database does", () => {
    expect(defaultAdvanceRules(30, "all")).toHaveLength(1);
    expect(defaultAdvanceRules(30, "made_to_order_or_delivery")).toHaveLength(2);
    expect(defaultAdvanceRules(30, "delivery")[0]).toMatchObject({
      fulfillment: ["delivery"],
      includeFee: true,
    });
    expect(defaultAdvanceRules(30, "made_to_order")[0]).toMatchObject({
      madeToOrder: true,
      includeFee: false,
    });
  });
});
