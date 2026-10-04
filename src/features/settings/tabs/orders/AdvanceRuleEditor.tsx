import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AdvanceDestinationField } from "@/features/settings/tabs/orders/AdvanceDestinationField";
import { formatMoney } from "@/lib/format";
import { catalogQueries } from "@/lib/data/catalog";
import { categoriesQueries } from "@/lib/data/categories";
import {
  EMPTY_RULE_FORM,
  RULE_PRESETS,
  fulfillmentWord,
  ruleDefFromForm,
  ruleFormError,
  type AdvanceRuleForm,
  type MadeToOrderChoice,
} from "@/lib/payments/advance-rule-form";
import {
  ADVANCE_FULFILLMENTS,
  advanceParts,
  type AdvanceFulfillment,
  type AdvanceOrder,
} from "@/lib/payments/advance-rules";

const toggle = <T extends string>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((other) => other !== item) : [...list, item];

/** A sample order the rule is tried on: the products and categories it names, or a made-to-order and a ready-made line. */
function sampleOrder(
  form: AdvanceRuleForm,
  products: Array<{ id: string; category: string | null }>,
  fulfillment: AdvanceFulfillment,
): AdvanceOrder {
  const named = [
    ...form.product_ids
      .map((id) => products.find((p) => p.id === id))
      .filter((p) => p !== undefined),
    ...form.category_slugs.map((slug) => ({ id: null, category: slug })),
  ];
  const lines =
    named.length > 0
      ? named.map((p) => ({
          amount: 100 / named.length,
          madeToOrder: form.made_to_order !== "not",
          productId: p?.id ?? null,
          category: p?.category ?? null,
        }))
      : [
          { amount: 60, madeToOrder: true },
          { amount: 40, madeToOrder: false },
        ];
  return {
    total: fulfillment === "delivery" ? 105 : 100,
    shipping: fulfillment === "delivery" ? 5 : 0,
    fulfillment,
    lines,
    // Abroad rules are tried on a delivery to one of their countries (or Saudi Arabia).
    country:
      fulfillment === "delivery" && form.destination === "abroad"
        ? (form.countries[0] ?? "SA")
        : null,
  };
}

