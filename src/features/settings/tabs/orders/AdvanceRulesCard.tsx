import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { catalogQueries } from "@/lib/data/catalog";
import { categoriesQueries } from "@/lib/data/categories";
import {
  advanceRulesQueries,
  deleteAdvanceRule,
  invalidateAdvanceRules,
  reorderAdvanceRules,
  saveAdvanceRule,
  setAdvanceRuleActive,
} from "@/lib/data/advance-rules";
import {
  EMPTY_RULE_FORM,
  describeRule,
  ruleColumns,
  ruleDefFromRow,
  ruleFormFrom,
  type AdvanceRuleForm,
} from "@/lib/payments/advance-rule-form";
import { AdvanceRuleEditor } from "@/features/settings/tabs/orders/AdvanceRuleEditor";
import { AdvanceTemplates } from "@/features/settings/tabs/orders/AdvanceTemplates";

/** The rule after which a new rule is placed (the end of the list). */
const nextOrder = (rules: ReadonlyArray<{ sort_order: number }>) =>
  rules.length === 0 ? 0 : Math.max(...rules.map((rule) => rule.sort_order)) + 1;

/**
 * The store's own advance-payment rules, tried in order before its general rule: a line is
 * taken by the first rule that reaches it, and a line no rule reaches falls to the general rule
 * above (its percentage and "applies to").
 */
export function AdvanceRulesCard() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, brandId } = useBrandSettingsFormContext();
  const currency = form.bs.currency || "BHD";
  const qc = useQueryClient();
  const rulesQuery = useQuery(advanceRulesQueries.list(brandId));
  const rules = rulesQuery.data ?? [];
  const products = useQuery(catalogQueries.products(brandId)).data ?? [];
  const categories = useQuery(categoriesQueries.active(brandId)).data ?? [];
  const [editing, setEditing] = useState<{ id: string | null; form: AdvanceRuleForm } | null>(null);

  const onError = (error: Error) => toast.error(error.message);
  const refresh = () => invalidateAdvanceRules(qc, brandId);
  const save = useMutation({
    mutationFn: ({ id, form: next }: { id: string | null; form: AdvanceRuleForm }) =>
      saveAdvanceRule(brandId, id, ruleColumns(next), nextOrder(rules)),
    onSuccess: async () => {
      await refresh();
      toast.success(isAr ? "تم حفظ القاعدة" : "Rule saved");
      setEditing(null);
    },
    onError,
  });
  const toggleActive = useMutation({
    mutationFn: (rule: { id: string; is_active: boolean }) =>
      setAdvanceRuleActive(brandId, rule.id, !rule.is_active),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAdvanceRule(brandId, id),
    onSuccess: refresh,
    onError,
  });
  const move = useMutation({
    mutationFn: (order: Array<{ id: string; sort_order: number }>) =>
      reorderAdvanceRules(brandId, order),
    onSuccess: refresh,
    onError,
  });

  /** Swaps a rule with its neighbour, renumbering the list from 0. */
  const moved = (id: string, direction: -1 | 1) => {
    const index = rules.findIndex((rule) => rule.id === id);
    const to = index + direction;
    if (index < 0 || to < 0 || to >= rules.length) return null;
    const list = [...rules];
    const [item] = list.splice(index, 1);
    list.splice(to, 0, item);
    return list.map((rule, position) => ({ id: rule.id, sort_order: position }));
  };

  const productName = (id: string) => {
    const product = products.find((p) => p.id === id);
    return product
      ? ((isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "")
      : "?";
  };
  const categoryName = (slug: string) => {
    const category = categories.find((c) => c.slug === slug);
    return category
      ? ((isAr ? category.name_ar || category.name_en : category.name_en || category.name_ar) ??
          slug)
      : slug;
  };

  return (
    <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          <span>{isAr ? "قواعد خاصة بالدفعة المقدمة" : "Your own advance rules"}</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "تُجرَّب بالترتيب قبل القاعدة العامة أعلاه: كل سطر في الطلب تأخذه أول قاعدة تنطبق عليه، وما لا تنطبق عليه قاعدة يذهب للقاعدة العامة."
            : "Tried in order before the general rule above: each line of an order is taken by the first rule that reaches it, and a line no rule reaches goes to the general rule."}
        </p>
      </div>

      {editing ? (
        <AdvanceRuleEditor
          brandId={brandId}
          initial={editing.form}
          isAr={isAr}
          currency={currency}
          saving={save.isPending}
          onSave={(next) => save.mutate({ id: editing.id, form: next })}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="space-y-3">
          {rules.length === 0 && (
            <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
              {isAr
                ? "لا توجد قواعد خاصة؛ تُطبَّق القاعدة العامة على كل شيء."
                : "No rules of your own; the general rule covers everything."}
            </p>
          )}
          <ol className="space-y-2">
            {rules.map((rule, index) => (
              <li
                key={rule.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3",
                  !rule.is_active && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {index + 1}.{" "}
                    {(isAr ? rule.name_ar || rule.name_en : rule.name_en || rule.name_ar) ||
                      (isAr ? "قاعدة بلا اسم" : "Unnamed rule")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {describeRule(ruleDefFromRow(rule), {
                      isAr,
                      money: (n) => formatMoney(n, currency),
                      productName,
                      categoryName,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Switch
                    aria-label={isAr ? "تفعيل القاعدة" : "Rule on"}
                    checked={rule.is_active}
                    disabled={toggleActive.isPending}
                    onCheckedChange={() => toggleActive.mutate(rule)}
                  />
                  {([-1, 1] as const).map((direction) => (
                    <Button
                      key={direction}
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={
                        direction === -1
                          ? isAr
                            ? "تحريك للأعلى"
                            : "Move up"
                          : isAr
                            ? "تحريك للأسفل"
                            : "Move down"
                      }
                      disabled={move.isPending}
                      onClick={() => {
                        const order = moved(rule.id, direction);
                        if (order) move.mutate(order);
                      }}
                    >
                      {direction === -1 ? (
                        <ArrowUp className="size-4" />
                      ) : (
                        <ArrowDown className="size-4" />
                      )}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={isAr ? "تعديل" : "Edit"}
                    onClick={() => setEditing({ id: rule.id, form: ruleFormFrom(rule) })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    aria-label={isAr ? "حذف" : "Delete"}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(rule.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <AdvanceTemplates
            brandId={brandId}
            vertical={form.bs.store_vertical}
            currency={currency}
            isAr={isAr}
            firstOrder={nextOrder(rules)}
            ready={rulesQuery.isSuccess}
          />
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => setEditing({ id: null, form: EMPTY_RULE_FORM })}
          >
            <Plus className="size-4" />
            {isAr ? "إضافة قاعدة" : "Add a rule"}
          </Button>
        </div>
      )}
    </div>
  );
}
