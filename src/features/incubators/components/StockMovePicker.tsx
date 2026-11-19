import { ArrowLeft, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import {
  chosenState,
  pickGroups,
  pickTotals,
  type PickRow,
} from "@/features/incubators/lib/stock-move";

/**
 * The one way the partner page picks pieces to move (send to a partner, move between partners,
 * bring back to the store): each product's sizes under it, a box for the product and one for
 * each size, how many with − and +, and the price and code at the place they go when the flow
 * needs them. A size with nothing to take cannot be chosen. A table's columns from `sm` up, the
 * price and code under the size on a phone.
 */
export type PickFields = { price?: boolean; code?: boolean };

type Change = {
  /** Choosing or leaving sizes (a product's box sends all of its sizes). */
  onChoose: (variantIds: readonly string[], chosen: boolean) => void;
  /** A size's number, price or code. */
  onEdit: (variantId: string, patch: Partial<PickRow>) => void;
};

export function StockMovePicker({
  rows,
  isAr,
  fields = {},
  priceLabel,
  onChoose,
  onEdit,
}: {
  rows: readonly PickRow[];
  isAr: boolean;
  fields?: PickFields;
  /** The price column's words, with the currency ("Price there (BHD)"). */
  priceLabel?: string;
} & Change) {
  const groups = pickGroups(rows);
  if (groups.length === 0) return null;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <PickGroup
          key={group.key}
          group={group}
          isAr={isAr}
          fields={fields}
          priceLabel={priceLabel}
          onChoose={onChoose}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

const columns = (fields: PickFields) =>
  fields.price && fields.code
    ? "sm:grid-cols-[auto_minmax(0,1fr)_auto_7rem_8rem]"
    : fields.price || fields.code
      ? "sm:grid-cols-[auto_minmax(0,1fr)_auto_8rem]"
      : "sm:grid-cols-[auto_minmax(0,1fr)_auto]";

function PickGroup({
  group,
  isAr,
  fields,
  priceLabel,
  onChoose,
  onEdit,
}: {
  group: ReturnType<typeof pickGroups<PickRow>>[number];
  isAr: boolean;
  fields: PickFields;
  priceLabel?: string;
} & Change) {
  const state = chosenState(group.rows);
  const takeable = group.rows.filter((row) => row.available > 0);
  const withFields = Boolean(fields.price || fields.code);
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex items-center gap-2.5 bg-muted/40 px-3 py-2.5">
        <Checkbox
          checked={state}
          disabled={takeable.length === 0}
          onCheckedChange={(checked) =>
            onChoose(
              takeable.map((row) => row.variantId),
              checked === true,
            )
          }
          aria-label={isAr ? `كل مقاسات ${group.product}` : `Every size of ${group.product}`}
        />
        <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-page-start" dir="auto">
          {group.product}
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {isAr ? `المتاح ${group.available}` : `${group.available} available`}
        </span>
      </header>
      <div
        aria-hidden
        className={cn(
          "hidden gap-x-3 border-t border-border-subtle px-3 py-1.5 text-xs text-muted-foreground sm:grid",
          columns(fields),
        )}
      >
        <span className="w-4" />
        <span>{isAr ? "المقاس" : "Size"}</span>
        <span className="w-36 text-center">{isAr ? "الكمية" : "Quantity"}</span>
        {fields.price && <span>{priceLabel ?? (isAr ? "السعر عندهم" : "Price there")}</span>}
        {fields.code && <span>{isAr ? "الكود عندهم" : "Code there"}</span>}
      </div>
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {group.rows.map((row) => (
          <PickRowItem
            key={row.variantId}
            row={row}
            product={group.product}
            isAr={isAr}
            fields={fields}
            withFields={withFields}
            priceLabel={priceLabel}
            onChoose={onChoose}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </section>
  );
}

function PickRowItem({
  row,
  product,
  isAr,
  fields,
  withFields,
  priceLabel,
  onChoose,
  onEdit,
}: {
  row: PickRow;
  product: string;
  isAr: boolean;
  fields: PickFields;
  withFields: boolean;
  priceLabel?: string;
} & Change) {
  const id = `pick-${row.variantId}`;
  const option = row.option ?? (isAr ? "بلا مقاس" : "No options");
  const name = `${product} · ${option}`;
  const none = row.available <= 0;
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5",
        columns(fields),
        !row.chosen && "bg-muted/20",
      )}
    >
      <Checkbox
        id={`${id}-chosen`}
        checked={row.chosen}
        disabled={none}
        onCheckedChange={(checked) => onChoose([row.variantId], checked === true)}
        aria-label={name}
      />
      <label htmlFor={`${id}-chosen`} className={cn("min-w-0", !row.chosen && "opacity-70")}>
        <span className="block break-words text-sm font-medium text-page-start" dir="auto">
          {option}
        </span>
        <span className="block text-xs text-muted-foreground">
          {none
            ? isAr
              ? "لا قطع"
              : "None left"
            : isAr
              ? `المتاح ${row.available}`
              : `${row.available} available`}
          {row.note ? ` · ${row.note}` : ""}
        </span>
      </label>
      <QuantityStepper
        className="w-36 justify-center"
        value={row.quantity}
        min={row.chosen ? 1 : 0}
        max={Math.max(0, row.available)}
        disabled={!row.chosen}
        onChange={(quantity) => onEdit(row.variantId, { quantity })}
        label={isAr ? `كمية ${name}` : `Quantity of ${name}`}
        lessLabel={isAr ? `قطعة أقل من ${name}` : `One less ${name}`}
        moreLabel={isAr ? `قطعة أكثر من ${name}` : `One more ${name}`}
      />
      {withFields && row.chosen && (
        // On a phone the price and the code sit under the size; from `sm` up, in their columns.
        <div className="col-span-3 grid grid-cols-2 gap-2 ps-7 sm:contents">
          {fields.price && (
            <div className="min-w-0">
              <Label htmlFor={`${id}-price`} className="text-xs text-muted-foreground sm:sr-only">
                {priceLabel ?? (isAr ? "السعر عندهم" : "Price there")}
              </Label>
              <Input
                id={`${id}-price`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                value={row.price ?? 0}
                onChange={(event) => onEdit(row.variantId, { price: Number(event.target.value) })}
                className="font-mono tabular-nums"
              />
            </div>
          )}
          {fields.code && (
            <div className="min-w-0">
              <Label htmlFor={`${id}-code`} className="text-xs text-muted-foreground sm:sr-only">
                {isAr ? "الكود عندهم" : "Code there"}
              </Label>
              <Input
                id={`${id}-code`}
                value={row.code ?? ""}
                maxLength={100}
                dir="auto"
                onChange={(event) => onEdit(row.variantId, { code: event.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Everything that will go, once more before it does: from where, to where, and each piece. */
export function StockMoveReview({
  isAr,
  lang,
  from,
  to,
  rows,
  money,
  notes,
  showPrice = true,
}: {
  isAr: boolean;
  lang: "ar" | "en";
  from: string;
  to: string;
  rows: readonly PickRow[];
  money: (amount: number) => string;
  notes?: string;
  showPrice?: boolean;
}) {
  const totals = pickTotals(rows);
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Place label={isAr ? "من" : "From"} name={from} />
        <Arrow className="size-4 text-muted-foreground" aria-hidden />
        <Place label={isAr ? "إلى" : "To"} name={to} />
      </div>
      <p className="text-sm">
        <b className="font-semibold">{countOf(totals.pieces, "piece", lang)}</b>
        {" · "}
        {countOf(totals.lines, "item", lang)}
        {showPrice && (
          <>
            {" · "}
            {isAr ? "بقيمة " : "worth "}
            <b className="font-semibold tabular-nums">{money(totals.value)}</b>
          </>
        )}
      </p>
      {pickGroups(rows).map((group) => (
        <section key={group.key} className="overflow-hidden rounded-xl border border-border">
          <h3 className="bg-muted/40 px-3 py-2 text-sm font-semibold text-page-start" dir="auto">
            {group.product}
          </h3>
          <ul className="divide-y divide-border-subtle border-t border-border-subtle text-sm">
            {group.rows.map((row) => (
              <li
                key={row.variantId}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block break-words text-page-start" dir="auto">
                    {row.option ?? (isAr ? "بلا مقاس" : "No options")}
                  </span>
                  {(row.code !== undefined || row.note) && (
                    <span className="block text-xs text-muted-foreground">
                      {row.code !== undefined
                        ? row.code
                          ? `${isAr ? "الكود" : "Code"} ${row.code}`
                          : isAr
                            ? "بلا كود"
                            : "No code"
                        : row.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-end tabular-nums">
                  <span className="block font-medium">× {row.quantity}</span>
                  {showPrice && row.price !== undefined && (
                    <span className="block text-xs text-muted-foreground">{money(row.price)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {notes?.trim() && (
        <p className="break-words rounded-lg bg-muted/40 p-3 text-sm text-page-start" dir="auto">
          {notes.trim()}
        </p>
      )}
    </div>
  );
}

function Place({ label, name }: { label: string; name: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-semibold text-page-start" dir="auto">
        {name}
      </p>
    </div>
  );
}
