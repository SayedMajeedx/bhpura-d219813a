import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidateSupplierOrders } from "@/lib/data/supplier-orders";
import { setPiecePrice } from "@/lib/data/supplier-orders/workshop";
import { roundCost } from "../lib/landed-cost";
import { supplierOrderError } from "../lib/errors";

/**
 * "Price to add" on a customer's piece sent by staff who cannot see costs, with the field finance
 * staff type it in. Saving clears the mark; the order's total then counts it.
 */
export function PiecePriceField({
  brandId,
  itemId,
  description,
  canPrice,
  lang,
}: {
  brandId: string;
  itemId: string;
  description: string;
  /** Finance staff: they type the price; anyone else only reads that it is missing. */
  canPrice: boolean;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const id = useId();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const amount = Number(value);
  const valid =
    value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && roundCost(amount) === amount;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await setPiecePrice(itemId, amount);
      await invalidateSupplierOrders(qc, brandId);
      setValue("");
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs">
      <span className="font-semibold">{isAr ? "السعر لم يُضف بعد" : "Price to add"}</span>
      {canPrice && (
        <>
          <label htmlFor={id} className="sr-only">
            {isAr ? `سعر ${description}` : `Price of ${description}`}
          </label>
          <Input
            id={id}
            inputMode="decimal"
            placeholder="0.000"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 w-24 font-mono tabular-nums pointer-coarse:h-11"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 pointer-coarse:h-11"
            disabled={!valid || saving}
            onClick={save}
          >
            {isAr ? "احفظ السعر" : "Save price"}
          </Button>
        </>
      )}
    </div>
  );
}
