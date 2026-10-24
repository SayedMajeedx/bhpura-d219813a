import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TransferRowState } from "@/features/incubators/lib/batch-transfer";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/use-media-query";

type RowsProps = {
  rows: TransferRowState[];
  productName: string;
  isAr: boolean;
  /** The store's currency as a label ("د.ب" / "BHD"). */
  money: string;
  onTick: (variantIds: string[], selected: boolean) => void;
  onUpdate: (variantId: string, patch: Partial<TransferRowState>) => void;
};

const tickLabel = (row: TransferRowState, productName: string, isAr: boolean) =>
  row.totalAvailable <= 0
    ? isAr
      ? `${productName} ${row.variantLabel}: لا توجد قطع للتحويل`
      : `${productName} ${row.variantLabel}: nothing to transfer`
    : isAr
      ? `تحويل ${productName} ${row.variantLabel}`
      : `Transfer ${productName} ${row.variantLabel}`;

/**
 * A product's sizes in the transfer: a card per size on a phone (the five-column table was
 * squeezed into 359px), the table from `sm` up. Both send the same changes.
 */
export function TransferSizeRows(props: RowsProps) {
  // One layout at a time: rendering both and hiding one doubled every field.
  const phone = useMediaQuery(PHONE_QUERY);
  if (!phone) return <SizeTable {...props} />;
  return (
    <ul className="divide-y divide-border/40">
      {props.rows.map((row) => (
        <SizeCard key={row.variantId} row={row} {...props} />
      ))}
    </ul>
  );
}

