import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deleteFaqItem,
  invalidateStoreContent,
  reorderStoreContent,
  saveFaqItem,
  storeContentQueries,
} from "@/lib/data/store-content";
import {
  EMPTY_FAQ_FORM,
  bySortOrder,
  faqColumns,
  faqFormError,
  faqFormFrom,
  faqText,
  moveItem,
  nextSortOrder,
  type FaqForm,
} from "@/lib/store-content";

function TextField({
  id,
  label,
  value,
  rtl,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rtl?: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          dir={rtl ? "rtl" : undefined}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          dir={rtl ? "rtl" : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/** The store's questions: grouped, written in both languages, ordered, hidden. */
export function FaqEditor({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const qc = useQueryClient();
  const items = [...(useQuery(storeContentQueries.faq(brandId)).data ?? [])].sort(bySortOrder);
  const [editing, setEditing] = useState<{ id: string | null; form: FaqForm } | null>(null);

  const onError = (error: Error) => toast.error(error.message);
  const refresh = () => invalidateStoreContent(qc, brandId);
  const save = useMutation({
    mutationFn: ({ id, form }: { id: string | null; form: FaqForm }) =>
      saveFaqItem(brandId, id, faqColumns(form), nextSortOrder(items)),
    onSuccess: async () => {
      await refresh();
      toast.success(isAr ? "تم الحفظ" : "Saved");
      setEditing(null);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFaqItem(brandId, id),
    onSuccess: refresh,
    onError,
  });
  const move = useMutation({
    mutationFn: (order: Array<{ id: string; sort_order: number }>) =>
      reorderStoreContent(brandId, "store_faq_items", order),
    onSuccess: refresh,
    onError,
  });

  if (editing) {
    const { form } = editing;
    const patch = (next: Partial<FaqForm>) =>
      setEditing({ ...editing, form: { ...form, ...next } });
    const problem = faqFormError(form, isAr);
    const groups = [...new Set(items.map((item) => faqText(item, "group", isAr)).filter(Boolean))];
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) save.mutate(editing);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="faq-group-en"
            label={isAr ? "المجموعة بالإنجليزية" : "Group (English)"}
            value={form.group_en}
            onChange={(group_en) => patch({ group_en })}
          />
          <TextField
            id="faq-group-ar"
            label={isAr ? "المجموعة بالعربية" : "Group (Arabic)"}
            value={form.group_ar}
            rtl
            onChange={(group_ar) => patch({ group_ar })}
          />
        </div>
        {groups.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {isAr ? "المجموعات الحالية: " : "Current groups: "}
            {groups.join(isAr ? "، " : ", ")}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="faq-question-en"
            label={isAr ? "السؤال بالإنجليزية" : "Question (English)"}
            value={form.question_en}
            onChange={(question_en) => patch({ question_en })}
          />
          <TextField
            id="faq-question-ar"
            label={isAr ? "السؤال بالعربية" : "Question (Arabic)"}
            value={form.question_ar}
            rtl
            onChange={(question_ar) => patch({ question_ar })}
          />
          <TextField
            id="faq-answer-en"
            label={isAr ? "الإجابة بالإنجليزية" : "Answer (English)"}
            value={form.answer_en}
            multiline
            onChange={(answer_en) => patch({ answer_en })}
          />
          <TextField
            id="faq-answer-ar"
            label={isAr ? "الإجابة بالعربية" : "Answer (Arabic)"}
            value={form.answer_ar}
            rtl
            multiline
            onChange={(answer_ar) => patch({ answer_ar })}
          />
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={form.is_active}
            onCheckedChange={(checked) => patch({ is_active: checked === true })}
          />
          {isAr ? "ظاهر في المتجر" : "Shown on the store"}
        </Label>
        {form.question_en.trim() && form.question_ar.trim() ? null : (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "إذا تركت لغة فارغة يظهر النص المكتوب بالأخرى."
              : "A language left empty shows the other one's text."}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || Boolean(problem)}>
            {isAr ? "حفظ" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            {isAr ? "رجوع" : "Back"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد أسئلة بعد." : "No questions yet."}
        </p>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3",
              !item.is_active && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {faqText(item, "question", isAr)}
              </p>
              {faqText(item, "group", isAr) && (
                <p className="text-xs text-muted-foreground">{faqText(item, "group", isAr)}</p>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={isAr ? "تحريك للأعلى" : "Move up"}
                disabled={move.isPending}
                onClick={() => {
                  const order = moveItem(items, item.id, -1);
                  if (order) move.mutate(order);
                }}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={isAr ? "تحريك للأسفل" : "Move down"}
                disabled={move.isPending}
                onClick={() => {
                  const order = moveItem(items, item.id, 1);
                  if (order) move.mutate(order);
                }}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={isAr ? "تعديل" : "Edit"}
                onClick={() => setEditing({ id: item.id, form: faqFormFrom(item) })}
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
                onClick={() => remove.mutate(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        className="gap-1.5"
        onClick={() => setEditing({ id: null, form: EMPTY_FAQ_FORM })}
      >
        <Plus className="size-4" />
        {isAr ? "إضافة سؤال" : "Add a question"}
      </Button>
    </div>
  );
}
