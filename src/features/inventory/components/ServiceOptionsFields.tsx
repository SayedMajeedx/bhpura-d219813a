import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Puzzle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EMPTY_OPTION_FORM,
  OPTION_MODES,
  describeOption,
  optionColumns,
  optionFormError,
  type OptionForm,
  type OptionMode,
  type ServiceOption,
} from "@/lib/bookings/service-options";

const MODE_TEXT: Record<OptionMode, { ar: string; en: string; hint: { ar: string; en: string } }> =
  {
    included: {
      ar: "مشمولة",
      en: "Included",
      hint: {
        ar: "مجانية مع كل حجز وتظهر للعميل",
        en: "Free with every booking and shown to the customer",
      },
    },
    required: {
      ar: "إلزامية",
      en: "Required",
      hint: {
        ar: "تُضاف دائماً بسعرها ولا يستطيع العميل إزالتها",
        en: "Always added at its price; the customer can't remove it",
      },
    },
    default_on: {
      ar: "مضافة تلقائياً",
      en: "On by default",
      hint: {
        ar: "مضافة، ويستطيع العميل إزالتها فيُخصم سعرها",
        en: "Added; the customer can take it off to save its price",
      },
    },
    optional: {
      ar: "اختيارية",
      en: "Optional",
      hint: { ar: "يضيفها العميل إن أرادها", en: "The customer adds it if they want it" },
    },
  };

/** Starting points a merchant can pick, then change. */
const STARTERS: Array<{
  id: string;
  label: { ar: string; en: string };
  form: Partial<OptionForm>;
}> = [
  {
    id: "attendant",
    label: { ar: "موظفة مرافقة (إلزامية)", en: "Attendant (required)" },
    form: { name_en: "Attendant", name_ar: "موظفة مرافقة", mode: "required", price: "15" },
  },
  {
    id: "prints",
    label: { ar: "طباعة فورية (مضافة تلقائياً)", en: "Instant prints (on by default)" },
    form: { name_en: "Instant prints", name_ar: "طباعة فورية", mode: "default_on", price: "30" },
  },
  {
    id: "extra",
    label: { ar: "إضافة اختيارية", en: "An optional extra" },
    form: { name_en: "", name_ar: "", mode: "optional", price: "25" },
  },
  {
    id: "blocks",
    label: { ar: "بالدفعات (مثل الأظرف)", en: "In blocks (like envelopes)" },
    form: {
      name_en: "Envelopes",
      name_ar: "أظرف أنيقة",
      mode: "optional",
      tiered: true,
      step: "50",
      prices: "15, 12.5, 10",
    },
  },
];