function SizeCard({
  row,
  productName,
  isAr,
  money,
  onTick,
  onUpdate,
}: RowsProps & { row: TransferRowState }) {
  const id = useId();
  const zero = row.totalAvailable <= 0;
  const exceeding = row.transferQty > row.totalAvailable;
  const setQty = (qty: number) =>
    onUpdate(row.variantId, { transferQty: Math.max(0, Math.min(row.totalAvailable, qty)) });

  return (
    <li className={`space-y-2.5 p-3 ${row.selected ? "" : "bg-muted/20"}`}>
      <div className="flex items-start gap-3">
        <input
          id={`${id}-tick`}
          type="checkbox"
          checked={row.selected}
          disabled={zero}
          onChange={(e) => onTick([row.variantId], e.target.checked)}
          aria-label={tickLabel(row, productName, isAr)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-border text-primary disabled:cursor-not-allowed"
        />
        <label htmlFor={`${id}-tick`} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
            {row.variantLabel}
            {row.color && (
              <Badge variant="outline" className="px-1 py-0 text-xs font-normal">
                {row.color}
              </Badge>
            )}
          </span>
          {row.sku && (
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {row.sku}
            </span>
          )}
        </label>
        <Badge
          variant="outline"
          className={`shrink-0 px-1.5 py-0.5 text-xs font-bold ${
            zero
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {isAr ? "متاح: " : "In stock: "}
          {row.totalAvailable}
        </Badge>
      </div>

      {row.selected && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 ps-8">
          <div className="space-y-1">
            <label htmlFor={`${id}-qty`} className="text-xs text-muted-foreground">
              {isAr ? "الكمية" : "Quantity"}
            </label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                disabled={row.transferQty <= 0}
                onClick={() => setQty(row.transferQty - 1)}
                aria-label={
                  isAr ? `قطعة أقل من ${row.variantLabel}` : `One less ${row.variantLabel}`
                }
              >
                <Minus className="size-4" />
              </Button>
              <Input
                id={`${id}-qty`}
                type="number"
                inputMode="numeric"
                min="0"
                max={row.totalAvailable}
                value={row.transferQty}
                onChange={(e) => setQty(parseInt(e.target.value) || 0)}
                className={`h-9 min-w-0 px-1 text-center font-mono text-sm font-bold ${
                  exceeding ? "border-destructive text-destructive" : ""
                }`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                disabled={row.transferQty >= row.totalAvailable}
                onClick={() => setQty(row.transferQty + 1)}
                aria-label={
                  isAr ? `قطعة أكثر من ${row.variantLabel}` : `One more ${row.variantLabel}`
                }
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-price`} className="text-xs text-muted-foreground">
              {isAr ? `السعر (${money})` : `Price (${money})`}
            </label>
            <Input
              id={`${id}-price`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={row.consignmentPrice}
              onChange={(e) =>
                onUpdate(row.variantId, { consignmentPrice: parseFloat(e.target.value) || 0 })
              }
              className="h-9 text-center font-mono text-sm"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label htmlFor={`${id}-code`} className="text-xs text-muted-foreground">
              {isAr ? "كود المحل الشريك (اختياري)" : "Partner's code (optional)"}
            </label>
            <Input
              id={`${id}-code`}
              value={row.externalCode}
              onChange={(e) => onUpdate(row.variantId, { externalCode: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          {exceeding && (
            <p role="alert" className="col-span-2 text-xs font-medium text-destructive">
              {isAr ? "أكثر من المتوفر" : "More than is in stock"}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function SizeTable({ rows, productName, isAr, money, onTick, onUpdate }: RowsProps) {
  return (
    <table className="w-full divide-y divide-border/40 text-end text-xs">
      <thead className="bg-muted/15 text-xs font-semibold text-muted-foreground">
        <tr>
          <th className="w-8 p-2.5 text-center"></th>
          <th className="p-2.5">{isAr ? "المقاس والرمز" : "Size & SKU"}</th>
          <th className="p-2.5 text-center">{isAr ? "المتوفر" : "In stock"}</th>
          <th className="w-36 p-2.5 text-center">{isAr ? "الكمية" : "Quantity"}</th>
          <th className="w-32 p-2.5 text-center">{isAr ? "سعر المحل الشريك" : "Partner price"}</th>
          <th className="w-32 p-2.5">{isAr ? "كود المحل الشريك" : "Partner's code"}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/30">
        {rows.map((row) => {
          const exceeding = row.transferQty > row.totalAvailable;
          const zero = row.totalAvailable <= 0;
          return (
            <tr
              key={row.variantId}
              className={
                row.selected ? "bg-background hover:bg-muted/10" : "bg-muted/20 opacity-60"
              }
            >
              <td className="p-2.5 text-center">
                <input
                  type="checkbox"
                  checked={row.selected}
                  disabled={zero}
                  onChange={(e) => onTick([row.variantId], e.target.checked)}
                  aria-label={tickLabel(row, productName, isAr)}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-border text-primary disabled:cursor-not-allowed"
                />
              </td>
              <td className="p-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <span>{row.variantLabel}</span>
                  {row.color && (
                    <Badge variant="outline" className="px-1 py-0 text-xs font-normal">
                      {row.color}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{row.sku}</div>
              </td>
              <td className="p-2.5 text-center">
                <Badge
                  variant="outline"
                  className={`px-1.5 py-0.5 text-xs font-bold ${
                    zero
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-success/40 bg-success/10 text-success"
                  }`}
                >
                  {row.totalAvailable}
                </Badge>
              </td>
              <td className="p-2.5">
                <div className="flex items-center justify-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max={row.totalAvailable}
                    value={row.transferQty}
                    disabled={!row.selected}
                    aria-label={isAr ? `كمية ${row.variantLabel}` : `${row.variantLabel} quantity`}
                    onChange={(e) =>
                      onUpdate(row.variantId, {
                        transferQty: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className={`h-8 w-20 text-center font-mono text-xs font-bold ${
                      exceeding ? "border-destructive text-destructive" : ""
                    }`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!row.selected || zero}
                    onClick={() => onUpdate(row.variantId, { transferQty: row.totalAvailable })}
                    className="h-8 px-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    {isAr ? "الكل" : "Max"}
                  </Button>
                </div>
                {exceeding && (
                  <div className="mt-0.5 text-center text-xs font-medium text-destructive">
                    {isAr ? "أكثر من المتوفر" : "More than is in stock"}
                  </div>
                )}
              </td>
              <td className="p-2.5">
                <div className="flex items-center justify-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={row.consignmentPrice}
                    disabled={!row.selected}
                    aria-label={isAr ? `سعر ${row.variantLabel}` : `${row.variantLabel} price`}
                    onChange={(e) =>
                      onUpdate(row.variantId, {
                        consignmentPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-8 w-24 text-center font-mono text-xs"
                  />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{money}</span>
                </div>
              </td>
              <td className="p-2.5">
                <Input
                  type="text"
                  placeholder={isAr ? "اختياري" : "Optional"}
                  value={row.externalCode}
                  disabled={!row.selected}
                  aria-label={isAr ? `كود ${row.variantLabel}` : `${row.variantLabel} code`}
                  onChange={(e) => onUpdate(row.variantId, { externalCode: e.target.value })}
                  className="h-8 text-xs"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
