import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { BulkBatchControls } from "@/features/inventory/components/BulkVariantPreview";
import { batchSalePriceValue } from "@/features/inventory/lib/bulk-variants";
import type { BulkVariantRow } from "@/features/inventory/types";

/** Apply-to-all stock and sale price for the bulk variant preview rows. */
export function useBulkBatchControls(
  setRows: Dispatch<SetStateAction<BulkVariantRow[]>>,
  basePrice: number,
  isAr: boolean,
): BulkBatchControls {
  const [mainStock, setMainStock] = useState<string>("");
  const [incubatorStock, setIncubatorStock] = useState<string>("");
  const [salePrice, setSalePrice] = useState<string>("");

  const applyMainStock = () => {
    const val = parseInt(mainStock, 10);
    if (isNaN(val) || val < 0) return;
    setRows((current) => current.map((row) => ({ ...row, stock_main: val })));
    setMainStock("");
  };

  const applyIncubatorStock = () => {
    const val = parseInt(incubatorStock, 10);
    if (isNaN(val) || val < 0) return;
    setRows((current) => current.map((row) => ({ ...row, stock_incubator: val })));
    setIncubatorStock("");
  };

  const applySalePrice = () => {
    const formatted = batchSalePriceValue(salePrice, basePrice);
    if (formatted === null) {
      toast.error(isAr ? "سعر التخفيض غير صالح" : "Invalid sale price");
      return;
    }
    setRows((current) => current.map((row) => ({ ...row, sale_price: formatted })));
    setSalePrice("");
  };

  return {
    mainStock,
    setMainStock,
    applyMainStock,
    incubatorStock,
    setIncubatorStock,
    applyIncubatorStock,
    salePrice,
    setSalePrice,
    applySalePrice,
  };
}
