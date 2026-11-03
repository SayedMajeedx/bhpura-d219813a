import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SizeChoicesField } from "@/components/inventory/SizeChoicesField";
import { FirstSizePiecesPicker } from "@/features/inventory/components/FirstSizePiecesPicker";
import { useInventoryAxisDefaults } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { describeVariantAxes } from "@/lib/variant-axes";
import type { ProductVariantLabels } from "@/lib/addons/addon-registry";
import { usualSizes } from "@/lib/size-choices";
import { useAddOrderSizes } from "../hooks/use-add-order-sizes";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";
import {
  defaultQuestion,
  orderFirstSizes,
  planNewSizes,
  wantedSizes,
  type SizeChoice,
} from "../lib/new-sizes";

const choiceLabel = (choice: SizeChoice) => [choice.size, choice.color].filter(Boolean).join(" / ");

/** The colours the store's sizes carry, the most used first. */
function usualColors(variants: ReadonlyArray<{ color: string | null }>): string[] {
  const counts = new Map<string, number>();
  for (const v of variants) {
    const color = v.color?.trim();
    if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([color]) => color);
}

/**
 * Sizes or colours a product does not have yet, added from a supplier's order: in the store's own
 * words for its options, the store's usual ones a tap away. What is asked for is matched against
 * the product first (`planNewSizes`), so a size it has is just ordered, an archived one comes back
 * with its history, and only the rest are made.
 */
export function AddSizesDialog({
  open,
  onOpenChange,
  brandId,
  productId,
  onThisOrder,
  catalog,
  lang,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  productId: string;
  /** Whether this order already orders a size (its default, perhaps). */
  onThisOrder: (variantId: string) => boolean;
  catalog: SupplierCatalog;
  lang: "ar" | "en";
  /** Every size asked for, by id, once saved. */
  onAdded: (variantIds: string[]) => void;
}) {
  const isAr = lang === "ar";
  const product = catalog.productById.get(productId);
  const inUse = useMemo(() => catalog.sizes.get(productId) ?? [], [catalog.sizes, productId]);
  const archived = useMemo(
    () => catalog.archivedSizes.get(productId) ?? [],
    [catalog.archivedSizes, productId],
  );
  const axisDefaults = useInventoryAxisDefaults(brandId);
  const words = useMemo(() => {
    const axes = describeVariantAxes({
      product: (product ?? null) as ProductVariantLabels | null,
      variants: [{ size: "x", color: "x" }],
      addonDefaults: axisDefaults,
      lang,
    });
    return {
      size: axes.find((axis) => axis.field === "size")?.label || (isAr ? "المقاس" : "Size"),
      color: axes.find((axis) => axis.field === "color")?.label || (isAr ? "اللون" : "Colour"),
    };
  }, [product, axisDefaults, lang, isAr]);

  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [becomeAt, setBecomeAt] = useState(0);
  const { add, saving } = useAddOrderSizes(brandId, isAr);
  useEffect(() => {
    if (!open) return;
    setSizes([]);
    setColors([]);
    setBecomeAt(0);
  }, [open]);

  const plan = useMemo(
    () => planNewSizes(wantedSizes(sizes, colors), inUse, archived),
    [sizes, colors, inUse, archived],
  );
  const made = plan.filter((entry) => entry.kind === "new");
  const first = useMemo(() => orderFirstSizes(inUse, onThisOrder), [inUse, onThisOrder]);
  const asksDefault = first.kind === "become" && made.length > 0;

  const save = async () => {
    if (!product || plan.length === 0) return;
    const ids = await add({
      product,
      inUse,
      plan,
      first,
      becomeAt: Math.min(becomeAt, made.length - 1),
    });
    if (!ids) return;
    onAdded(ids);
    onOpenChange(false);
  };

  const group = (kind: "has" | "restore" | "new") =>
    plan.filter((entry) => entry.kind === kind).map((entry) => choiceLabel(entry.choice));
  const lines: Array<[string, string[]]> = [
    [isAr ? "جديدة، تُضاف إلى المنتج" : "New, added to the product", group("new")],
    [
      isAr ? "حُذفت من قبل، تعود بسجلها" : "Removed before, back with their history",
      group("restore"),
    ],
    [isAr ? "موجودة في المنتج" : "Already on the product", group("has")],
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>{isAr ? "إضافة مقاس أو لون" : "Add a size or colour"}</DialogTitle>
          <DialogDescription>
            <span dir="auto" className="break-words">
              {catalog.productName(productId)}
            </span>
            {" · "}
            {isAr
              ? "تُضاف إلى المنتج بسعره وبلا مخزون، وتدخل القطع والتكلفة عند الاستلام."
              : "They join the product at its price with no stock; pieces and cost come with the receiving."}
          </DialogDescription>
        </DialogHeader>

        <SizeChoicesField
          legend={words.size}
          offered={usualSizes(catalog.variants)}
          sizes={sizes}
          onSizes={setSizes}
          hint={isAr ? "اختر مقاساً أو أكثر، أو اكتبه." : "Choose one or more, or type one."}
          isAr={isAr}
        />
        <SizeChoicesField
          legend={words.color}
          offered={usualColors(catalog.variants)}
          sizes={colors}
          onSizes={setColors}
          another={
            isAr
              ? words.color === "اللون"
                ? "لون آخر"
                : "خيار آخر"
              : `Another ${words.color.toLowerCase()}`
          }
          hint={
            isAr
              ? "اختياري: كل مقاس مختار بكل لون مختار."
              : "Optional: every size chosen in every colour chosen."
          }
          isAr={isAr}
        />

        {plan.length > 0 && (
          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
            {lines
              .filter(([, labels]) => labels.length > 0)
              .map(([title, labels]) => (
                <p key={title} className="min-w-0 break-words">
                  <span className="font-semibold">{title}: </span>
                  <span dir="auto">{labels.join(isAr ? "، " : ", ")}</span>
                </p>
              ))}
          </div>
        )}

        {asksDefault && first.kind === "become" && (
          <FirstSizePiecesPicker
            pieces={first.pieces}
            options={made.map((entry) => choiceLabel(entry.choice))}
            chosen={Math.min(becomeAt, made.length - 1)}
            onChoose={setBecomeAt}
            question={defaultQuestion(first.pieces, isAr)}
            isAr={isAr}
          />
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isAr ? "تراجع" : "Cancel"}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || plan.length === 0}>
            {isAr ? "إضافة إلى الطلبية" : "Add to the order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