function OptionEditor({
  initial,
  isAr,
  onSave,
  onCancel,
}: {
  initial: OptionForm;
  isAr: boolean;
  onSave: (form: OptionForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const patch = (next: Partial<OptionForm>) => setForm((current) => ({ ...current, ...next }));
  const problem = optionFormError(form, isAr);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="option-name-en" className="text-xs">
            {isAr ? "الاسم بالإنجليزية" : "Name (English)"}
          </Label>
          <Input
            id="option-name-en"
            value={form.name_en}
            onChange={(event) => patch({ name_en: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="option-name-ar" className="text-xs">
            {isAr ? "الاسم بالعربية" : "Name (Arabic)"}
          </Label>
          <Input
            id="option-name-ar"
            dir="rtl"
            value={form.name_ar}
            onChange={(event) => patch({ name_ar: event.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea
          rows={2}
          aria-label={isAr ? "وصف بالإنجليزية" : "Description (English)"}
          placeholder={isAr ? "وصف بالإنجليزية (اختياري)" : "Description in English (optional)"}
          value={form.description_en}
          onChange={(event) => patch({ description_en: event.target.value })}
        />
        <Textarea
          rows={2}
          dir="rtl"
          aria-label={isAr ? "وصف بالعربية" : "Description (Arabic)"}
          placeholder={isAr ? "وصف بالعربية (اختياري)" : "Description in Arabic (optional)"}
          value={form.description_ar}
          onChange={(event) => patch({ description_ar: event.target.value })}
        />
      </div>

      <div
        role="group"
        aria-label={isAr ? "نوع الإضافة" : "Kind of add-on"}
        className="grid gap-1.5 sm:grid-cols-2"
      >
        {OPTION_MODES.map((mode) => (
          <Button
            key={mode}
            type="button"
            variant="chip"
            aria-pressed={form.mode === mode}
            onClick={() => patch({ mode })}
            className={cn(
              "h-auto min-w-0 flex-col items-start gap-0.5 whitespace-normal rounded-lg border border-border px-3 py-2 text-start",
              form.mode === mode && "border-primary bg-primary/10 text-foreground",
            )}
          >
            <span className="text-sm font-semibold">
              {isAr ? MODE_TEXT[mode].ar : MODE_TEXT[mode].en}
            </span>
            <span className="w-full break-words text-xs font-normal text-muted-foreground">
              {isAr ? MODE_TEXT[mode].hint.ar : MODE_TEXT[mode].hint.en}
            </span>
          </Button>
        ))}
      </div>

      {form.mode !== "included" && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-xs font-normal">
            <Checkbox
              checked={form.tiered}
              onCheckedChange={(checked) => patch({ tiered: checked === true })}
            />
            {isAr
              ? "السعر بالدفعات (كل دفعة بسعر، والأخيرة تتكرر)"
              : "Price in blocks (each block has a price; the last repeats)"}
          </Label>
          {form.tiered ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="option-step" className="text-xs">
                  {isAr ? "حجم الدفعة" : "Block size"}
                </Label>
                <Input
                  id="option-step"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  dir="ltr"
                  className="w-24"
                  value={form.step}
                  onChange={(event) => patch({ step: event.target.value })}
                />
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="option-prices" className="text-xs">
                  {isAr ? "سعر كل دفعة (بفاصلة)" : "Each block's price (commas)"}
                </Label>
                <Input
                  id="option-prices"
                  dir="ltr"
                  placeholder="15, 12.5, 10"
                  value={form.prices}
                  onChange={(event) => patch({ prices: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="option-max" className="text-xs">
                  {isAr ? "الحد الأقصى للكمية" : "Most units"}
                </Label>
                <Input
                  id="option-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  dir="ltr"
                  className="w-28"
                  value={form.max_quantity}
                  onChange={(event) => patch({ max_quantity: event.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="option-price" className="text-xs">
                {isAr ? "السعر" : "Price"}
              </Label>
              <Input
                id="option-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                dir="ltr"
                className="w-32"
                value={form.price}
                onChange={(event) => patch({ price: event.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {problem && form.name_en + form.name_ar + form.price + form.prices !== "" && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={Boolean(problem)} onClick={() => onSave(form)}>
          {isAr ? "حفظ الإضافة" : "Save add-on"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {isAr ? "رجوع" : "Back"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A service's add-ons and its price for extra hours, in its editor: what comes
 * with it, what is on by default, what the customer can add, and blocks that
 * get cheaper. The booking page shows them as the customer chooses.
 */
export function ServiceOptionsFields({
  options,
  onOptions,
  extraHour,
  onExtraHour,
  isAr,
}: {
  options: OptionForm[];
  onOptions: (options: OptionForm[]) => void;
  extraHour: string;
  onExtraHour: (value: string) => void;
  isAr: boolean;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [starter, setStarter] = useState<Partial<OptionForm>>({});
  const move = (index: number, by: number) => {
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onOptions(next);
  };
  const asOption = (form: OptionForm, index: number): ServiceOption => ({
    ...optionColumns(form),
    id: form.id ?? `new-${index}`,
    product_id: "",
    sort_order: index,
  });

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Puzzle className="size-3.5" aria-hidden="true" />
          {isAr ? "الإضافات والساعات الإضافية" : "Add-ons and extra hours"}
        </Label>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "ما يأتي مع الخدمة (موظفة، طباعة...)، وما يضيفه العميل. تظهر في صفحة الحجز مع السعر النهائي."
            : "What comes with the service (an attendant, prints...) and what the customer can add. They show on the booking page with the final price."}
        </p>
      </div>

      <ul className="space-y-2">
        {options.map((form, index) =>
          editing === index ? (
            <li key={form.id ?? index}>
              <OptionEditor
                initial={form}
                isAr={isAr}
                onSave={(saved) => {
                  onOptions(options.map((current, i) => (i === index ? saved : current)));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={form.id ?? index}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2",
                !form.is_active && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {(isAr ? form.name_ar || form.name_en : form.name_en || form.name_ar) ||
                    (isAr ? "إضافة" : "Add-on")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {describeOption(asOption(form, index), isAr)}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "تحريك لأعلى" : "Move up"}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "تحريك لأسفل" : "Move down"}
                  disabled={index === options.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "تعديل" : "Edit"}
                  onClick={() => setEditing(index)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  aria-label={isAr ? "حذف الإضافة" : "Remove the add-on"}
                  onClick={() => onOptions(options.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? (
        <OptionEditor
          initial={{ ...EMPTY_OPTION_FORM, ...starter }}
          isAr={isAr}
          onSave={(saved) => {
            onOptions([...options, saved]);
            setEditing(null);
            setStarter({});
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{isAr ? "أضف إضافة:" : "Add one:"}</p>
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="xs"
                variant="chip"
                className="gap-1 border border-border"
                onClick={() => {
                  setStarter(item.form);
                  setEditing("new");
                }}
              >
                <Plus className="size-3" aria-hidden="true" />
                {isAr ? item.label.ar : item.label.en}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 border-t border-border pt-3">
        <Label htmlFor="extra-hour-price" className="text-xs font-semibold">
          {isAr ? "سعر الساعة الإضافية" : "Price of each extra hour"}
        </Label>
        <Input
          id="extra-hour-price"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          dir="ltr"
          className="w-32"
          placeholder={isAr ? "بدون" : "None"}
          value={extraHour}
          onChange={(event) => onExtraHour(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "يسمح بحجز أطول من أطول مدة لها سعر: سعر أطول مدة + هذا السعر لكل ساعة زائدة. اتركه فارغاً لمنع ذلك."
            : "Lets a booking run past the longest priced length: that length's price plus this for each extra hour. Leave empty to not allow it."}
        </p>
      </div>
    </section>
  );
}
