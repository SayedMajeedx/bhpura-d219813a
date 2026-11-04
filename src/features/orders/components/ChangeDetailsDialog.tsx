import { useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PHONE_SHEET,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ordersKeys } from "@/lib/data/orders";
import { amendOrderLineDetails, type AmendResult } from "@/lib/data/orders/line-revisions";
import { supplierOrderKeys } from "@/lib/data/supplier-orders";
import { measurementChanges } from "../lib/alterations";
import {
  amendValues,
  editableFields,
  isNoteField,
  lineRevisionError,
  revisionChangeLine,
  type ProductField,
} from "../lib/line-revisions";

type Lang = "ar" | "en";

export type ChangeLine = {
  id: string;
  title: string;
  custom_field_values?: unknown;
};

/** A product's own fields a line may be given (not an upload: it is no text to correct). */
export function productFieldsOf(product: { custom_fields?: unknown } | null | undefined) {
  return (Array.isArray(product?.custom_fields) ? product.custom_fields : []).flatMap(
    (raw): ProductField[] => {
      const f = (raw ?? {}) as Record<string, unknown>;
      if (typeof f.key !== "string" || !f.key || f.type === "file") return [];
      return [
        {
          key: f.key,
          label_ar: typeof f.label_ar === "string" ? f.label_ar : null,
          label_en: typeof f.label_en === "string" ? f.label_en : null,
        },
      ];
    },
  );
}

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;

/**
 * "Change measurements" (step 4 of `docs/workshop-flow-plan.md`): a made-to-order piece's
 * answers prefilled, only what was changed sent, with a note. The database keeps the change as
 * the piece's next revision; a supplier holding the earlier sheet is then shown on the card.
 */
export function ChangeDetailsDialog({
  open,
  onOpenChange,
  ...form
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  line: ChangeLine;
  productFields?: readonly ProductField[];
  lang: Lang;
  onSaved?: (result: AmendResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`flex max-h-[90dvh] flex-col sm:max-w-lg ${PHONE_SHEET}`}>
        {/* Mounted while open: each opening starts from the line as it is now. */}
        <ChangeForm {...form} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ChangeForm({
  brandId,
  line,
  productFields = [],
  lang,
  onSaved,
  close,
}: {
  brandId: string;
  line: ChangeLine;
  productFields?: readonly ProductField[];
  lang: Lang;
  onSaved?: (result: AmendResult) => void;
  close: () => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const baseId = useId();
  const fields = useMemo(
    () => editableFields(line.custom_field_values, productFields),
    [line.custom_field_values, productFields],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value ?? ""])),
  );
  const [note, setNote] = useState("");
  const [requestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);

  const changes = measurementChanges(fields, values);
  const sent = amendValues(fields, values);
  const labelOf = (f: (typeof fields)[number]) =>
    (isAr ? f.label_ar || f.label_en : f.label_en || f.label_ar) || f.key;

  const save = async () => {
    if (!sent.length || saving) return;
    setSaving(true);
    try {
      const result = await amendOrderLineDetails({
        itemId: line.id,
        values: sent,
        note: note.trim() || null,
        requestId,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) }),
        qc.invalidateQueries({ queryKey: supplierOrderKeys.all(brandId) }),
      ]);
      toast.success(
        result.supplierBehind
          ? isAr
            ? `حُفظ التغيير (النسخة ${result.revision}). لدى المورّد الورقة السابقة: أرسل له التعديل.`
            : `Change saved (revision ${result.revision}). The supplier has the earlier sheet: send them the change.`
          : isAr
            ? `حُفظ التغيير (النسخة ${result.revision}).`
            : `Change saved (revision ${result.revision}).`,
      );
      onSaved?.(result);
      close();
    } catch (error) {
      toast.error(lineRevisionError(error, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" aria-hidden="true" />
          {isAr ? "تغيير المقاسات والتفاصيل" : "Change measurements"}
        </DialogTitle>
        <DialogDescription dir="auto">{line.title}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((field, index) => {
            const id = `${baseId}-f${index}`;
            const value = values[field.key] ?? "";
            const set = (next: string) => setValues((prev) => ({ ...prev, [field.key]: next }));
            return isNoteField(field.key) ? (
              <div key={field.key} className="space-y-1 sm:col-span-2">
                <Label htmlFor={id}>{labelOf(field)}</Label>
                <Textarea
                  id={id}
                  dir="auto"
                  rows={3}
                  maxLength={2000}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              </div>
            ) : (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={id}>{labelOf(field)}</Label>
                <Input
                  id={id}
                  dir="auto"
                  maxLength={300}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${baseId}-note`}>
            {isAr ? "سبب التغيير (اختياري)" : "Why it changed (optional)"}
          </Label>
          <Input
            id={`${baseId}-note`}
            dir="auto"
            maxLength={500}
            value={note}
            placeholder={isAr ? "مثلاً: اتصلت العميلة" : "e.g. the customer called"}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {changes.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="mb-1 font-bold">{isAr ? "ما سيتغيّر" : "What changes"}</p>
            <ul className="space-y-0.5">
              {changes.map((change) => (
                <li key={change.key} dir="auto" className="break-words">
                  {isNoteField(change.key ?? "")
                    ? `${revisionChangeLine({ ...change, from: "", to: "" }, lang)}: ${isAr ? "تغيّرت" : "changed"}`
                    : revisionChangeLine(change, lang)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DialogFooter className="flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={close}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        <Button type="button" onClick={save} disabled={!sent.length || saving}>
          {saving ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "احفظ التغيير" : "Save the change"}
        </Button>
      </DialogFooter>
    </>
  );
}