/** One rule's form: which lines it reaches, what it asks, and what that comes to on a sample order. */
export function AdvanceRuleEditor({
  brandId,
  initial,
  isAr,
  currency,
  saving,
  onSave,
  onCancel,
}: {
  brandId: string;
  initial: AdvanceRuleForm;
  isAr: boolean;
  currency: string;
  saving: boolean;
  onSave: (form: AdvanceRuleForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const patch = (next: Partial<AdvanceRuleForm>) => setForm((current) => ({ ...current, ...next }));
  const products = useQuery(catalogQueries.products(brandId)).data ?? [];
  // A category with no slug can't be named by a rule.
  const categories = (useQuery(categoriesQueries.active(brandId)).data ?? []).filter(
    (category): category is typeof category & { slug: string } => Boolean(category.slug),
  );
  const problem = form.value ? ruleFormError(form, isAr) : null;
  const invalid = ruleFormError(form, isAr) !== null;
  const money = (n: number) => formatMoney(n, currency);

  const nameOf = (p: (typeof products)[number]) =>
    (isAr ? p.name_ar || p.name : p.name_en || p.name) ?? "";
  const previews = invalid
    ? []
    : (["delivery", "pickup"] as const).map((fulfillment) => {
        const parts = advanceParts(sampleOrder(form, products, fulfillment), [
          ruleDefFromForm(form),
        ]);
        return { fulfillment, amount: parts.reduce((sum, part) => sum + part.amount, 0) };
      });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onSave(form);
      }}
    >
      {initial === EMPTY_RULE_FORM && (
        <div className="flex flex-wrap gap-2" aria-label={isAr ? "بدايات سريعة" : "Quick starts"}>
          {RULE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => patch(preset.form)}
            >
              {isAr ? preset.label.ar : preset.label.en}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="advance-rule-name-en">
            {isAr ? "الاسم بالإنجليزية" : "Name (English)"}
          </Label>
          <Input
            id="advance-rule-name-en"
            value={form.name_en}
            maxLength={80}
            onChange={(event) => patch({ name_en: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="advance-rule-name-ar">{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
          <Input
            id="advance-rule-name-ar"
            dir="rtl"
            value={form.name_ar}
            maxLength={80}
            onChange={(event) => patch({ name_ar: event.target.value })}
          />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">
          {isAr
            ? "على أي سطور تنطبق (اترك الفارغ لكل شيء)"
            : "Which lines it reaches (empty means any)"}
        </legend>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">
            {isAr ? "طريقة الاستلام" : "How the order is fulfilled"}
          </p>
          <div className="flex flex-wrap gap-2">
            {ADVANCE_FULFILLMENTS.map((f) => (
              <Button
                key={f}
                type="button"
                size="xs"
                variant="chip"
                aria-pressed={form.fulfillment.includes(f)}
                className={cn(
                  "border border-border",
                  form.fulfillment.includes(f) && "border-primary bg-primary/10 text-foreground",
                )}
                onClick={() => patch({ fulfillment: toggle(form.fulfillment, f) })}
              >
                {fulfillmentWord(f, isAr)}
              </Button>
            ))}
          </div>
        </div>

        <div
          className="space-y-1.5"
          role="radiogroup"
          aria-label={isAr ? "نوع المنتج" : "Kind of item"}
        >
          <p className="text-xs font-medium">{isAr ? "نوع المنتج" : "Kind of item"}</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["any", isAr ? "الكل" : "Any"],
                ["only", isAr ? "حسب الطلب فقط" : "Made to order only"],
                ["not", isAr ? "الجاهز فقط" : "Ready-made only"],
              ] as Array<[MadeToOrderChoice, string]>
            ).map(([choice, label]) => (
              <Button
                key={choice}
                type="button"
                size="xs"
                variant="chip"
                role="radio"
                aria-checked={form.made_to_order === choice}
                className={cn(
                  "border border-border",
                  form.made_to_order === choice && "border-primary bg-primary/10 text-foreground",
                )}
                onClick={() => patch({ made_to_order: choice })}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">
            {isAr ? "قيمة الطلب (اختياري)" : "Order value (optional)"}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                ["min_total", isAr ? "من" : "From", "advance-rule-min-total"],
                ["max_total", isAr ? "إلى" : "Up to", "advance-rule-max-total"],
              ] as const
            ).map(([key, label, id]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  dir="ltr"
                  className="w-28"
                  value={form[key]}
                  onChange={(event) => patch({ [key]: event.target.value })}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "مجموع الطلب بعد الخصم ومع الضريبة ورسوم التوصيل."
              : "The order's total after discounts, with tax and the delivery fee."}
          </p>
        </div>

        <div className="space-y-1.5" role="radiogroup" aria-label={isAr ? "العميل" : "Customer"}>
          <p className="text-xs font-medium">{isAr ? "العميل" : "Customer"}</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["any", isAr ? "الكل" : "Any"],
                ["new", isAr ? "عميل جديد" : "New customers"],
                ["returning", isAr ? "عميل سابق" : "Returning customers"],
              ] as Array<[AdvanceRuleForm["customer"], string]>
            ).map(([choice, label]) => (
              <Button
                key={choice}
                type="button"
                size="xs"
                variant="chip"
                role="radio"
                aria-checked={form.customer === choice}
                className={cn(
                  "border border-border",
                  form.customer === choice && "border-primary bg-primary/10 text-foreground",
                )}
                onClick={() => patch({ customer: choice })}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "العميل السابق من لديه طلب مؤكد سابق في المتجر."
              : "A returning customer already has a confirmed order with the store."}
          </p>
        </div>

        <AdvanceDestinationField form={form} isAr={isAr} onChange={patch} />

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">
              {isAr ? "منتجات محددة" : "Chosen products"}
            </legend>
            <div className="grid max-h-36 gap-1.5 overflow-auto">
              {products.map((product) => (
                <Label key={product.id} className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={form.product_ids.includes(product.id)}
                    onCheckedChange={() =>
                      patch({ product_ids: toggle(form.product_ids, product.id) })
                    }
                  />
                  <span className="min-w-0 truncate">{nameOf(product)}</span>
                </Label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">
              {isAr ? "فئات محددة" : "Chosen categories"}
            </legend>
            <div className="grid max-h-36 gap-1.5 overflow-auto">
              {categories.map((category) => (
                <Label key={category.id} className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={form.category_slugs.includes(category.slug)}
                    onCheckedChange={() =>
                      patch({ category_slugs: toggle(form.category_slugs, category.slug) })
                    }
                  />
                  <span className="min-w-0 truncate">
                    {(isAr
                      ? category.name_ar || category.name_en
                      : category.name_en || category.name_ar) ?? category.slug}
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">
          {isAr ? "ماذا تطلب" : "What it asks"}
        </legend>
        <div className="flex flex-wrap items-end gap-3">
          <div
            role="group"
            aria-label={isAr ? "نوع الدفعة" : "Kind of advance"}
            className="flex gap-2"
          >
            {(["percent", "fixed"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant="chip"
                aria-pressed={form.kind === kind}
                className={cn(
                  "border border-border",
                  form.kind === kind && "border-primary bg-primary/10 text-foreground",
                )}
                onClick={() => patch({ kind })}
              >
                {kind === "percent"
                  ? isAr
                    ? "نسبة %"
                    : "Percent %"
                  : isAr
                    ? "مبلغ ثابت"
                    : "Fixed amount"}
              </Button>
            ))}
          </div>
          {(
            [
              ["value", isAr ? "القيمة" : "Value", "advance-rule-value"],
              ["min", isAr ? "حد أدنى (اختياري)" : "Least (optional)", "advance-rule-min"],
              ["max", isAr ? "حد أعلى (اختياري)" : "Most (optional)", "advance-rule-max"],
            ] as const
          ).map(([key, label, id]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={id}>{label}</Label>
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                dir="ltr"
                className="w-28"
                value={form[key]}
                onChange={(event) => patch({ [key]: event.target.value })}
              />
            </div>
          ))}
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={form.include_fee}
            onCheckedChange={(checked) => patch({ include_fee: checked === true })}
          />
          {isAr ? "تشمل رسوم التوصيل" : "Includes the delivery fee"}
        </Label>
      </fieldset>

      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={form.is_active}
          onCheckedChange={(checked) => patch({ is_active: checked === true })}
        />
        {isAr ? "القاعدة مفعّلة" : "The rule is on"}
      </Label>

      {previews.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
          <p className="font-semibold">
            {isAr
              ? "مثال: طلب بقيمة 100 (مع رسوم توصيل 5 للتوصيل)"
              : "Example: an order of 100 (a delivery fee of 5 when delivered)"}
          </p>
          {previews.map(({ fulfillment, amount }) => (
            <p key={fulfillment}>
              {fulfillmentWord(fulfillment, isAr)}:{" "}
              {amount > 0
                ? isAr
                  ? `تطلب هذه القاعدة ${money(amount)}`
                  : `this rule asks ${money(amount)}`
                : isAr
                  ? "لا تنطبق"
                  : "does not apply"}
            </p>
          ))}
        </div>
      )}
      {problem && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || invalid}>
          {isAr ? "حفظ القاعدة" : "Save rule"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {isAr ? "رجوع" : "Back"}
        </Button>
      </div>
    </form>
  );
}
