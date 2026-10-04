import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { invalidateAdvanceRules, saveAdvanceRule } from "@/lib/data/advance-rules";
import {
  describeRule,
  ruleColumns,
  ruleDefFromForm,
  ruleFormError,
} from "@/lib/payments/advance-rule-form";
import { templateForms, templatesFor } from "./advance-templates";

/**
 * Quick starts for the kind of store: each adds a few ordinary rules the merchant can then
 * edit, switch off or reorder like any other. Nothing is added until a template is chosen.
 */
export function AdvanceTemplates({
  brandId,
  vertical,
  currency,
  isAr,
  firstOrder,
  ready,
}: {
  brandId: string;
  vertical: string | null | undefined;
  currency: string;
  isAr: boolean;
  /** The sort order the first new rule takes (the end of the list). */
  firstOrder: number;
  /** The store's rules are loaded, so `firstOrder` is the real end of the list. */
  ready: boolean;
}) {
  const qc = useQueryClient();
  const templates = templatesFor(vertical);
  const add = useMutation({
    mutationFn: async (id: string) => {
      const template = templates.find((t) => t.id === id);
      if (!template) return;
      const forms = templateForms(template, currency);
      // Rules are written in order so they are tried in the order the template lists them.
      for (const [index, form] of forms.entries()) {
        await saveAdvanceRule(brandId, null, ruleColumns(form), firstOrder + index);
      }
    },
    onSuccess: async () => {
      await invalidateAdvanceRules(qc, brandId);
      toast.success(isAr ? "أُضيفت القواعد، يمكنك تعديلها" : "Rules added; you can edit them");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (templates.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Sparkles className="size-3.5 text-primary" />
        {isAr ? "اقتراحات تناسب متجرك" : "Suggested for your store"}
      </p>
      <ul className="space-y-2">
        {templates.map((template) => {
          const forms = templateForms(template, currency);
          const valid = forms.every((form) => ruleFormError(form, isAr) === null);
          return (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-2.5"
            >
              <div className="min-w-0 max-w-md">
                <p className="text-sm font-medium text-foreground">
                  {isAr ? template.title.ar : template.title.en}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr ? template.summary.ar : template.summary.en}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {forms
                    .map((form) =>
                      describeRule(ruleDefFromForm(form), {
                        isAr,
                        money: (n) => formatMoney(n, currency),
                        productName: () => "",
                        categoryName: (slug) => slug,
                      }),
                    )
                    .join(" ، ")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!ready || !valid || add.isPending}
                onClick={() => add.mutate(template.id)}
              >
                {isAr ? "إضافة" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
