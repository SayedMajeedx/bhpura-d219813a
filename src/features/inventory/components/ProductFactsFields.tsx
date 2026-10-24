import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { factSet, splitList, type FactField, type ProductFacts } from "@/lib/product-facts";

/**
 * A product's facts in the product editor: the set its store's kind records (`factSet`), each
 * field in the merchant's language. What is filled in shows on the product page and in Google's
 * data; what is left empty is not said anywhere.
 */
export function ProductFactsFields({
  vertical,
  value,
  onChange,
  isAr,
}: {
  vertical: string | null | undefined;
  value: ProductFacts;
  onChange: (next: ProductFacts) => void;
  isAr: boolean;
}) {
  const { fields } = factSet(vertical);
  if (fields.length === 0) return null;

  const set = (key: string, next: string | string[] | number | null) => {
    const copy = { ...value };
    if (next === null || next === "" || (Array.isArray(next) && next.length === 0))
      delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };

  return (
    <section className="space-y-3 rounded-xl border border-border-subtle p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">
          {isAr ? "تفاصيل المنتج" : "Product details"}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isAr
            ? "ما تكتبه هنا يظهر في صفحة المنتج وفي بيانات Google؛ ما تتركه فارغاً لا يظهر."
            : "What you fill in shows on the product page and in Google's data; what you leave empty does not."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <FactInput
            key={field.key}
            field={field}
            value={value[field.key]}
            onChange={(next) => set(field.key, next)}
            isAr={isAr}
          />
        ))}
      </div>
    </section>
  );
}

function FactInput({
  field,
  value,
  onChange,
  isAr,
}: {
  field: FactField;
  value: string | string[] | number | undefined;
  onChange: (next: string | string[] | number | null) => void;
  isAr: boolean;
}) {
  const id = useId();
  const lang = isAr ? "ar" : "en";
  const label = field.label[lang];
  const placeholder = field.placeholder?.[lang];
  const wide = field.kind === "list" || field.kind === "choices" || field.key === "ingredients";

  return (
    <div className={cn("space-y-1", wide && "sm:col-span-2")}>
      {field.kind === "choices" ? (
        <p id={id} className="text-xs font-bold text-muted-foreground">
          {label}
        </p>
      ) : (
        <Label htmlFor={id} className="text-xs font-bold text-muted-foreground">
          {label}
          {field.unit ? ` (${field.unit[lang]})` : ""}
        </Label>
      )}

      {field.kind === "text" && (
        <Input
          id={id}
          dir="auto"
          className="h-9.5 rounded-lg text-xs"
          placeholder={placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.kind === "number" && (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          className="h-9.5 rounded-lg text-xs tabular-nums"
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, n));
          }}
        />
      )}

      {field.kind === "choice" && (
        <select
          id={id}
          className="h-9.5 w-full max-w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {field.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice[lang]}
            </option>
          ))}
        </select>
      )}

      {field.kind === "choices" && (
        <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
          {field.choices?.map((choice) => {
            const picked = Array.isArray(value) && value.includes(choice.value);
            return (
              <Button
                key={choice.value}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={picked}
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    picked
                      ? current.filter((item) => item !== choice.value)
                      : [...current, choice.value],
                  );
                }}
                className={cn(
                  "h-8 rounded-full px-3 text-xs",
                  picked && "border-primary bg-primary/10 text-foreground",
                )}
              >
                {choice[lang]}
              </Button>
            );
          })}
        </div>
      )}

      {field.kind === "list" && (
        <ListInput
          id={id}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          placeholder={
            isAr ? "افصل بفاصلة: ورد، عود، مسك" : "Separate with commas: rose, oud, musk"
          }
        />
      )}
    </div>
  );
}

/** A list typed as one line; what is typed stays as typed while the items are kept. */
function ListInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const joined = value.join(", ");
  const [draft, setDraft] = useState(joined);
  // The draft while it still says the stored list (a trailing comma, a space); the stored list
  // once it changed from outside (another product opened).
  const shown = splitList(draft).join(", ") === joined ? draft : joined;
  return (
    <Input
      id={id}
      dir="auto"
      className="h-9.5 rounded-lg text-xs"
      placeholder={placeholder}
      value={shown}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(splitList(e.target.value));
      }}
    />
  );
}
